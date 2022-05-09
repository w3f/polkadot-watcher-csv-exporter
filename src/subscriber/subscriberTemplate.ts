import { ApiPromise, WsProvider } from '@polkadot/api';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import { BucketGCP } from '../fileUploader'
import {
    InputConfig, BucketUploadConfig,
} from '../types';
import { isDirEmpty, isDirExistent, makeDir } from '../utils';
import { apiTimeoutMs } from '../constants';

export abstract class SubscriberTemplate {
  protected chain: Text;
  protected api: ApiPromise;
  protected apiTimeoutMs: number;
  protected endpoint: string;

  protected exportDir: string;
  protected isBucketEnabled: boolean;
  protected bucket: BucketGCP;
    
    constructor(
        cfg: InputConfig,
        protected readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.apiTimeoutMs = cfg.apiTimeoutMs ? cfg.apiTimeoutMs : apiTimeoutMs
        this.exportDir = cfg.exportDir;
        this.isBucketEnabled = cfg.bucketUpload?.enabled ? cfg.bucketUpload.enabled : false;
        if(this.isBucketEnabled) this._initBucket(cfg.bucketUpload);
    }

    protected _initBucket = (config: BucketUploadConfig): void =>{
      this.bucket = new BucketGCP(config,this.logger)
    }

    protected _initAPI = async (): Promise<void> =>{

        const endpoints = [this.endpoint] //one could define more than one endpoint
        const provider = new WsProvider(endpoints,undefined,undefined,this.apiTimeoutMs);
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
