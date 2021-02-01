import { DeriveStakingAccount } from '@polkadot/api-derive/staking/types';
import { MyDeriveStakingAccount, WriteCSVRequest, WriteValidatorCSVRequest, WriteNominatorCSVRequest, ChainData } from "./types";
import { Logger } from '@w3f/logger';
import { ApiPromise } from '@polkadot/api';
import { EraRewardPoints } from '@polkadot/types/interfaces';
import { getDisplayName, initFile, closeFile } from './utils';
import { WriteStream } from 'fs';
import { DeriveEraExposure } from '@polkadot/api-derive/staking/types' 

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

const _gatherData = async (request: WriteCSVRequest, logger: Logger): Promise<ChainData> =>{
  logger.debug(`gathering some data from the chain...`)
  const {api,eraIndex} = request
  const eraPointsPromise = api.query.staking.erasRewardPoints(eraIndex);
  const eraExposures = await api.derive.staking.eraExposure(eraIndex)
  const totalIssuance =  await api.query.balances.totalIssuance()
  logger.debug(`nominators...`)
  const nominatorStakingPromise = _getNominatorStaking(api, logger)
  const [nominatorStaking,eraPoints] = [await nominatorStakingPromise, await eraPointsPromise]
  logger.debug(`validators...`)
  const myValidatorStaking = await _getMyValidatorStaking(api,nominatorStaking,eraPoints, eraExposures, logger)

  return {
    eraPoints,
    totalIssuance,
    nominatorStaking,
    myValidatorStaking
  } as ChainData
}

const _writeFileNominatorSession = (file: WriteStream, request: WriteNominatorCSVRequest): void => {
  const { eraIndex, sessionIndex, blockNumber, nominatorStaking } = request
  file.write(`era,session,block_number,stash_address,controller_address,bonded_amount,num_targets,targets\n`);
  for (const staking of nominatorStaking) {
    const numTargets = staking.nominators ? staking.nominators.length : 0;
    file.write(`${eraIndex},${sessionIndex},${blockNumber},${staking.accountId},${staking.controllerId},${staking.stakingLedger.total},${numTargets},"${staking.nominators.join(`,`)}"\n`);
  }
}

const _writeNominatorSessionCSV = async (request: WriteNominatorCSVRequest, logger: Logger): Promise<void> =>{
  const { network, exportDir, sessionIndex } = request

  logger.info(`Writing nominators CSV for session ${sessionIndex}`)

  const fileName = `${network}_nominators_session_${sessionIndex}.csv`
  const file = initFile(exportDir, fileName, logger)

  _writeFileNominatorSession(file,request)

  await closeFile(file)

  logger.info(`Finished writing nominators CSV for session ${sessionIndex}`)
}

const _writeFileValidatorSession = (file: WriteStream, request: WriteValidatorCSVRequest): void => {
  const { eraIndex, sessionIndex, blockNumber, myValidatorStaking, totalIssuance } = request
  file.write(`era,session,block_number,name,stash_address,controller_address,commission_percent,self_stake,total_stake,num_stakers,voters,era_points,total_issuance\n`);
  for (const staking of myValidatorStaking) {
    file.write(`${eraIndex},${sessionIndex},${blockNumber},${staking.displayName},${staking.accountId},${staking.controllerId},${(parseInt(staking.validatorPrefs.commission.toString()) / 10000000).toFixed(2)},${staking.exposure.own},${staking.exposure.total},${staking.exposure.others.length},${staking.voters},${staking.eraPoints},${totalIssuance}\n`);
  }
}

const _writeValidatorSessionCSV = async (request: WriteValidatorCSVRequest, logger: Logger): Promise<void> => {
  const { network, exportDir, sessionIndex } = request

  logger.info(`Writing validators CSV for session ${sessionIndex}`)

  const fileName = `${network}_validators_session_${sessionIndex}.csv`
  const file = initFile(exportDir, fileName, logger)

  _writeFileValidatorSession(file,request)

  await closeFile(file)

  logger.info(`Finished writing validators CSV for session ${sessionIndex}`)
}

const _writeValidatorEraCSV = async (request: WriteValidatorCSVRequest, logger: Logger): Promise<void> => {
  const { network, exportDir, eraIndex } = request

  logger.info(`Writing validators CSV for era ${eraIndex}`)

  const fileName = `${network}_validators_era_${eraIndex}.csv`
  const file = initFile(exportDir, fileName, logger)

  _writeFileValidatorSession(file,request)

  await closeFile(file)

  logger.info(`Finished writing validators CSV for era ${eraIndex}`)
}

const _writeSessionCSV = async (request: WriteCSVRequest, chainData: ChainData, logger: Logger): Promise<void> =>{
  await _writeNominatorSessionCSV({...request,...chainData} as WriteNominatorCSVRequest, logger)
  await _writeValidatorSessionCSV({...request,...chainData} as WriteValidatorCSVRequest, logger)
}

const _writeEraCSV = async (request: WriteCSVRequest, chainData: ChainData, logger: Logger): Promise<void> =>{
  await _writeValidatorEraCSV({...request,...chainData} as WriteValidatorCSVRequest, logger)
}

export const writeSessionCSV = async (request: WriteCSVRequest, logger: Logger): Promise<void> =>{
  logger.info(`CSV session write triggered`)

  const chainData = await _gatherData(request, logger)
  await _writeSessionCSV(request, chainData, logger)
}

export const writeEraCSV = async (request: WriteCSVRequest, logger: Logger): Promise<void> =>{
  logger.info('CSV era write triggered')

  const chainData = await _gatherData(request, logger)
  await _writeSessionCSV(request, chainData, logger)
  await _writeEraCSV(request, chainData, logger)
}