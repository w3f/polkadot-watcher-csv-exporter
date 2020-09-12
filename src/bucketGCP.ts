import {Storage, Bucket, StorageOptions} from '@google-cloud/storage'
import fs from 'fs'
import { BucketUploadConfig } from './types'
import { Logger } from '@w3f/logger';

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

  async uploadFiles(sourceDir: string): Promise<void> {
  
    const fileNames = this._getFileNames(sourceDir)
    for (const name in fileNames) {
      await this._handleUploadFileToBucket(sourceDir+'/'+name)
    }
  }

  private async _handleUploadFileToBucket(filePath: string): Promise<void>{
    try {
      const response = await this.bucket.upload(filePath)
      this.logger.info('uploaded '+response[0].metadata.name+' to '+response[1].mediaLink)
      this._deleteFile(filePath)
    } catch (error) {
      this.logger.error('Unable to upload: ' + error)
      process.exit(1);
    }
  }

  private _getFileNames(sourceDir: string): string[]{

    let names = []
    try {
      names = fs.readdirSync(sourceDir)
    } catch (error) {
      this.logger.error(error)
    } 
    return names
  }

  private _deleteFile(filePath: string): void{
    
    try {
      fs.unlinkSync(filePath)
      this.logger.info('deleted ' + filePath)
    } catch(err) {
      this.logger.error(err)
    }
  }
 
}
