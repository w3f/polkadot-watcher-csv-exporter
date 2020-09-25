import fs from 'fs';
import { DeriveAccountRegistration } from '@polkadot/api-derive/accounts/types';
import { DeriveStakingAccount } from '@polkadot/api-derive/staking/types';
import { MyDeriveStakingAccount, WriteCSVRequest, ValidatorCSVRequest, NominatorCSVRequest } from "./types";
import { Logger } from '@w3f/logger';
import { ApiPromise } from '@polkadot/api';

const _getNominatorStaking = async (api: ApiPromise): Promise<DeriveStakingAccount[]> =>{
  /* TODO
  This code is coming from https://github.com/mariopino/substrate-data-csv/blob/master/utils.js
  and needs to be refactored
  */

  const nominators = await api.query.staking.nominators.entries();
  const nominatorAddresses = nominators.map(([address]) => address.toHuman()[0]);
  const nominatorStaking = await Promise.all(
    nominatorAddresses.map(nominatorAddress => api.derive.staking.account(nominatorAddress))
  );
  return nominatorStaking
}

const _getValidatorStaking = async (api: ApiPromise): Promise<DeriveStakingAccount[]> =>{
  /* TODO
  This code is coming from https://github.com/mariopino/substrate-data-csv/blob/master/utils.js
  and needs to be refactored
  */

  const validatorAddresses = await api.query.session.validators();
  const validatorStaking = await Promise.all(
    validatorAddresses.map(authorityId => api.derive.staking.account(authorityId))
  );
  return validatorStaking
}

