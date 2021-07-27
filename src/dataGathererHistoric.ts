/*eslint @typescript-eslint/no-use-before-define: ["error", { "variables": false }]*/

import { DeriveEraPoints } from '@polkadot/api-derive/staking/types';
import { MyDeriveStakingAccount, ChainData, WriteCSVHistoricalRequest, EraLastBlock } from "./types";
import { Logger } from '@w3f/logger';
import { ApiPromise } from '@polkadot/api';
import { getDisplayName, erasLastBlock as erasLastBlockFunction } from './utils';
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

  logger.info(`Requested eras: ${eraIndexes.map(era => era.toString()).join(', ')}`);
  logger.debug(`Gathering data ...`);

  const [
    erasPoints,
    erasRewards,
    erasExposures,
    erasLastBlock
  ] = await Promise.all([
    api.derive.staking._erasPoints(eraIndexes,false),
    api.derive.staking._erasRewards(eraIndexes,false),
    api.derive.staking._erasExposure(eraIndexes,false),
    erasLastBlockFunction(eraIndexes,api)
  ]);

  const chainDataEras = Promise.all( eraIndexes.map( async index => {

    const myValidatorStaking = await _getEraHistoricValidatorStakingInfo(
      api,
      erasPoints.find(({ era }) => era.eq(index)),
      erasExposures.find(({ era }) => era.eq(index)),
      erasLastBlock.find(({ era }) => era.eq(index)),
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

const _getEraHistoricValidatorStakingInfo = async (api: ApiPromise, eraPoints: DeriveEraPoints, eraExposure: DeriveEraExposure, eraLastBlock: EraLastBlock): Promise<MyDeriveStakingAccount[]> => {
  const eraValidatorAddresses = Object.keys(eraExposure['validators']);
  const nominators = await api.query.staking.nominators.entriesAt(await api.rpc.chain.getBlockHash(eraLastBlock.block))

  return Promise.all(eraValidatorAddresses.map(async validatorAddress => {
    const validatorStaking = await api.derive.staking.account(validatorAddress);
    const { identity } = await api.derive.accounts.info(validatorAddress);
    const validatorEraPoints = eraPoints['validators'][validatorAddress] ? eraPoints['validators'][validatorAddress] : 0;
    const exposure = eraExposure.validators[validatorAddress] ? eraExposure.validators[validatorAddress] : {total:0,own:0,others:[]}  
    
    let voters = 0;
    for (const nominator of nominators) {
      if(JSON.stringify(nominator[1]).includes(validatorAddress)) voters ++
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
