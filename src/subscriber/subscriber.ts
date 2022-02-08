import { BlockNumber, Header, SessionIndex, EraIndex } from '@polkadot/types/interfaces';
import { Compact } from '@polkadot/types/codec';
import { Logger } from '@w3f/logger';
import { gatherChainData } from '../dataGatherer'
import { DeriveSessionProgress } from '@polkadot/api-derive/session/types'
import { apiChunkSize } from '../constants'

import {
    InputConfig,
} from '../types';
import { writeEraCSV, writeHistoricErasCSV, writeSessionCSV } from '../csvWriter';
import { gatherChainDataHistorical } from '../dataGathererHistoric';
import { SubscriberTemplate } from './subscriberTemplate';
import { ISubscriber } from './ISubscriber';

export class Subscriber extends SubscriberTemplate implements ISubscriber {

    private config: InputConfig

    private apiChunkSize: number;

    private isInitialWriteForced: boolean;
    private isDebugEnabled: boolean;
    private isCronjobEnabled: boolean;

    private sessionIndex: SessionIndex;
    private eraIndex: EraIndex;
    private isCSVWriting: boolean;
    private isCSVUploadable: boolean;

    private progress_delta: number //20 = two minutes before the ending of the session/era

    private historySize: number
    private isHistoricEnabled: boolean
    
    constructor(
        cfg: InputConfig,
        protected readonly logger: Logger) {
        super(cfg,logger)  
        this.config = cfg
        this.endpoint = cfg.endpoint;
        this.exportDir = cfg.exportDir;
        this.isDebugEnabled = cfg.debug?.enabled ? cfg.debug.enabled : false
        this.isInitialWriteForced = cfg.debug.forceInitialWrite
        this.isBucketEnabled = cfg.bucketUpload?.enabled ? cfg.bucketUpload.enabled : false;
        this.isCronjobEnabled = cfg.cronjob?.enabled ? cfg.cronjob?.enabled : false;
        this.progress_delta = cfg.endSessionBlockDistance
        this.apiChunkSize = cfg.apiChunkSize ? cfg.apiChunkSize : apiChunkSize
        this.historySize = cfg.historic?.historySize ? cfg.historic.historySize : 5 //default
        this.isHistoricEnabled = cfg.historic?.enabled ? cfg.historic.enabled : false
        if(this.isBucketEnabled) this._initBucket(cfg.bucketUpload);
    }

    public start = async (): Promise<void> => {
        
        await this._initAPI();
        await this._initInstanceVariables();
        this._initExportDir();

        this.isDebugEnabled && await this._triggerDebugActions()

        this.isHistoricEnabled && await this._triggerHistoricActions()

        await this._handleNewHeadSubscriptions();
    }

    private _initInstanceVariables = async (): Promise<void> =>{
      this.sessionIndex = await this.api.query.session.currentIndex();
      this.eraIndex = (await this.api.query.staking.activeEra()).unwrap().index;
      this._setCSVUploadable(false)
      this._unlockCSVWwrite()
    }

    private  _triggerDebugActions = async (): Promise<void> => {
      this.logger.info('debug mode active')
      this.isInitialWriteForced && await this._triggerDebugCSVWrite();
    }

    private _triggerDebugCSVWrite = async (): Promise<void> =>{
      await this._writeEraCSV(this.eraIndex,this.sessionIndex,(await this.api.rpc.chain.getHeader()).number)
      this._setCSVUploadable(true)
    }

    private _handleNewHeadSubscriptions = async (): Promise<void> =>{

      this.api.rpc.chain.subscribeNewHeads(async (header) => {
       
        await this._writeCSVHandler(header)

        await this._uploadCSVHandler()
        
      })
    }

    private  _triggerHistoricActions = async (): Promise<void> => {
      this.logger.info('Historic mode active')

      this.logger.info(`starting the CSV writing for the last ${this.historySize} eras`)

      this._lockCSVWrite()
      await this._writeEraCSVHistorical()
      this._setCSVUploadable(true)
    }

    private _uploadCSVHandler = async (): Promise<void> => {
      if(!this.isCSVUploadable) return
      this._setCSVUploadable(false)

      await this._uploadToBucket()
      this.isCronjobEnabled && await this._handleCronJob()
      this.isHistoricEnabled && await this._handleHistoricJob()
    }

    private  _handleCronJob = async(): Promise<void> =>{
      this.logger.info(`cronjob successfully ending...`)
      process.exit()
    }

    private  _handleHistoricJob = async(): Promise<void> =>{
      this.logger.info(`historic era gathering successfully ending...`)
      process.exit()
    }