const _getDisplayName = (identity: DeriveAccountRegistration): string =>{
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

const _writeNominatorCSV = async (request: NominatorCSVRequest, logger: Logger): Promise<DeriveStakingAccount[]> =>{
  const {network, exportDir, eraIndex, sessionIndex, blockNumber, nominatorStaking} = request

  /* TODO
  This code is coming from https://github.com/mariopino/substrate-data-csv/blob/master/utils.js
  and needs to be refactored
  */

  logger.info(`Writing nominators CSV for session ${sessionIndex}`)

  const filePath = `${exportDir}/${network}_nominators_session_${sessionIndex}.csv`;
  const file = fs.createWriteStream(filePath);
  file.on('error', function(err) { logger.error(err.stack) });
  file.write(`era,session,block_number,stash_address,controller_address,bonded_amount,num_targets,targets\n`);
  for (let i = 0, len = nominatorStaking.length; i < len; i++) {
    const staking = nominatorStaking[i];
    const numTargets = staking.nominators ? staking.nominators.length : 0;
    file.write(`${eraIndex},${sessionIndex},${blockNumber},${staking.accountId},${staking.controllerId},${staking.stakingLedger.total},${numTargets},"${staking.nominators.join(`,`)}"\n`);
  }
  file.end();
  logger.info(`Finished writing nominators CSV for session ${sessionIndex}`)

  return nominatorStaking;
}

const _writeValidatorCSV = async (request: ValidatorCSVRequest, logger: Logger): Promise<void> => {
  const {api, network, exportDir, eraIndex, sessionIndex, blockNumber, validatorStaking, nominatorStaking} = request

  /* TODO
  This code is coming from https://github.com/mariopino/substrate-data-csv/blob/master/utils.js
  and needs to be refactored
  */

  logger.info(`Writing validators CSV for session ${sessionIndex}`)


  const myValidatorStaking: MyDeriveStakingAccount[] = []
  for (const validator of validatorStaking) {
    // add identity
    const { identity } = await api.derive.accounts.info(validator.accountId);

    // add voters
    let voters = 0;
    for (const staking of nominatorStaking) {
      if (staking.nominators.includes(validator.accountId)) {
        voters++
      }
    }

    const myValidator = {
      ...validator,
      identity:identity,
      displayName: _getDisplayName(identity),
      voters: voters
    } as MyDeriveStakingAccount
    myValidatorStaking.push(myValidator)
  } 

  const filePath = `${exportDir}/${network}_validators_session_${sessionIndex}.csv`;
  const file = fs.createWriteStream(filePath);
  file.on('error', function(err) { logger.error(err.stack) });
  file.write(`era,session,block_number,name,stash_address,controller_address,commission_percent,self_stake,total_stake,num_stakers,voters\n`);
  for (let i = 0, len = myValidatorStaking.length; i < len; i++) {
    const staking = myValidatorStaking[i];
    file.write(`${eraIndex},${sessionIndex},${blockNumber},${staking.displayName},${staking.accountId},${staking.controllerId},${(parseInt(staking.validatorPrefs.commission.toString()) / 10000000).toFixed(2)},${staking.exposure.own},${staking.exposure.total},${staking.exposure.others.length},${staking.voters}\n`);
  }
  file.end();

  logger.info(`Finished writing validators CSV for session ${sessionIndex}`)
}

const _writeValidatorEraCSV = async (request: ValidatorCSVRequest, logger: Logger): Promise<void> => {
  const {api, network, exportDir, eraIndex, sessionIndex, blockNumber, validatorStaking, nominatorStaking} = request

  /* TODO
  This code is coming from https://github.com/mariopino/substrate-data-csv/blob/master/utils.js
  and needs to be refactored
  */

  logger.info(`Writing validators CSV for era ${eraIndex}`)

  const eraPoints = (await api.query.staking.erasRewardPoints(eraIndex)).toJSON();

  const myValidatorStaking: MyDeriveStakingAccount[] = []

  for (const validator of validatorStaking) {
    // add identity
    const { identity } = await api.derive.accounts.info(validator.accountId);

    // add voters
    let voters = 0;
    for (const staking of nominatorStaking) {
      if (staking.nominators.includes(validator.accountId)) {
        voters++
      }
    }

    const validatorEraPoints = eraPoints['individual'][validator.accountId];

    const myValidator = {
      ...validator,
      identity:identity,
      displayName: _getDisplayName(identity),
      voters: voters,
      eraPoints: validatorEraPoints,
    } as MyDeriveStakingAccount
    myValidatorStaking.push(myValidator)
  }

  const filePath = `${exportDir}/${network}_validators_era_${eraIndex}.csv`;
  const file = fs.createWriteStream(filePath);
  file.on('error', function(err) { logger.error(err.stack) });
  file.write(`era,session,block_number,name,stash_address,controller_address,commission_percent,self_stake,total_stake,num_stakers,voters, era_points\n`);
  for (const staking of myValidatorStaking) {
    file.write(`${eraIndex},${sessionIndex},${blockNumber},${staking.displayName},${staking.accountId},${staking.controllerId},${(parseInt(staking.validatorPrefs.commission.toString()) / 10000000).toFixed(2)},${staking.exposure.own},${staking.exposure.total},${staking.exposure.others.length},${staking.voters},${staking.eraPoints}\n`);
  }
  file.end();

  logger.info(`Finished writing validators CSV for era ${eraIndex}`)
}

interface ChainData {
  nominatorStaking: DeriveStakingAccount[];
  validatorStaking: DeriveStakingAccount[];
}

const _writeSessionCSV = async (request: WriteCSVRequest, chainData: ChainData, logger: Logger): Promise<void> =>{
  await _writeNominatorCSV({...request,nominatorStaking: chainData.nominatorStaking}, logger)
  await _writeValidatorCSV({...request,validatorStaking: chainData.validatorStaking, nominatorStaking: chainData.nominatorStaking}, logger)
}

const _writeEraCSV = async (request: WriteCSVRequest, chainData: ChainData, logger: Logger): Promise<void> =>{
  await _writeValidatorEraCSV({...request,validatorStaking: chainData.validatorStaking,nominatorStaking: chainData.nominatorStaking}, logger)
}

export const writeSessionCSV = async (request: WriteCSVRequest, logger: Logger): Promise<void> =>{
  logger.debug(`CSV write triggered`)
  const nominatorStaking = await _getNominatorStaking(request.api)
  const validatorStaking = await _getValidatorStaking(request.api)
  const chainData = {nominatorStaking,validatorStaking}
  await _writeSessionCSV(request, chainData, logger)
}

export const writeEraCSV = async (request: WriteCSVRequest, logger: Logger): Promise<void> =>{
  logger.info('CSV era write triggered')
  const nominatorStaking = await _getNominatorStaking(request.api)
  const validatorStaking = await _getValidatorStaking(request.api)
  const chainData = {nominatorStaking,validatorStaking}
  await _writeSessionCSV(request, chainData, logger)
  await _writeEraCSV(request, chainData, logger)
}