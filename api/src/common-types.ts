// Subscription API Common Types
// SPDX-License-Identifier: Apache-2.0

import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { PlanTier, SubscriptionPrivateState, Contract, Witnesses } from '../../contract/src/index';

export const subscriptionPrivateStateKey = 'subscriptionPrivateState';
export type PrivateStateId = typeof subscriptionPrivateStateKey;

export type PrivateStates = {
  readonly subscriptionPrivateState: SubscriptionPrivateState;
};

export type SubscriptionContract = Contract<SubscriptionPrivateState, Witnesses<SubscriptionPrivateState>>;

export type SubscriptionCircuitKeys = Exclude<keyof SubscriptionContract['impureCircuits'], number | symbol>;

export type SubscriptionProviders = MidnightProviders<SubscriptionCircuitKeys, PrivateStateId, SubscriptionPrivateState>;

export type DeployedSubscriptionContract = FoundContract<SubscriptionContract>;

export type SubscriptionDerivedState = {
  readonly state: PlanTier;
  readonly activeTier: PlanTier;
  readonly sequence: bigint;
  readonly totalSubscribers: bigint;
  readonly isOwner: boolean;
};
