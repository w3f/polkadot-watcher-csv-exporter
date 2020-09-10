import {Storage, Bucket} from '@google-cloud/storage'
import fs from 'fs'
import util from 'util'
import { BucketUploadConfig } from './types'
import { Logger } from '@w3f/logger';

function _deleteFile(filePath: string, logger: Logger): void{
  try {
    fs.unlinkSync(filePath)
    logger.info('deleted ' + filePath)
  } catch(err) {
    logger.error(err)
  }
}

async function _handleUploadFileToBucket(filePath: string,bucket: Bucket, logger: Logger): Promise<void>{
  bucket.upload(filePath, function(err, file, apiResponse) {
    if (err) {
      return logger.error('Unable to upload: ' + err.stack)
    } 
    logger.info('uploaded '+file.metadata.name+' to '+apiResponse.mediaLink)
    _deleteFile(filePath, logger)
  })
}

async function _getFileNames(sourceDir: string, logger: Logger): Promise<string[]>{
  const readdir = util.promisify(fs.readdir);
  let names = []
  try {
    names = await readdir(sourceDir)
  } catch (error) {
    logger.error(error)
  } 
  return names
}

export async function uploadFiles(sourceDir: string, bucketUploadConfig: BucketUploadConfig, logger: Logger): Promise<void> {

  const storage = new Storage({
    keyFilename: bucketUploadConfig.gcpServiceAccount,
    projectId: bucketUploadConfig.gcpProject
  });
  const bucket = storage.bucket(bucketUploadConfig.gcpBucketName);  

  const fileNames = await _getFileNames(sourceDir, logger)
  fileNames.forEach(fileName => {
    _handleUploadFileToBucket(sourceDir+'/'+fileName,bucket, logger)
  })
}
