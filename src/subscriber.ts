import { ApiPromise, WsProvider } from '@polkadot/api';
import { BlockNumber, Header, SessionIndex, EraIndex } from '@polkadot/types/interfaces';
import { Compact } from '@polkadot/types/codec';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import {writeNominatorCSV, writeValidatorCSV} from './writeDataCSV'
import {DeriveSessionProgress} from '@polkadot/api-derive/session/types'
import {uploadFiles} from './bucket'
import fs from 'fs'

import {
    InputConfig,
} from './types';

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private exportDir: string;
    private bucketName: string;

    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.exportDir = cfg.exportDir;
        this.bucketName = cfg.bucketName;
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
    }

    private async _initInstanceVariables(): Promise<void>{
      this.sessionIndex = await this.api.query.session.currentIndex();
    }

    private async _handleNewHeadSubscriptions(): Promise<void> {
      false && await this._initCSVHandler(); //DEBUG
      false && this._uploadToBucket() //DEBUG
      
      this.api.rpc.chain.subscribeNewHeads(async (header) => {
        this._writeCSVHandler(header)
      })
    }

    private async _initCSVHandler(): Promise<void> {
      const deriveSessionProgress = await this.api.derive.session.progress();
      const network = this.chain.toString().toLowerCase()
      await this._writeCSV(this.api, network, this.exportDir, deriveSessionProgress.currentEra, this.sessionIndex, (await this.api.rpc.chain.getHeader()).number);
    }

    private async _writeCSVHandler(header: Header): Promise<void> {
      const deriveSessionProgress = await this.api.derive.session.progress();    
      if (this._isEndSessionBlock(deriveSessionProgress)) {
        const network = this.chain.toString().toLowerCase()
        await this._writeCSV(this.api, network, this.exportDir, deriveSessionProgress.currentEra, deriveSessionProgress.currentIndex, header.number); 
      }
    }

    private async _writeCSV(api: ApiPromise, network: string, exportDir: string, eraIndex: EraIndex, sessionIndex: SessionIndex, blockNumber: Compact<BlockNumber>): Promise<void> {
      const request = {api,network,exportDir,eraIndex,sessionIndex,blockNumber}
      const nominatorStaking = await writeNominatorCSV(request,this.logger);
      await writeValidatorCSV({...request,nominatorStaking},this.logger);
    }

    private _isEndSessionBlock(deriveSessionProgress: DeriveSessionProgress): boolean{
      
      if(this._isSessionChanging(deriveSessionProgress)) return false

      //it starts to write from the last 5 blocks of the session, just to be sure to not loose any session data
      return deriveSessionProgress.sessionLength.toNumber() - deriveSessionProgress.sessionProgress.toNumber() < 6
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
      this.bucketName && this._uploadToBucket()
    }

    private _uploadToBucket(): void{
      this.bucketName && uploadFiles(this.exportDir, this.bucketName)
    }
    
}
