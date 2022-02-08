import { ApiPromise, WsProvider } from '@polkadot/api';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import { BucketGCP } from '../fileUploader'
import {
    InputConfig, BucketUploadConfig,
} from '../types';
import { isDirEmpty, isDirExistent, makeDir } from '../utils';

export abstract class SubscriberTemplate {
  protected chain: Text;
  protected api: ApiPromise;
  protected endpoint: string;

  protected exportDir: string;
  protected isBucketEnabled: boolean;
  protected bucket: BucketGCP;
    
    constructor(
        cfg: InputConfig,
        protected readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.exportDir = cfg.exportDir;
        this.isBucketEnabled = cfg.bucketUpload?.enabled ? cfg.bucketUpload.enabled : false;
        if(this.isBucketEnabled) this._initBucket(cfg.bucketUpload);
    }

    protected _initBucket = (config: BucketUploadConfig): void =>{
      this.bucket = new BucketGCP(config,this.logger)
    }

    protected _initAPI = async (): Promise<void> =>{

        const endpoints = this.endpoint.includes("kusama") ? [this.endpoint,'wss://kusama-rpc.polkadot.io'] : [this.endpoint,'wss://rpc.polkadot.io']
        const provider = new WsProvider(endpoints);
        this.api = await ApiPromise.create({provider,throwOnConnect:true,throwOnUnknown:true})
        this.api.on('error', (error) => {this.logger.warn("The API has an error"); console.log(error)})
        
        this.chain = await this.api.rpc.system.chain();
        const [nodeName, nodeVersion] = await Promise.all([
            this.api.rpc.system.name(),
            this.api.rpc.system.version()
        ]);
        this.logger.info(
            `You are connected to chain ${this.chain} using ${nodeName} v${nodeVersion}`
        );
    }

    protected _initExportDir = (): void =>{
      if ( ! isDirExistent(this.exportDir) ) {
        makeDir(this.exportDir)
      }

      if( ! isDirEmpty(this.exportDir)){
        this._uploadToBucket()
      }
    }

    protected _uploadToBucket = async (): Promise<void> =>{
      this.isBucketEnabled && await this.bucket.uploadCSVFiles(this.exportDir)
    }

}
