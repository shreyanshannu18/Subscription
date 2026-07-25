// Privacy-Preserving Subscription Contract Witnesses
// SPDX-License-Identifier: Apache-2.0

import { Ledger } from "./managed/subscription/contract/index.js";
import { WitnessContext } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";

export type SubscriptionPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createSubscriptionPrivateState = (secretKey: Uint8Array): SubscriptionPrivateState => ({
  secretKey,
});

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, SubscriptionPrivateState>): [
    SubscriptionPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],
};
