import { DeriveAccountRegistration } from '@polkadot/api-derive/accounts/types';
import { ApiPromise } from '@polkadot/api';
import { EraIndex, SessionIndex, BlockNumber } from '@polkadot/types/interfaces';
import { Compact } from '@polkadot/types';
import { DeriveStakingAccount } from '@polkadot/api-derive/staking/types';

export interface InputConfig {
    logLevel: string;
    port: number;
    endpoint: string;
    exportDir: string;
    bucketUpload: BucketUploadConfig;
    cronjob: CronJobConfig;
}

export interface CronJobConfig{
  enabled: boolean;
}

export interface BucketUploadConfig{
  enabled: boolean;
  gcpServiceAccount: string;
  gcpProject: string;
  gcpBucketName: string;
}

export interface MyDeriveStakingAccount extends DeriveStakingAccount {
  identity: DeriveAccountRegistration;
  displayName: string;
  voters: number;
}

export interface WriteCSVRequest{
  api: ApiPromise;
  network: string; 
  exportDir: string; 
  eraIndex: EraIndex; 
  sessionIndex: SessionIndex; 
  blockNumber: Compact<BlockNumber>;
}

export interface NominatorCSVRequest extends WriteCSVRequest{
  nominatorStaking: DeriveStakingAccount[];
}

export interface ValidatorCSVRequest extends NominatorCSVRequest{
  validatorStaking: DeriveStakingAccount[];
}
