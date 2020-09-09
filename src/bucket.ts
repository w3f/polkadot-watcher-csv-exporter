import {Storage, Bucket} from '@google-cloud/storage'
import fs from 'fs'
import util from 'util'

function _deleteFile(filePath: string): void{
  try {
    fs.unlinkSync(filePath)
    console.log('deleted', filePath)
  } catch(err) {
    console.error(err)
  }
}

async function _handleUploadFileToBucket(filePath: string,bucket: Bucket): Promise<void>{
  bucket.upload(filePath, function(err, file, apiResponse) {
    if (err) {
      return console.log('Unable to upload: ', err.stack);
    } 
    console.log('uploaded '+file.metadata.name+' to '+apiResponse.mediaLink)
    _deleteFile(filePath)
  })
}

async function _getFileNames(sourceDir: string): Promise<string[]>{
  const readdir = util.promisify(fs.readdir);
  let names = []
  try {
    names = await readdir(sourceDir)
  } catch (error) {
    console.log(error)
  } 
  return names
}

export async function uploadFiles(sourceDir: string,bucketName: string): Promise<void> {

  if(!process.env.GOOGLE_SERVICE_ACCOUNT){
    console.log('you need to set GOOGLE_SERVICE_ACCOUNT !!')
  }
  if(!process.env.GOOGLE_CLOUD_PROJECT){
    console.log('you need to set GOOGLE_CLOUD_PROJECT !!')
  }

  const storage = new Storage({
    keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT,
    projectId: process.env.GOOGLE_CLOUD_PROJECT
  });
  const bucket = storage.bucket(bucketName);  

  const fileNames = await _getFileNames(sourceDir)
  fileNames.forEach(fileName => {
    _handleUploadFileToBucket(sourceDir+'/'+fileName,bucket)
  })
}
