import fs, { ReadStream, WriteStream } from 'fs';
import { Logger } from '@w3f/logger';
import { DeriveAccountRegistration } from '@polkadot/api-derive/accounts/types';
import { EraIndex, Event } from '@polkadot/types/interfaces';
import { ApiPromise } from '@polkadot/api';
import { EraLastBlock } from './types';

export const isDirEmpty = (path: string): boolean =>{
  return fs.readdirSync(path).length === 0
}

export const isDirExistent = (path: string): boolean =>{
  return fs.existsSync(path)
}

export const makeDir = (path: string): void =>{
  fs.mkdirSync(path)
}

export const getFileNames = (sourceDir: string, logger: Logger): string[] =>{

  let names = []
  try {
    names = fs.readdirSync(sourceDir)
  } catch (error) {
    logger.error(error)
  } 
  return names
}

export const deleteFile = (filePath: string, logger: Logger): void =>{
    
  try {
    fs.unlinkSync(filePath)
    logger.info('deleted ' + filePath)
  } catch(err) {
    logger.error(err)
  }
}

export const initFile = (exportDir: string,fileName: string,logger: Logger): WriteStream => {

  const filePath = `${exportDir}/${fileName}`;
  const file = fs.createWriteStream(filePath);
  file.on('error', (err) => { logger.error(err.stack) });

  return file
}

export const closeFile = (file: WriteStream|ReadStream): Promise<void>=> {
  return new Promise(resolve => {
    file.on("close", resolve);
    file.close();
  });
}

export const getDisplayName = (identity: DeriveAccountRegistration): string =>{
  /* TODO
  This code is coming from https://github.com/mariopino/substrate-data-csv/blob/master/utils.js
  and needs to be refactored
  */

  if (
    identity.displayParent &&
    identity.displayParent !== `` &&
    identity.display &&
    identity.display !== ``
  ) {
    return `${identity.displayParent.replace(/\n/g, '')} / ${identity.display.replace(/\n/g, '')}`;
  } else {
    return identity.display || ``;
  }
}

const firstBlockCurrentEra = async (api: ApiPromise): Promise<number> => {

  const last = await api.rpc.chain.getHeader()
  const deriveSessionProgress = await api.derive.session.progress();  
  //there is an intrinsic api error that has to be corrected next => guessed
  const guessedFirstBlockCurrentEra = last.number.unwrap().toNumber() - deriveSessionProgress.eraProgress.toNumber() + 50 

  const hash = await api.rpc.chain.getBlockHash(guessedFirstBlockCurrentEra)
  const [_,firstBlockCurrentEra] = await api.query.babe.epochStart.at(hash)

  return firstBlockCurrentEra.toNumber()
}

const howManyErasAgo = async (eraIndex: EraIndex, api: ApiPromise): Promise<number> => {

  const currentEraIndex = (await api.query.staking.activeEra()).unwrap().index;
  return currentEraIndex.toNumber() - eraIndex.toNumber()
  
}

const lastBlockOf = async (eraIndex: EraIndex, api: ApiPromise): Promise<number> => {

  const howManyErasAgoVar = await howManyErasAgo(eraIndex, api)
  if (howManyErasAgoVar == 0) return (await api.rpc.chain.getHeader()).number.unwrap().toNumber()

  const lastBlockPreviousEra = await firstBlockCurrentEra(api) - 1  

  const deriveSessionProgress = await api.derive.session.progress();  

  // the api result is still not reliable => guessed
  const guessedResult = lastBlockPreviousEra - ( ( howManyErasAgoVar - 1 ) * deriveSessionProgress.eraLength.toNumber() )

  const hash = await api.rpc.chain.getBlockHash(guessedResult + 50)
  const [_,firstBlockNextTargetEra] = await api.query.babe.epochStart.at(hash)
  
  return firstBlockNextTargetEra.toNumber() - 1
  
}

export const erasLastBlock = async (indexes: EraIndex[], api: ApiPromise): Promise<EraLastBlock[]> => {

  const result = await Promise.all(indexes.map(async index => {
    return {era: index, block: await lastBlockOf(index,api)}
   }))

  return result

}

export const getErrorMessage = (error: unknown): string => {
  let errorString: string
  if (typeof error === "string") {
    errorString = error
  } else if (error instanceof Error) {
    errorString = error.message 
  }
  return errorString
}

export const delay = (ms: number): Promise<void> =>{
  return new Promise( resolve => setTimeout(resolve, ms) );
}

export const initWriteFileStream = (dirPath: string,fileName: string,logger: Logger): WriteStream => {

  const filePath = `${dirPath}/${fileName}`;
  const file = fs.createWriteStream(filePath);
  file.on('error', function(err) { logger.error(err.stack) });

  return file
}

export const initReadFileStream = (dirPath: string,fileName: string,logger: Logger): ReadStream => {

  const filePath = `${dirPath}/${fileName}`;
  const file = fs.createReadStream(filePath);
  file.on('error', function(err) { logger.error(err.stack) });

  return file
}

export const isNewEraEvent = (event: Event, api: ApiPromise): boolean => {
  return api.events.session.NewSession.is(event)
}