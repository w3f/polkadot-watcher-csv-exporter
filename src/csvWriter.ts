/*eslint @typescript-eslint/no-use-before-define: ["error", { "variables": false }]*/

import { WriteStream } from 'fs';
import { initFile, closeFile } from './utils';
import { WriteCSVRequest, WriteValidatorCSVRequest, WriteNominatorCSVRequest, ChainData } from "./types";
import { Logger } from '@w3f/logger';

export const writeSessionCSV = async (request: WriteCSVRequest, chainData: ChainData, logger: Logger): Promise<void> =>{
  await _writeNominatorSessionCSV({...request,...chainData} as WriteNominatorCSVRequest, logger)
  await _writeValidatorSessionCSV({...request,...chainData} as WriteValidatorCSVRequest, logger)
}

export const writeEraCSV = async (request: WriteCSVRequest, chainData: ChainData, logger: Logger): Promise<void> =>{
  await _writeValidatorEraCSV({...request,...chainData} as WriteValidatorCSVRequest, logger)
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
  const { eraIndex, sessionIndex, blockNumber, myValidatorStaking, totalIssuance, validatorRewardsPreviousEra } = request
  file.write(`era,session,block_number,name,stash_address,controller_address,commission_percent,self_stake,total_stake,num_stakers,stakers,voters,era_points,total_issuance,validator_rewards_previous_era\n`);
  for (const staking of myValidatorStaking) {
    file.write(`${eraIndex},${sessionIndex},${blockNumber},${staking.displayName},${staking.accountId},${staking.controllerId},${(parseInt(staking.validatorPrefs.commission.toString()) / 10000000).toFixed(2)},${staking.exposure.own},${staking.exposure.total},${staking.exposure.others.length},"${staking.exposure.others.map(staker=>staker.who).join(`,`)}",${staking.voters},${staking.eraPoints},${totalIssuance},${validatorRewardsPreviousEra}\n`);
  }
}