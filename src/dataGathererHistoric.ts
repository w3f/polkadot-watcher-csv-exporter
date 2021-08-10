/*eslint @typescript-eslint/no-use-before-define: ["error", { "variables": false }]*/

import { DeriveEraPoints } from '@polkadot/api-derive/staking/types';
import { MyDeriveStakingAccount, ChainData, WriteCSVHistoricalRequest, EraLastBlock, Voter } from "./types";
import { Logger } from '@w3f/logger';
import { ApiPromise } from '@polkadot/api';
import { getDisplayName, erasLastBlock as erasLastBlockFunction } from './utils';
import { DeriveEraExposure } from '@polkadot/api-derive/staking/types' 
import BN from 'bn.js';
import type { StakingLedger, Nominations } from '@polkadot/types/interfaces';

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

    logger.debug(`nominators...`)
    const nominators = await _getNominatorStaking(api,erasLastBlock.find(({ era }) => era.eq(index)),logger)
    logger.debug(`valdiators...`)
    const myValidatorStaking = await _getEraHistoricValidatorStakingInfo(
      api,
      erasPoints.find(({ era }) => era.eq(index)),
      erasExposures.find(({ era }) => era.eq(index)),
      nominators,
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

interface MyNominator {
  address: string;
  nominations: Nominations;
  ledger: StakingLedger;
}

const _getNominatorStaking = async (api: ApiPromise, eraLastBlock: EraLastBlock, logger: Logger): Promise<MyNominator[]> =>{

  const lastBlockHash = await api.rpc.chain.getBlockHash(eraLastBlock.block)
  logger.debug(`getting the nominator entries...`)
  const nominators = await api.query.staking.nominators.entriesAt(lastBlockHash)
  const stakingLedgers = await api.query.staking.ledger.entriesAt(lastBlockHash)
  logger.debug(`got ${nominators.length} nominator entries !!`)
  logger.debug(`got ${stakingLedgers.length} ledger entries !!`)

  const nominatorsStakings: MyNominator[] = []
  //TODO optimize
  for (const nominator of nominators) {
    for (const ledger of stakingLedgers) {
      if(ledger[0].toHuman().toString() == nominator[0].toHuman().toString()) {
        nominatorsStakings.push({
          "address": ledger[0].toHuman().toString(),
          "nominations": nominator[1].unwrap(),
          "ledger": ledger[1].unwrap()
        })
        break;
      }
    }
  }

  return nominatorsStakings
}



const _getEraHistoricValidatorStakingInfo = async (api: ApiPromise, eraPoints: DeriveEraPoints, eraExposure: DeriveEraExposure, nominators: MyNominator[]): Promise<MyDeriveStakingAccount[]> => {
  const eraValidatorAddresses = Object.keys(eraExposure['validators']);
  return Promise.all(eraValidatorAddresses.map(async validatorAddress => {
    const validatorStaking = await api.derive.staking.account(validatorAddress);
    const { identity } = await api.derive.accounts.info(validatorAddress);
    const validatorEraPoints = eraPoints['validators'][validatorAddress] ? eraPoints['validators'][validatorAddress] : 0;
    const exposure = eraExposure.validators[validatorAddress] ? eraExposure.validators[validatorAddress] : {total:0,own:0,others:[]}  
    
    let voters: Voter[] = []
    for (const nominator of nominators) {
      if(JSON.stringify(nominator.nominations.targets).includes(validatorAddress)) voters.push({address: nominator.address, value: nominator.ledger.total })
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
