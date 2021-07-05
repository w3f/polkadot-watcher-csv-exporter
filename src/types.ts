import { ApiPromise } from '@polkadot/api';
import { EraIndex, SessionIndex, BlockNumber, EraRewardPoints, Balance, BalanceOf } from '@polkadot/types/interfaces';
import { Compact } from '@polkadot/types';
import { DeriveStakingAccount } from '@polkadot/api-derive/staking/types';

export interface InputConfig {
    logLevel: string;
    debug: DebugConfig;
    port: number;
    endpoint: string;
    exportDir: string;
    endSessionBlockDistance: number;
    bucketUpload: BucketUploadConfig;
    cronjob: CronJobConfig;
    apiChunkSize?: number;
    historic: {
      enabled: boolean;
      historySize: number;
    };
}

interface DebugConfig{
  enabled: boolean;
  forceInitialWrite: boolean;
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
  apiChunkSize: number;
  network: string; 
  exportDir: string; 
  eraIndex: EraIndex; 
  sessionIndex: SessionIndex; 
  blockNumber: Compact<BlockNumber>;
  totalIssuance?: Balance;
  validatorRewardsPreviousEra?: BalanceOf;
}

export interface WriteCSVHistoricalRequest{
  api: ApiPromise;
  network: string; 
  exportDir: string; 
  totalIssuance?: Balance;
  validatorRewardsPreviousEra?: BalanceOf;
  eraIndexes: EraIndex[];
}

export interface WriteNominatorCSVRequest extends WriteCSVRequest{
  nominatorStaking: DeriveStakingAccount[];
}

export interface WriteValidatorCSVRequest extends WriteCSVRequest{
  myValidatorStaking: MyDeriveStakingAccount[];
  myWaitingValidatorStaking?: MyDeriveStakingAccount[];
}

export interface WriteValidatorHistoricCSVRequest extends WriteCSVHistoricalRequest{
  erasData: ChainData[];
}

export interface ChainData {
  eraIndex?: EraIndex;
  eraPoints: EraRewardPoints;
  totalIssuance: Balance;
  validatorRewardsPreviousEra: BalanceOf;
  nominatorStaking: DeriveStakingAccount[];
  myValidatorStaking: MyDeriveStakingAccount[];
  myWaitingValidatorStaking?: MyDeriveStakingAccount[];
}
