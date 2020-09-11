import { ApiPromise, WsProvider } from '@polkadot/api';
import { BlockNumber, Header, SessionIndex, EraIndex } from '@polkadot/types/interfaces';
import { Compact } from '@polkadot/types/codec';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import {writeCSV} from './writeDataCSV'
import {DeriveSessionProgress} from '@polkadot/api-derive/session/types'
import {uploadFiles} from './bucket'
import fs from 'fs'

import {
    InputConfig, BucketUploadConfig,
} from './types';

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private exportDir: string;
    private bucketUpload: BucketUploadConfig;
    private isCSVBeingWritten: boolean;

    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.exportDir = cfg.exportDir;
        this.bucketUpload = cfg.bucketUpload;
    }

    public async start(): Promise<void> {
        await this._initAPI();
        await this._initInstanceVariables();
        this._initExportDir();

        await this._handleNewHeadSubscriptions();
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
      this._unlockCSVWwrite()
    }

    private async _handleNewHeadSubscriptions(): Promise<void> {
      true && await this._triggerDebugCSVWrite(); //DEBUG
      false && this._uploadToBucket() //DEBUG
      
      this.api.rpc.chain.subscribeNewHeads(async (header) => {
        this._writeCSVHandler(header)
      })
    }

    private async _triggerDebugCSVWrite(): Promise<void> {
      const deriveSessionProgress = await this.api.derive.session.progress();
      await this._writeCSV(deriveSessionProgress.currentEra, this.sessionIndex, (await this.api.rpc.chain.getHeader()).number);
    }

    private async _writeCSVHandler(header: Header): Promise<void> {
      const deriveSessionProgress = await this.api.derive.session.progress();    
      if (this._isEndSessionBlock(deriveSessionProgress) && !this.isCSVBeingWritten) {
        await this._writeCSV(deriveSessionProgress.currentEra, deriveSessionProgress.currentIndex, header.number); 
      }
    }

    private async _writeCSV(eraIndex: EraIndex, sessionIndex: SessionIndex, blockNumber: Compact<BlockNumber>): Promise<void> {
      const network = this.chain.toString().toLowerCase()
      const request = {api:this.api,network,exportDir:this.exportDir,eraIndex,sessionIndex,blockNumber}
      this._lockCSVWrite()
      writeCSV(request, this.logger)
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

    private _uploadToBucket(): void{
      this.bucketUpload.enabled && uploadFiles(this.exportDir, this.bucketUpload, this.logger)
    }

    private _lockCSVWrite(): void{
      this.isCSVBeingWritten = true
    }

    private _unlockCSVWwrite(): void{
      this.isCSVBeingWritten = false
    }
    
}
