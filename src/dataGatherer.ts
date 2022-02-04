/*eslint @typescript-eslint/no-use-before-define: ["error", { "variables": false }]*/

import { DeriveStakingAccount, DeriveEraExposure } from '@polkadot/api-derive/staking/types';
import { MyDeriveStakingAccount, WriteCSVRequest, ChainData, Voter } from "./types";
import { Logger } from '@w3f/logger';
import { ApiPromise } from '@polkadot/api';
import { EraRewardPoints } from '@polkadot/types/interfaces';
import { delay, getDisplayName, getErrorMessage } from './utils';
import BN from 'bn.js';

export const gatherChainData = async (request: WriteCSVRequest, logger: Logger): Promise<ChainData> =>{

  logger.info(`Data gathering triggered...`)
  const data = await _handleConnectionRetries(_gatherData,request,logger)
  logger.info(`Data have been gathered.`)
  return data
}

/* eslint-disable  @typescript-eslint/no-explicit-any */
const _handleConnectionRetries = async (f: { (request: WriteCSVRequest, logger: Logger): Promise<ChainData> }, request: WriteCSVRequest, logger: Logger): Promise<ChainData> => {
  let attempts = 0
  for(;;){
    try {
      const data = await f(request,logger)
      return data
    } catch (error) {
      logger.error(`Could not process the Data gathering...`);
      const errorMessage = getErrorMessage(error)
      if(
        !errorMessage.includes("Unable to decode using the supplied passphrase") && //there is no way to recover from this
        ++attempts < 5 
        ){
        logger.warn(`Retrying...`)
        await delay(5000) //wait x seconds before retrying
      }
      else{
        throw error
      }
    }
  }
}
/* eslint-enable  @typescript-eslint/no-explicit-any */

const _gatherData = async (request: WriteCSVRequest, logger: Logger): Promise<ChainData> =>{
  logger.debug(`gathering some data from the chain...`)
  const {api,apiChunkSize,eraIndex} = request
  const eraPointsPromise = api.query.staking.erasRewardPoints(eraIndex);
  const eraExposures = await api.derive.staking.eraExposure(eraIndex)
  const totalIssuance =  await api.query.balances.totalIssuance()
  const validatorRewardsPreviousEra = (await api.query.staking.erasValidatorReward(eraIndex.sub(new BN(1)))).unwrap();
  logger.debug(`nominators...`); console.time('get nominators');
  const nominatorStakingPromise = _getNominatorStaking(api,apiChunkSize,logger)
  const [nominatorStaking,eraPoints] = [await nominatorStakingPromise, await eraPointsPromise]
  console.timeEnd('get nominators')
  logger.debug(`validators...`); console.time('get validators')
  const myValidatorStaking = await _getMyValidatorStaking(api,nominatorStaking,eraPoints, eraExposures, logger)
  console.timeEnd('get validators')
  logger.debug(`waiting validators...`); console.time('get waiting validators')
  const myWaitingValidatorStaking = await _getMyWaitingValidatorStaking(api,nominatorStaking,eraPoints, eraExposures, logger)
  console.timeEnd('get waiting validators')

  return {
    eraPoints,
    totalIssuance,
    validatorRewardsPreviousEra,
    nominatorStaking,
    myValidatorStaking,
    myWaitingValidatorStaking
  } as ChainData
}

const _getNominatorStaking = async (api: ApiPromise, apiChunkSize: number, logger: Logger): Promise<DeriveStakingAccount[]> =>{

  logger.debug(`getting the nominator entries...`)
  const nominators = await api.query.staking.nominators.entries();
  logger.debug(`got ${nominators.length} entries !!`)
  const nominatorAddresses = nominators.map(([address]) => ""+address.toHuman()[0]);

  logger.debug(`the nominator addresses size is ${nominatorAddresses.length}`)

  //A too big nominators set could make crush the API => Chunk splitting
  const size = apiChunkSize
  const nominatorAddressesChucked = []
  for (let i = 0; i < nominatorAddresses.length; i += size) {
    const chunk = nominatorAddresses.slice(i, i + size)
    nominatorAddressesChucked.push(chunk)
  } 

  const nominatorsStakings: DeriveStakingAccount[] = []
  for (const chunk of nominatorAddressesChucked) {
    logger.debug(`the handled chunk size is ${chunk.length}`)
    nominatorsStakings.push(...await api.derive.staking.accounts(chunk))
  }

  return nominatorsStakings
}

const _getMyValidatorStaking = async (api: ApiPromise, nominatorsStakings: DeriveStakingAccount[], eraPoints: EraRewardPoints, eraExposures: DeriveEraExposure, logger: Logger): Promise<MyDeriveStakingAccount[]> =>{
  const validatorsAddresses = await api.query.session.validators();
  logger.debug(`the validator addresses size is ${validatorsAddresses.length}`)
  const validatorsStakings = await api.derive.staking.accounts(validatorsAddresses)
  return await _buildMyValidatorStaking(api,validatorsStakings,nominatorsStakings,eraPoints,eraExposures)
}

const _getMyWaitingValidatorStaking = async (api: ApiPromise, nominatorsStakings: DeriveStakingAccount[], eraPoints: EraRewardPoints, eraExposures: DeriveEraExposure, logger: Logger): Promise<MyDeriveStakingAccount[]> => {
  const validatorsAddresses = await _getWaitingValidatorsAccountId(api)
  logger.debug(`the waiting validator addresses size is ${validatorsAddresses.length}`)
  const validatorsStakings = await api.derive.staking.accounts(validatorsAddresses)
  return await _buildMyValidatorStaking(api,validatorsStakings,nominatorsStakings,eraPoints,eraExposures)
}

const _buildMyValidatorStaking = async (api: ApiPromise, validatorsStakings: DeriveStakingAccount[], nominatorsStakings: DeriveStakingAccount[], eraPoints: EraRewardPoints, eraExposures: DeriveEraExposure): Promise<MyDeriveStakingAccount[]> =>{
  const myValidatorStaking = Promise.all ( validatorsStakings.map( async validatorStaking => {

    const validatorAddress = validatorStaking.accountId
    const infoPromise = api.derive.accounts.info(validatorAddress);

    const validatorEraPoints = eraPoints.toJSON()['individual'][validatorAddress.toHuman()] ? eraPoints.toJSON()['individual'][validatorAddress.toHuman()] : 0

    const exposure = eraExposures.validators[validatorAddress.toHuman()] ? eraExposures.validators[validatorAddress.toHuman()] : {total:0,own:0,others:[]}

    const voters: Voter[] = []
    for (const staking of nominatorsStakings) {
      if (staking.nominators.includes(validatorAddress)) {
        voters.push({address: staking.accountId.toString(), value: staking.stakingLedger.total })
      }
    }

    const {identity} = await infoPromise
    return {
      ...validatorStaking,
      displayName: getDisplayName(identity),
      voters: voters,
      exposure: exposure,
      eraPoints: validatorEraPoints,
    } as MyDeriveStakingAccount

  }))
  return myValidatorStaking
}

const _getWaitingValidatorsAccountId = async (api: ApiPromise): Promise<string[]> => {
  const skStashes = await api.query.staking.validators.keys()
  const stashes = skStashes.map(sk => sk.args)
  const active = await api.query.session.validators();
  const waiting = stashes.filter((s) => !active.includes(s.toString()));
  return waiting.map(account => account.toString())
}