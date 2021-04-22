/*eslint @typescript-eslint/no-use-before-define: ["error", { "variables": false }]*/

import { DeriveStakingAccount } from '@polkadot/api-derive/staking/types';
import { MyDeriveStakingAccount, WriteCSVRequest, ChainData } from "./types";
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
  const {api,eraIndex} = request
  const eraPointsPromise = api.query.staking.erasRewardPoints(eraIndex);
  const eraExposures = await api.derive.staking.eraExposure(eraIndex)
  const totalIssuance =  await api.query.balances.totalIssuance()
  const validatorRewardsPreviousEra = (await api.query.staking.erasValidatorReward(eraIndex.sub(new BN(1)))).unwrap();
  logger.debug(`nominators...`)
  const nominatorStakingPromise = _getNominatorStaking(api, logger)
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

const _getNominatorStaking = async (api: ApiPromise, logger: Logger): Promise<DeriveStakingAccount[]> =>{

  const nominators = await api.query.staking.nominators.entries();
  const nominatorAddresses = nominators.map(([address]) => ""+address.toHuman()[0]);

  logger.debug(`the nominator addresses size is ${nominatorAddresses.length}`)

  //A to big nominators set could make crush the API => Chunk splitting
  const size = 3000
  const nominatorAddressesChucked = []
  for (let i = 0; i < nominatorAddresses.length; i += size) {
    const chunk = nominatorAddresses.slice(i, i + size)
    nominatorAddressesChucked.push(chunk)
  } 

  const nominatorsStakings = []
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