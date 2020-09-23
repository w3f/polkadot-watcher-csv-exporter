import { ApiPromise, WsProvider } from '@polkadot/api';
import { BlockNumber, Header, SessionIndex, EraIndex, ActiveEraInfo } from '@polkadot/types/interfaces';
import { Compact } from '@polkadot/types/codec';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import { writeSessionCSV, writeEraCSV } from './writeDataCSV'
import { DeriveSessionProgress } from '@polkadot/api-derive/session/types'
import { BucketGCP } from './bucketGCP'
import fs from 'fs'

import {
    InputConfig, BucketUploadConfig,
} from './types';

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private activeEra: number;
    private exportDir: string;
    private isCSVBeingWritten: boolean;
    private logLevel: string;
    private isBucketEnabled: boolean;
    private bucket: BucketGCP;

    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.exportDir = cfg.exportDir;
        this.logLevel = cfg.logLevel;
        this.isBucketEnabled = cfg.bucketUpload.enabled;
        if(this.isBucketEnabled) this._initBucket(cfg.bucketUpload);
    }

    public async start(): Promise<void> {
        await this._initAPI();
        await this._initInstanceVariables();
        this._initExportDir();

        if(this.logLevel === 'debug') await this._triggerDebugActions()

        await this._handleNewHeadSubscriptions();
    }

    private _initBucket(config: BucketUploadConfig): void{
      this.bucket = new BucketGCP(config,this.logger)
    }

    private async _initAPI(): Promise<void> {
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

    private _initExportDir(): void{
      if (!fs.existsSync(this.exportDir)) {
        fs.mkdirSync(this.exportDir)
      }

      if(!this._isDirEmpty(this.exportDir)){
        this._uploadToBucket()
      }
    }

    private _isDirEmpty(path: string): boolean{
      return fs.readdirSync(path).length === 0
    }

    private async _initInstanceVariables(): Promise<void>{
      this.sessionIndex = await this.api.query.session.currentIndex();
      this.activeEra = (await this.api.query.staking.activeEra()).unwrap().index.toNumber();
      this._unlockCSVWwrite()
    }

    private async _handleNewHeadSubscriptions(): Promise<void> {

      this.api.rpc.chain.subscribeNewHeads(async (header) => {
        this._writeCSVHandler(header)
      })
    }

    private async _triggerDebugActions(): Promise<void>{
      this.logger.debug('debug mode active')
      await this._triggerDebugCSVWrite();
      this._uploadToBucket()
    }

    private async _triggerDebugCSVWrite(): Promise<void> {
      const deriveSessionProgress = await this.api.derive.session.progress();
      await this._writeSessionCSV(deriveSessionProgress.currentEra, this.sessionIndex, (await this.api.rpc.chain.getHeader()).number);
    }

    private async _writeCSVHandler(header: Header): Promise<void> {
      const deriveSessionProgress = await this.api.derive.session.progress();    
      if (this._isEndSessionBlock(deriveSessionProgress) && !this.isCSVBeingWritten) {
        await this._writeSessionCSV(deriveSessionProgress.currentEra, deriveSessionProgress.currentIndex, header.number)
      }

      if (this._isEndEraBlock(deriveSessionProgress) ) {
        await this._writeEraCSV(deriveSessionProgress.activeEra, deriveSessionProgress.currentIndex, header.number)
      }
      // await new Promise(r => setTimeout(r, 200000));
    }

    private async _writeSessionCSV(eraIndex: EraIndex, sessionIndex: SessionIndex, blockNumber: Compact<BlockNumber>): Promise<void> {
      const network = this.chain.toString().toLowerCase()
      const request = {api:this.api,network,exportDir:this.exportDir,eraIndex,sessionIndex,blockNumber}
      this._lockCSVWrite()
      writeSessionCSV(request, this.logger)
    }

    private async _writeEraCSV(eraIndex: EraIndex, sessionIndex: SessionIndex, blockNumber: Compact<BlockNumber>): Promise<void> {
      const network = this.chain.toString().toLowerCase()
      const request = {api:this.api,network,exportDir:this.exportDir,eraIndex,sessionIndex,blockNumber}
      this._lockCSVWrite()
      writeEraCSV(request, this.logger)
    }

    private _isEndSessionBlock(deriveSessionProgress: DeriveSessionProgress): boolean{
      
      if(this._isSessionChanging(deriveSessionProgress)) return false

      //it starts to write from the last few blocks of the session, just to be sure to not loose any session data being the deriveSessionProgress.sessionProgress not fully reliable
      //it not always reach the very last block and jumps it may jumps to the next session
      return deriveSessionProgress.sessionLength.toNumber() - deriveSessionProgress.sessionProgress.toNumber() < 2
    }

    private _isSessionChanging(deriveSessionProgress: DeriveSessionProgress): boolean{
      if(deriveSessionProgress.currentIndex > this.sessionIndex) {
        this._handleSessionChange(deriveSessionProgress.currentIndex)
        return true
      }
      return false
    }

    private _handleSessionChange(newSession: SessionIndex): void{
      this.sessionIndex = newSession
      this._unlockCSVWwrite()
      this._uploadToBucket()
    }

    private _isEndEraBlock(deriveSessionProgress: DeriveSessionProgress): boolean {
      
      if (this._isEraChanging(deriveSessionProgress)) return false

      return deriveSessionProgress.eraLength.toNumber() - deriveSessionProgress.eraProgress.toNumber() < 2
    }

    private _isEraChanging(deriveSessionProgress: DeriveSessionProgress): boolean{
      if (deriveSessionProgress.activeEra.toNumber() > this.activeEra){
        this._handleEraChange(deriveSessionProgress.activeEra.toNumber())
        return true
      }
      return false 
    }

    private _handleEraChange(newEra: number): void {
      this.activeEra = newEra
      this._unlockCSVWwrite()
      this._uploadToBucket()
    }

    private _uploadToBucket(): void{
      this.isBucketEnabled && this.bucket.uploadFiles(this.exportDir)
    }

    private _lockCSVWrite(): void{
      this.isCSVBeingWritten = true
    }

    private _unlockCSVWwrite(): void{
      this.isCSVBeingWritten = false
    }
    
}
