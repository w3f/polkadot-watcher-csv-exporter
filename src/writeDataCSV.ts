import fs from 'fs';
import { DeriveAccountRegistration } from '@polkadot/api-derive/accounts/types';
import { DeriveStakingAccount } from '@polkadot/api-derive/staking/types';
import { MyDeriveStakingAccount, NominatorCSVRequest, ValidatorCSVrequest } from "./types";
import { Logger } from '@w3f/logger';

function _getDisplayName(identity: DeriveAccountRegistration): string {
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

export async function writeNominatorCSV(nominatorCSVRequest: NominatorCSVRequest, logger: Logger): Promise<DeriveStakingAccount[]> {
  const {api, network, exportDir, eraIndex, sessionIndex, blockNumber} = nominatorCSVRequest

  /* TODO
  This code is coming from https://github.com/mariopino/substrate-data-csv/blob/master/utils.js
  and needs to be refactored
  */

  logger.info(`Writing nominators CSV for session ${sessionIndex}`)
  const nominators = await api.query.staking.nominators.entries();
  const nominatorAddresses = nominators.map(([address]) => address.toHuman()[0]);
  const nominatorStaking = await Promise.all(
    nominatorAddresses.map(nominatorAddress => api.derive.staking.account(nominatorAddress))
  );
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

export async function writeValidatorCSV(validatorCSVrequest: ValidatorCSVrequest, logger: Logger): Promise<void> {
  const {api, network, exportDir, eraIndex, sessionIndex, blockNumber, nominatorStaking} = validatorCSVrequest

  /* TODO
  This code is coming from https://github.com/mariopino/substrate-data-csv/blob/master/utils.js
  and needs to be refactored
  */

  logger.info(`Writing validators CSV for session ${sessionIndex}`)
  
  const validatorAddresses = await api.query.session.validators();
  const validatorStaking = await Promise.all(
    validatorAddresses.map(authorityId => api.derive.staking.account(authorityId))
  );
  const myValidatorStaking: MyDeriveStakingAccount[] = []
  for(let i = 0; i < validatorStaking.length; i++) {
    const validator = validatorStaking[i];
    // add identity
    const { identity } = await api.derive.accounts.info(validator.accountId);

    // add voters
    let voters = 0;
    for (let i = 0, len = nominatorStaking.length; i < len; i++) {
      const staking = nominatorStaking[i];
      if (staking.nominators.includes(validator.accountId)) {
        voters++
      }
    }

    const myValidator = {
      ...validator,
      identity:identity,
      displayName:_getDisplayName(identity),
      voters:voters
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