// Subscription API Interface & Implementation
// SPDX-License-Identifier: Apache-2.0

import * as Subscription from '../../contract/src/managed/subscription/contract/index.js';
import { type ContractAddress, convertFieldToBytes } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type Logger } from 'pino';
import {
  type SubscriptionDerivedState,
  type SubscriptionContract,
  type SubscriptionProviders,
  type DeployedSubscriptionContract,
  subscriptionPrivateStateKey,
} from './common-types.js';
import { CompiledSubscriptionContractContract } from '../../contract/src/index.js';
import * as utils from './utils/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { combineLatest, map, tap, from, type Observable } from 'rxjs';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { SubscriptionPrivateState, createSubscriptionPrivateState } from '../../contract/src/witnesses.js';

export interface DeployedSubscriptionAPI {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<SubscriptionDerivedState>;

  subscribe: (tier: Subscription.PlanTier) => Promise<void>;
  cancelSubscription: () => Promise<void>;
}

export class SubscriptionAPI implements DeployedSubscriptionAPI {
  private constructor(
    public readonly deployedContract: DeployedSubscriptionContract,
    providers: SubscriptionProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);
    this.state$ = combineLatest(
      [
        providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' }).pipe(
          map((contractState) => Subscription.ledger(contractState.data)),
          tap((ledgerState) =>
            logger?.trace({
              ledgerStateChanged: {
                ledgerState: {
                  ...ledgerState,
                  owner: toHex(ledgerState.owner),
                },
              },
            }),
          ),
        ),
        from(providers.privateStateProvider.get(subscriptionPrivateStateKey) as Promise<SubscriptionPrivateState>),
      ],
      (ledgerState, privateState) => {
        const hashedSecretKey = Subscription.pureCircuits.publicKey(
          privateState.secretKey,
          convertFieldToBytes(32, ledgerState.sequence, 'api/src/index.ts'),
        );

        return {
          state: ledgerState.state,
          activeTier: ledgerState.activeTier,
          sequence: ledgerState.sequence,
          totalSubscribers: ledgerState.totalSubscribers,
          isOwner: toHex(ledgerState.owner) === toHex(hashedSecretKey),
        };
      },
    );
  }

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<SubscriptionDerivedState>;

  async subscribe(tier: Subscription.PlanTier): Promise<void> {
    this.logger?.info(`subscribingToTier: ${tier}`);
    const txData = await (this.deployedContract.callTx as any).subscribe(tier);
    this.logger?.trace({
      transactionAdded: {
        circuit: 'subscribe',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  async cancelSubscription(): Promise<void> {
    this.logger?.info('cancelingSubscription');
    const txData = await (this.deployedContract.callTx as any).cancelSubscription();
    this.logger?.trace({
      transactionAdded: {
        circuit: 'cancelSubscription',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  static async deploy(providers: SubscriptionProviders, logger?: Logger): Promise<SubscriptionAPI> {
    logger?.info('deployContract');
    const deployedSubscriptionContract = await deployContract(providers as any, {
      compiledContract: CompiledSubscriptionContractContract as any,
      privateStateId: subscriptionPrivateStateKey,
      initialPrivateState: createSubscriptionPrivateState(utils.randomBytes(32)),
      args: [],
    } as any);

    logger?.trace({
      contractDeployed: {
        finalizedDeployTxData: deployedSubscriptionContract.deployTxData.public,
      },
    });

    return new SubscriptionAPI(deployedSubscriptionContract as any, providers, logger);
  }

  static async join(providers: SubscriptionProviders, contractAddress: ContractAddress, logger?: Logger): Promise<SubscriptionAPI> {
    logger?.info({
      joinContract: {
        contractAddress,
      },
    });

    const deployedSubscriptionContract = await findDeployedContract<SubscriptionContract>(providers as any, {
      contractAddress,
      compiledContract: CompiledSubscriptionContractContract as any,
      privateStateId: subscriptionPrivateStateKey,
      initialPrivateState: await SubscriptionAPI.getPrivateState(providers, contractAddress),
    } as any);

    logger?.trace({
      contractJoined: {
        finalizedDeployTxData: deployedSubscriptionContract.deployTxData.public,
      },
    });

    return new SubscriptionAPI(deployedSubscriptionContract as any, providers, logger);
  }

  private static async getPrivateState(
    providers: SubscriptionProviders,
    contractAddress: ContractAddress,
  ): Promise<SubscriptionPrivateState> {
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existingPrivateState = await providers.privateStateProvider.get(subscriptionPrivateStateKey);
    return existingPrivateState ?? createSubscriptionPrivateState(utils.randomBytes(32));
  }
}

export * as utils from './utils/index.js';
export * from './common-types.js';
