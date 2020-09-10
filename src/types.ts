import { DeriveStakingAccount } from '@polkadot/api-derive/staking/types';
import { DeriveAccountRegistration } from '@polkadot/api-derive/accounts/types';
import { ApiPromise } from '@polkadot/api';
import { EraIndex, SessionIndex, BlockNumber } from '@polkadot/types/interfaces';
import { Compact } from '@polkadot/types';

export interface InputConfig {
    logLevel: string;
    port: number;
    endpoint: string;
    exportDir: string;
    bucketUpload: boolean;
}

export interface MyDeriveStakingAccount extends DeriveStakingAccount {
  identity: DeriveAccountRegistration;
  displayName: string;
  voters: number;
}

export interface NominatorCSVRequest{
  api: ApiPromise;
  network: string; 
  exportDir: string; 
  eraIndex: EraIndex; 
  sessionIndex: SessionIndex; 
  blockNumber: Compact<BlockNumber>;
}
export interface ValidatorCSVrequest extends NominatorCSVRequest {
  nominatorStaking: DeriveStakingAccount[];
}
