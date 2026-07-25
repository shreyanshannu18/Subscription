// Subscription Contract TS Integration
// SPDX-License-Identifier: Apache-2.0

import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import * as CompiledSubscriptionContract from "./managed/subscription/contract/index.js";
import * as Witnesses from "./witnesses.js";

export * from "./managed/subscription/contract/index.js";
export * from "./witnesses.js";

export const CompiledSubscriptionContractContract = CompiledContract.make<
  any
>("Subscription", CompiledSubscriptionContract.Contract as any).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses as any),
  CompiledContract.withCompiledFileAssets("./managed/subscription"),
);
