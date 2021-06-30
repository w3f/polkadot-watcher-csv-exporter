/*eslint @typescript-eslint/no-use-before-define: ["error", { "variables": false }]*/

import { DeriveStakingAccount,DeriveEraPoints } from '@polkadot/api-derive/staking/types';
import { MyDeriveStakingAccount, WriteCSVRequest, ChainData, WriteCSVHistoricalRequest } from "./types";
import { Logger } from '@w3f/logger';
import { ApiPromise } from '@polkadot/api';
import { EraRewardPoints } from '@polkadot/types/interfaces';
import { getDisplayName } from './utils';
import { DeriveEraExposure } from '@polkadot/api-derive/staking/types' 
import BN from 'bn.js';

export const gatherChainData = async (request: WriteCSVRequest, logger: Logger): Promise<ChainData> =>{
  logger.info(`Data gathering triggered...`)
  const data = await _gatherData(request, logger)
  logger.info(`Data have been gathered.`)
  return data
}

const _gatherData = async (request: WriteCSVRequest, logger: Logger): Promise<ChainData> =>{
  logger.debug(`gathering some data from the chain...`)
  const {api,apiChunkSize,eraIndex} = request
  const eraPointsPromise = api.query.staking.erasRewardPoints(eraIndex);
  const eraExposures = await api.derive.staking.eraExposure(eraIndex)
  const totalIssuance =  await api.query.balances.totalIssuance()
  const validatorRewardsPreviousEra = (await api.query.staking.erasValidatorReward(eraIndex.sub(new BN(1)))).unwrap();
  logger.debug(`nominators...`)
  const nominatorStakingPromise = _getNominatorStaking(api,apiChunkSize,logger)
  const [nominatorStaking,eraPoints] = [await nominatorStakingPromise, await eraPointsPromise]
  logger.debug(`validators...`)
  const myValidatorStaking = await _getMyValidatorStaking(api,nominatorStaking,eraPoints, eraExposures, logger)

  return {
    eraPoints,
    totalIssuance,
    validatorRewardsPreviousEra,
    nominatorStaking,
    myValidatorStaking
  } as ChainData
}

const _getNominatorStaking = async (api: ApiPromise, apiChunkSize: number, logger: Logger): Promise<DeriveStakingAccount[]> =>{

  logger.debug(`getting the nominator entries...`)
  const nominators = await api.query.staking.nominators.entries();
  logger.debug(`got ${nominators.length} entries !!`)
  const nominatorAddresses = nominators.map(([address]) => ""+address.toHuman()[0]);

  logger.debug(`the nominator addresses size is ${nominatorAddresses.length}`)

  //A to big nominators set could make crush the API => Chunk splitting
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

const _getMyValidatorStaking = async (api: ApiPromise, nominatorsStakings: DeriveStakingAccount[], eraPoints: EraRewardPoints, eraExposures: DeriveEraExposure, logger: Logger): Promise<DeriveStakingAccount[]> =>{
  const validatorsAddresses = await api.query.session.validators();
  logger.debug(`the validator addresses size is ${validatorsAddresses.length}`)
  const validatorsStakings = await api.derive.staking.accounts(validatorsAddresses)

  const myValidatorStaking = Promise.all ( validatorsStakings.map( async validatorStaking => {

    const validatorAddress = validatorStaking.accountId
    const infoPromise = api.derive.accounts.info(validatorAddress);

    const validatorEraPoints = eraPoints.toJSON()['individual'][validatorAddress.toHuman()] ? eraPoints.toJSON()['individual'][validatorAddress.toHuman()] : 0

    const exposure = eraExposures.validators[validatorAddress.toHuman()] ? eraExposures.validators[validatorAddress.toHuman()] : {total:0,own:0,others:[]}

    let voters = 0;
    for (const staking of nominatorsStakings) {
      if (staking.nominators.includes(validatorAddress)) {
        voters++
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

// TODO get the validators waiting set
// const getWaitingValidatorsAccountId = async (api: ApiPromise, logger: Logger) => {
//     const skStashes = await api.query.staking.validators.keys()
//     const stashes = skStashes.map(sk => sk.args)
//     const active = await api.query.session.validators();
//     const waiting = stashes.filter((s) => !active.includes(s.toString()));
//     logger.info(waiting.length.toString())
// }

export const gatherChainDataHistorical = async (request: WriteCSVHistoricalRequest, logger: Logger): Promise<ChainData[]> =>{
  logger.info(`Historical Data gathering triggered...`)
  const data = await _gatherDataHistorical(request, logger)
  logger.info(`Data have been gathered.`)
  return data
}

const _gatherDataHistorical = async (request: WriteCSVHistoricalRequest, logger: Logger): Promise<ChainData[]> =>{
  logger.debug(`gathering some data from the chain...`)
  const {api,historySize} = request

  const erasHistoric = await api.derive.staking.erasHistoric(false);
  const eraIndexes = erasHistoric.slice(
    Math.max(erasHistoric.length - historySize, 0)
  )
  logger.info(`Requested eras: ${eraIndexes.map(era => era.toString()).join(', ')}`);
  logger.debug(`Gathering data ...`);

  const [
    erasPoints,
    erasRewards,
    erasExposures,
  ] = await Promise.all([
    api.derive.staking._erasPoints(eraIndexes,false),
    api.derive.staking._erasRewards(eraIndexes,false),
    api.derive.staking._erasExposure(eraIndexes,false),
  ]);

  const chainDataEras = Promise.all( eraIndexes.map( async index => {

    const myValidatorStaking = await getEraValidatorStakingInfo(
      api,
      erasPoints.find(({ era }) => era.eq(index)),
      erasExposures.find(({ era }) => era.eq(index)),
    );
    
    return {
      eraIndex: index,
      eraPoints: await api.query.staking.erasRewardPoints(index),
      totalIssuance: erasRewards.find(({ era }) => era.eq(index)).eraReward,
      validatorRewardsPreviousEra: (await api.query.staking.erasValidatorReward(index.sub(new BN(1)))).unwrap(),
      nominatorStaking: null,
      myValidatorStaking: myValidatorStaking
    } as ChainData
  }))

  return chainDataEras

}

const getEraValidatorStakingInfo = async (api: ApiPromise, eraPoints: DeriveEraPoints, eraExposure: DeriveEraExposure): Promise<MyDeriveStakingAccount[]> => {
  const eraValidatorAddresses = Object.keys(eraExposure['validators']);
  const eraNominatorAddresses = Object.keys(eraExposure['nominators']);
  return Promise.all(eraValidatorAddresses.map(async validatorAddress => {
    const validatorStaking = await api.derive.staking.account(validatorAddress);
    const { identity } = await api.derive.accounts.info(validatorAddress);
    const validatorEraPoints = eraPoints['validators'][validatorAddress] ? eraPoints['validators'][validatorAddress] : 0;
    const exposure = eraExposure.validators[validatorAddress] ? eraExposure.validators[validatorAddress] : {total:0,own:0,others:[]}  
    
    let voters = 0;
    for (const nominator of eraNominatorAddresses) {
      const nominations = eraExposure.nominators[nominator]
      for (const nomination of nominations) {
        if(nomination.validatorId.includes(validatorAddress)){
          voters ++
        }
      }
    }
  
    return {
      ...validatorStaking,
      displayName: getDisplayName(identity),
      voters: voters,
      exposure: exposure,
      eraPoints: validatorEraPoints,
    } as MyDeriveStakingAccount
  }))
}
