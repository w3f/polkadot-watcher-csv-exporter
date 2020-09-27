import { ApiPromise } from '@polkadot/api';
import { EraIndex, SessionIndex, BlockNumber, EraRewardPoints } from '@polkadot/types/interfaces';
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
  displayName: string;
  voters: number;
  eraPoints?: number;
}

export interface WriteCSVRequest{
  api: ApiPromise;
  network: string; 
  exportDir: string; 
  eraIndex: EraIndex; 
  sessionIndex: SessionIndex; 
  blockNumber: Compact<BlockNumber>;
}

export interface WriteNominatorCSVRequest extends WriteCSVRequest{
  nominatorStaking: DeriveStakingAccount[];
}

export interface WriteValidatorCSVRequest extends WriteCSVRequest{
  myValidatorStaking: MyDeriveStakingAccount[];
}

export interface ChainData {
  eraPoints: EraRewardPoints;
  nominatorStaking: DeriveStakingAccount[];
  myValidatorStaking: MyDeriveStakingAccount[];
}
