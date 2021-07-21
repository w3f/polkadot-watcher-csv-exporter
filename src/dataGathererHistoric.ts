/*eslint @typescript-eslint/no-use-before-define: ["error", { "variables": false }]*/

import { DeriveEraPoints } from '@polkadot/api-derive/staking/types';
import { MyDeriveStakingAccount, ChainData, WriteCSVHistoricalRequest } from "./types";
import { Logger } from '@w3f/logger';
import { ApiPromise } from '@polkadot/api';
import { getDisplayName, lasBlockOf } from './utils';
import { DeriveEraExposure } from '@polkadot/api-derive/staking/types' 
import BN from 'bn.js';

export const gatherChainDataHistorical = async (request: WriteCSVHistoricalRequest, logger: Logger): Promise<ChainData[]> =>{
  logger.info(`Historical Data gathering triggered...`)
  const data = await _gatherDataHistorical(request, logger)
  logger.info(`Historical Data have been gathered.`)
  return data
}

const _gatherDataHistorical = async (request: WriteCSVHistoricalRequest, logger: Logger): Promise<ChainData[]> =>{
  logger.debug(`gathering some data from the chain...`)
  const {api,eraIndexes} = request

  const tmp = await lasBlockOf(eraIndexes[0],api)
  console.log(`the last block of the era ${eraIndexes[0]} is: ${tmp}`)

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

    const myValidatorStaking = await _getEraHistoricValidatorStakingInfo(
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

const _getEraHistoricValidatorStakingInfo = async (api: ApiPromise, eraPoints: DeriveEraPoints, eraExposure: DeriveEraExposure): Promise<MyDeriveStakingAccount[]> => {
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
