import { DeriveStakingAccount } from '@polkadot/api-derive/staking/types';
import { DeriveAccountRegistration } from '@polkadot/api-derive/accounts/types';

export interface InputConfig {
    logLevel: string;
    port: number;
    endpoint: string;
    exportDir: string;
    bucketName: string;
}

export interface MyDeriveStakingAccount extends DeriveStakingAccount {
  identity: DeriveAccountRegistration;
  displayName: string;
  voters: number;
}
