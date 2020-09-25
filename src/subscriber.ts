import { ApiPromise, WsProvider } from '@polkadot/api';
import { BlockNumber, Header, SessionIndex, EraIndex } from '@polkadot/types/interfaces';
import { Compact } from '@polkadot/types/codec';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import { writeCSV } from './writeDataCSV'
import { DeriveSessionProgress } from '@polkadot/api-derive/session/types'
import { BucketGCP } from './bucketGCP'

import {
    InputConfig, BucketUploadConfig,
} from './types';
import { isDirEmpty, isDirExistent, makeDir } from './utils';

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private exportDir: string;
    private isCSVBeingWritten: boolean;
    private logLevel: string;
    private isCronjobEnabled: boolean;
    private isBucketEnabled: boolean;
    private isUploadCompleted: boolean;
    private bucket: BucketGCP;

    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.exportDir = cfg.exportDir;
        this.logLevel = cfg.logLevel;
        this.isBucketEnabled = cfg.bucketUpload.enabled;
        this.isCronjobEnabled = cfg.cronjob.enabled;
        if(this.isBucketEnabled) this._initBucket(cfg.bucketUpload);
    }

    public start = async (): Promise<void> => {
        await this._initAPI();
        await this._initInstanceVariables();
        this._initExportDir();

        if(this.logLevel === 'debug') await this._triggerDebugActions()

        await this._handleNewHeadSubscriptions();
    }

    private _initBucket = (config: BucketUploadConfig): void =>{
      this.bucket = new BucketGCP(config,this.logger)
    }

    private _initAPI = async (): Promise<void> =>{
        const provider = new WsProvider(this.endpoint);
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
      this._handleBucketUploadNotCompleted()
      this._unlockCSVWwrite()
    }

    private _handleNewHeadSubscriptions = async (): Promise<void> =>{

      this.api.rpc.chain.subscribeNewHeads(async (header) => {
       
        await this._writeCSVHandler(header)

        this.isCronjobEnabled && this._handleCronJob()
      })
    }

    private  _triggerDebugActions = async (): Promise<void> => {
      this.logger.debug('debug mode active')
      false && await this._triggerDebugCSVWrite();
      false && this._uploadToBucket()
    }

    private _triggerDebugCSVWrite = async (): Promise<void> =>{
      const deriveSessionProgress = await this.api.derive.session.progress();
      await this._writeCSV(deriveSessionProgress.currentEra, this.sessionIndex, (await this.api.rpc.chain.getHeader()).number);
    }

    private  _handleCronJob = (): void =>{
       this.isUploadCompleted && process.exit()
    }

    private  _writeCSVHandler = async (header: Header): Promise<void> =>{
      const deriveSessionProgress = await this.api.derive.session.progress();    
      if (await this._isEndSessionBlock(deriveSessionProgress) && !this.isCSVBeingWritten) {
        this.logger.info(`starting the CSV writing for the session ${deriveSessionProgress.currentIndex}`)
        await this._writeCSV(deriveSessionProgress.currentEra, deriveSessionProgress.currentIndex, header.number); 
      }
    }

    private _writeCSV = async (eraIndex: EraIndex, sessionIndex: SessionIndex, blockNumber: Compact<BlockNumber>): Promise<void> => {
      const network = this.chain.toString().toLowerCase()
      const request = {api:this.api,network,exportDir:this.exportDir,eraIndex,sessionIndex,blockNumber}
      this._lockCSVWrite()
      await writeCSV(request, this.logger)
    }

    private _isEndSessionBlock = async (deriveSessionProgress: DeriveSessionProgress): Promise<boolean> =>{
      
      if(await this._isSessionChanging(deriveSessionProgress)) return false

      //it starts to write from the last few blocks of the session, just to be sure to not loose any session data being the deriveSessionProgress.sessionProgress not fully reliable
      //it not always reach the very last block and jumps it may jumps to the next session
      return deriveSessionProgress.sessionLength.toNumber() - deriveSessionProgress.sessionProgress.toNumber() < 3
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
      await this._uploadToBucket()
      this._handleBucketUploadCompleted()
    }

    private _uploadToBucket = async (): Promise<void> =>{
      this._handleBucketUploadNotCompleted()
      this.isBucketEnabled && await this.bucket.uploadCSVFiles(this.exportDir)
    }

    private _lockCSVWrite = (): void =>{
      this.isCSVBeingWritten = true
    }

    private _unlockCSVWwrite = (): void =>{
      this.isCSVBeingWritten = false
    }

    private _handleBucketUploadCompleted = (): void => {
      this.isUploadCompleted = true
    }

    private _handleBucketUploadNotCompleted = (): void => {
      this.isUploadCompleted = false
    }
    
}
