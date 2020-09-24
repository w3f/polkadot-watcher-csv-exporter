import {Storage, Bucket, StorageOptions} from '@google-cloud/storage'
import { BucketUploadConfig } from './types'
import { Logger } from '@w3f/logger';
import { getFileNames, deleteFile } from './utils';

export class BucketGCP { 
  private storageOptions: StorageOptions;
  private storage: Storage;
  private bucket: Bucket;

  constructor(bucketUploadConfig: BucketUploadConfig, private readonly logger: Logger) {
    this.storageOptions = {
      keyFilename: bucketUploadConfig.gcpServiceAccount,
      projectId: bucketUploadConfig.gcpProject
    }
    
    this.storage = new Storage(this.storageOptions);
    this.bucket = this.storage.bucket(bucketUploadConfig.gcpBucketName);
  }

  public uploadFiles = async (sourceDir: string): Promise<void> =>{
  
    const fileNames = getFileNames(sourceDir, this.logger)
    for (const name of fileNames) {
      await this._handleUploadFileToBucket(sourceDir+'/'+name)
    }
  }

  private _handleUploadFileToBucket = async (filePath: string): Promise<void> =>{
    try {
      const response = await this.bucket.upload(filePath)
      this.logger.info('uploaded '+response[0].metadata.name+' to '+response[1].mediaLink)
      deleteFile(filePath, this.logger)
    } catch (error) {
      this.logger.error(`Unable to upload ${filePath} because: ` + error)
      //process.exit(1);
    }
  }
 
}