    private  _writeCSVHandler = async (header: Header): Promise<void> =>{
      if(this._isCSVWriteLocked()) return

      const deriveSessionProgress = await this.api.derive.session.progress();    

      if (!this.config.sessionOnly == true && await this._isEndEraBlock(deriveSessionProgress)) {
        this.logger.info(`starting the CSV writing for the session ${deriveSessionProgress.currentIndex} and the era ${deriveSessionProgress.currentEra}`)

        this._lockCSVWrite()
        await this._writeEraCSV(deriveSessionProgress.activeEra, deriveSessionProgress.currentIndex, header.number)
        this._setCSVUploadable(true)
      }

      else if (await this._isEndSessionBlock(deriveSessionProgress)) {

        this.logger.info(`starting the CSV writing for the session ${deriveSessionProgress.currentIndex}`)
        
        this._lockCSVWrite()
        await this._writeSessionCSV(deriveSessionProgress.currentEra, deriveSessionProgress.currentIndex, header.number); 
        this._setCSVUploadable(true)
      }
    }

    private _writeEraCSV = async (eraIndex: EraIndex, sessionIndex: SessionIndex, blockNumber: Compact<BlockNumber>): Promise<void> => {
      const network = this.chain.toString().toLowerCase()
      const request = {api:this.api,network,apiChunkSize:this.apiChunkSize,exportDir:this.exportDir,eraIndex,sessionIndex,blockNumber}
      const chainData = await gatherChainData(request, this.logger)
      await writeSessionCSV(request, chainData, this.logger)
      await writeEraCSV(request, chainData, this.logger)
    }

    private _writeEraCSVHistorical = async (): Promise<void> => {
      const network = this.chain.toString().toLowerCase()

      const erasHistoric = await this.api.derive.staking.erasHistoric(false);
      const eraIndexes = erasHistoric.slice(
        Math.max(erasHistoric.length - this.historySize, 0)
      )
      this.logger.info(`Requested Historical data for eras: ${eraIndexes.map(era => era.toString()).join(', ')}`);

      //A to big number of era indexes could make crush the API => Chunk splitting
      const size = 10
      const eraIndexesChucked: EraIndex[][] = []
      for (let i = 0; i < eraIndexes.length; i += size) {
        const chunk = eraIndexes.slice(i, i + size)
        eraIndexesChucked.push(chunk)
      }
      
      for (const chunk of eraIndexesChucked) {
        this.logger.debug(`the handled chunk size is ${chunk.length}`)
        const request = {api:this.api,network,exportDir:this.exportDir,eraIndexes:chunk}
        const chainData = await gatherChainDataHistorical(request, this.logger)
        await writeHistoricErasCSV(request, chainData, this.logger)
      }

    }

    private _writeSessionCSV = async (eraIndex: EraIndex, sessionIndex: SessionIndex, blockNumber: Compact<BlockNumber>): Promise<void> => {
      const network = this.chain.toString().toLowerCase()
      const request = {api:this.api,network,apiChunkSize:this.apiChunkSize,exportDir:this.exportDir,eraIndex,sessionIndex,blockNumber}
      const chainData = await gatherChainData(request, this.logger)
      await writeSessionCSV(request, chainData, this.logger)
    }

    private _isEndEraBlock = async (deriveSessionProgress: DeriveSessionProgress): Promise<boolean> =>{

      if (await this._isEraChanging(deriveSessionProgress)) return false

      return deriveSessionProgress.eraLength.toNumber() - deriveSessionProgress.eraProgress.toNumber() < this.progress_delta
    }

    private _isEraChanging = async (deriveSessionProgress: DeriveSessionProgress): Promise<boolean> =>{
      if (deriveSessionProgress.activeEra > this.eraIndex){
        await this._handleEraChange(deriveSessionProgress.activeEra, deriveSessionProgress.currentIndex)
        return true
      }
      return false 
    }

    private _handleEraChange = async (newEra: EraIndex, newSession: SessionIndex): Promise<void> =>{
      this.eraIndex = newEra
      await this._handleSessionChange(newSession)
    }

    private _isEndSessionBlock = async (deriveSessionProgress: DeriveSessionProgress): Promise<boolean> =>{
      
      if(await this._isSessionChanging(deriveSessionProgress)) return false

      //it starts to write from the last few blocks of the session, just to be sure to not loose any session data being the deriveSessionProgress.sessionProgress not fully reliable.
      //Unfortunatly it not always reach the very last block and it may jumps directly to the next session.
      return deriveSessionProgress.sessionLength.toNumber() - deriveSessionProgress.sessionProgress.toNumber() < this.progress_delta
    }

    private _isSessionChanging = async (deriveSessionProgress: DeriveSessionProgress): Promise<boolean> =>{
      if(deriveSessionProgress.currentIndex > this.sessionIndex) {
        await this._handleSessionChange(deriveSessionProgress.currentIndex)
        return true
      }
      return false
    }

    private _handleSessionChange = async (newSession: SessionIndex): Promise<void> =>{
      this.sessionIndex = newSession
      this._unlockCSVWwrite()
    }

    private _lockCSVWrite = (): void =>{
      this.isCSVWriting = true
    }

    private _unlockCSVWwrite = (): void =>{
      this.isCSVWriting = false
    }

    private _isCSVWriteLocked = (): boolean =>{
      return this.isCSVWriting
    }

    private _setCSVUploadable = (status: boolean): void =>{
      this.isCSVUploadable = status
    }
    
}
