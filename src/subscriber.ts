import { ApiPromise, WsProvider } from '@polkadot/api';
import { BlockNumber, Header, SessionIndex, EraIndex } from '@polkadot/types/interfaces';
import { Compact } from '@polkadot/types/codec';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import { gatherChainData } from './dataGatherer'
import { DeriveSessionProgress } from '@polkadot/api-derive/session/types'
import { BucketGCP } from './fileUploader'
import { apiChunkSize } from './constants'

import {
    InputConfig, BucketUploadConfig,
} from './types';
import { isDirEmpty, isDirExistent, makeDir } from './utils';
import { writeEraCSV, writeSessionCSV } from './csvWriter';

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private apiChunkSize: number;
    private endpoint: string;

    private exportDir: string;
    private isInitialWriteForced: boolean;
    private isDebugEnabled: boolean;
    private isCronjobEnabled: boolean;
    private isBucketEnabled: boolean;
    private bucket: BucketGCP;

    private sessionIndex: SessionIndex;
    private eraIndex: EraIndex;
    private isCSVWriting: boolean;
    private isCSVUploadable: boolean;

    private progress_delta: number //20 = two minutes before the ending of the session/era
    
    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.exportDir = cfg.exportDir;
        this.isDebugEnabled = cfg.debug.enabled
        this.isInitialWriteForced = cfg.debug.forceInitialWrite
        this.isBucketEnabled = cfg.bucketUpload.enabled;
        this.isCronjobEnabled = cfg.cronjob.enabled;
        this.progress_delta = cfg.endSessionBlockDistance
        this.apiChunkSize = cfg.apiChunkSize ? cfg.apiChunkSize : apiChunkSize
        if(this.isBucketEnabled) this._initBucket(cfg.bucketUpload);
    }

    public start = async (): Promise<void> => {
        await this._initAPI();
        await this._initInstanceVariables();
        this._initExportDir();

        this.isDebugEnabled && await this._triggerDebugActions()

        await this._handleNewHeadSubscriptions();
    }

    private _initBucket = (config: BucketUploadConfig): void =>{
      this.bucket = new BucketGCP(config,this.logger)
    }

    private _initAPI = async (): Promise<void> =>{
        const provider = new WsProvider(this.endpoint);
        provider.on('error', error => {
          if(this.api == undefined) {
            this.logger.error(JSON.stringify("initAPI error:"+JSON.stringify(error)))
            process.exit(1)
          }
          else{
            this.logger.error(JSON.stringify("API error:"+JSON.stringify(error)))
          }
        })
        this.api = await ApiPromise.create({ provider });
        
        this.chain = await this.api.rpc.system.chain();
        const [nodeName, nodeVersion] = await Promise.all([
            this.api.rpc.system.name(),
            this.api.rpc.system.version()
        ]);
        this.logger.info(
            `You are connected to chain ${this.chain} using ${nodeName} v${nodeVersion}`
        );
    }

    private _initExportDir = (): void =>{
      if ( ! isDirExistent(this.exportDir) ) {
        makeDir(this.exportDir)
      }

      if( ! isDirEmpty(this.exportDir)){
        this._uploadToBucket()
      }
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

    private _uploadCSVHandler = async (): Promise<void> => {
      if(!this.isCSVUploadable) return
      this._setCSVUploadable(false)

      await this._uploadToBucket()
      this.isCronjobEnabled && await this._handleCronJob()
    }

    private _uploadToBucket = async (): Promise<void> =>{
      this.isBucketEnabled && await this.bucket.uploadCSVFiles(this.exportDir)
    }

    private  _handleCronJob = async(): Promise<void> =>{
      this.logger.info(`cronjob successfully ending...`)
      process.exit()
    }

    
    private  _writeCSVHandler = async (header: Header): Promise<void> =>{
      if(this._isCSVWriteLocked()) return

      const deriveSessionProgress = await this.api.derive.session.progress();    

      if (await this._isEndEraBlock(deriveSessionProgress)) {
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
