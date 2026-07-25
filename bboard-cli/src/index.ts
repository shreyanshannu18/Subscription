// Subscription CLI Driver
// SPDX-License-Identifier: Apache-2.0

import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { WebSocket } from 'ws';
import {
  SubscriptionAPI,
  type SubscriptionDerivedState,
  subscriptionPrivateStateKey,
  type SubscriptionProviders,
  type DeployedSubscriptionContract,
  type PrivateStateId,
} from '../../api/src/index.js';
import { type WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ledger, type Ledger, PlanTier } from '../../contract/src/managed/subscription/contract/index.js';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { type Logger } from 'pino';
import { type Config, StandaloneConfig } from './config.js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { assertIsContractAddress, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { TestEnvironment } from '@midnight-ntwrk/testkit-js';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { randomBytes } from '../../api/src/utils/index.js';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { syncWallet, waitForUnshieldedFunds } from './wallet-utils.js';
import { generateDust } from './generate-dust.js';
import { SubscriptionPrivateState } from '../../contract/src/witnesses.js';

// @ts-expect-error: WebSocket polyfill for apollo client environment
globalThis.WebSocket = WebSocket;

export const getSubscriptionLedgerState = async (
  providers: SubscriptionProviders,
  contractAddress: ContractAddress,
): Promise<Ledger | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  return contractState != null ? ledger(contractState.data) : null;
};

const DEPLOY_OR_JOIN_QUESTION = `
You can do one of the following:
  1. Deploy a new subscription contract
  2. Join an existing subscription contract (<YOUR_DEPLOYED_CONTRACT_ADDRESS>)
  3. Exit
Which would you like to do? `;

const deployOrJoin = async (providers: SubscriptionProviders, rli: Interface, logger: Logger): Promise<SubscriptionAPI | null> => {
  let api: SubscriptionAPI | null = null;

  while (true) {
    const choice = await rli.question(DEPLOY_OR_JOIN_QUESTION);
    switch (choice) {
      case '1':
        api = await SubscriptionAPI.deploy(providers, logger);
        logger.info(`Deployed contract at address: ${api.deployedContractAddress}`);
        return api;
      case '2': {
        const addr = await rli.question('What is the contract address (in hex)? [<YOUR_DEPLOYED_CONTRACT_ADDRESS>]: ');
        const contractAddress = addr.trim() || '<YOUR_DEPLOYED_CONTRACT_ADDRESS>';
        api = await SubscriptionAPI.join(providers, contractAddress, logger);
        logger.info(`Joined contract at address: ${api.deployedContractAddress}`);
        return api;
      }
      case '3':
        logger.info('Exiting...');
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

const displayLedgerState = async (
  providers: SubscriptionProviders,
  deployedSubscriptionContract: DeployedSubscriptionContract,
  logger: Logger,
): Promise<void> => {
  const contractAddress = deployedSubscriptionContract.deployTxData.public.contractAddress;
  const ledgerState = await getSubscriptionLedgerState(providers, contractAddress);
  if (ledgerState === null) {
    logger.info(`There is no subscription contract deployed at ${contractAddress}`);
  } else {
    const getTierName = (t: PlanTier) => {
      switch (t) {
        case PlanTier.BASIC: return 'BASIC';
        case PlanTier.PREMIUM: return 'PREMIUM';
        case PlanTier.ENTERPRISE: return 'ENTERPRISE';
        default: return 'INACTIVE';
      }
    };
    logger.info(`Current state is: '${getTierName(ledgerState.state)}'`);
    logger.info(`Current active tier is: '${getTierName(ledgerState.activeTier)}'`);
    logger.info(`Current sequence is: ${ledgerState.sequence}`);
    logger.info(`Total subscribers: ${ledgerState.totalSubscribers}`);
    logger.info(`Current owner commitment: '${toHex(ledgerState.owner)}'`);
  }
};

const displayPrivateState = async (providers: SubscriptionProviders, logger: Logger): Promise<void> => {
  const privateState = await providers.privateStateProvider.get(subscriptionPrivateStateKey);
  if (privateState === null) {
    logger.info(`There is no existing subscription private state`);
  } else {
    logger.info(`Current secret key is: ${toHex(privateState.secretKey)}`);
  }
};

const displayDerivedState = (ledgerState: SubscriptionDerivedState | undefined, logger: Logger) => {
  if (ledgerState === undefined) {
    logger.info(`No subscription state currently available`);
  } else {
    const getTierName = (t: PlanTier) => {
      switch (t) {
        case PlanTier.BASIC: return 'BASIC';
        case PlanTier.PREMIUM: return 'PREMIUM';
        case PlanTier.ENTERPRISE: return 'ENTERPRISE';
        default: return 'INACTIVE';
      }
    };
    logger.info(`Current subscription state: '${getTierName(ledgerState.state)}'`);
    logger.info(`Active tier: '${getTierName(ledgerState.activeTier)}'`);
    logger.info(`Current sequence: ${ledgerState.sequence}`);
    logger.info(`Total subscribers on ledger: ${ledgerState.totalSubscribers}`);
    logger.info(`Subscription ownership: '${ledgerState.isOwner ? 'Your subscription' : 'Not yours'}'`);
  }
};

const MAIN_LOOP_QUESTION = `
Subscription DApp Menu:
  1. Subscribe to Basic Tier
  2. Subscribe to Premium Tier
  3. Subscribe to Enterprise Tier
  4. Cancel Active Subscription
  5. Display Public Ledger State
  6. Display Private Secret Key State
  7. Display Subscription Derived State (ZK verified)
  8. Exit
Which would you like to do? `;

const mainLoop = async (providers: SubscriptionProviders, rli: Interface, logger: Logger): Promise<void> => {
  const subApi = await deployOrJoin(providers, rli, logger);
  if (subApi === null) {
    return;
  }
  let currentState: SubscriptionDerivedState | undefined;
  const stateObserver = {
    next: (state: SubscriptionDerivedState) => (currentState = state),
  };
  const subscription = subApi.state$.subscribe(stateObserver);
  try {
    while (true) {
      const choice = await rli.question(MAIN_LOOP_QUESTION);
      try {
        switch (choice) {
          case '1':
            logger.info('Subscribing to BASIC tier...');
            await subApi.subscribe(PlanTier.BASIC);
            break;
          case '2':
            logger.info('Subscribing to PREMIUM tier...');
            await subApi.subscribe(PlanTier.PREMIUM);
            break;
          case '3':
            logger.info('Subscribing to ENTERPRISE tier...');
            await subApi.subscribe(PlanTier.ENTERPRISE);
            break;
          case '4':
            logger.info('Canceling subscription...');
            await subApi.cancelSubscription();
            break;
          case '5':
            await displayLedgerState(providers, subApi.deployedContract, logger);
            break;
          case '6':
            await displayPrivateState(providers, logger);
            break;
          case '7':
            displayDerivedState(currentState, logger);
            break;
          case '8':
            logger.info('Exiting...');
            return;
          default:
            logger.error(`Invalid choice: ${choice}`);
        }
      } catch (e) {
        logError(logger, e);
        logger.info('Returning to main menu...');
      }
    }
  } finally {
    subscription.unsubscribe();
  }
};

const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const WALLET_LOOP_QUESTION = `
Wallet Setup:
  1. Build a fresh wallet
  2. Build wallet from a seed
  3. Exit
Which would you like to do? `;

const buildWallet = async (config: Config, rli: Interface, logger: Logger): Promise<string | undefined> => {
  if (config instanceof StandaloneConfig) {
    return GENESIS_MINT_WALLET_SEED;
  }
  while (true) {
    const choice = await rli.question(WALLET_LOOP_QUESTION);
    switch (choice) {
      case '1':
        return toHex(randomBytes(32));
      case '2':
        return await rli.question('Enter your wallet seed: ');
      case '3':
        logger.info('Exiting...');
        return undefined;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

export const run = async (config: Config, testEnv: TestEnvironment, logger: Logger): Promise<void> => {
  const rli = createInterface({ input, output, terminal: true });
  const providersToBeStopped: MidnightWalletProvider[] = [];
  try {
    const envConfiguration = await testEnv.start();
    logger.info(`Environment started with configuration: ${JSON.stringify(envConfiguration)}`);
    const seed = await buildWallet(config, rli, logger);
    if (seed === undefined) {
      return;
    }
    const walletProvider = await MidnightWalletProvider.build(logger, envConfiguration, seed);
    providersToBeStopped.push(walletProvider);
    const walletFacade: WalletFacade = walletProvider.wallet;

    await walletProvider.start();

    const unshieldedState = await waitForUnshieldedFunds(logger, walletFacade, envConfiguration, unshieldedToken());
    const nightBalance = unshieldedState.balances[unshieldedToken().raw];
    if (nightBalance === undefined) {
      logger.info('No funds received, exiting...');
      return;
    }
    logger.info(`Your NIGHT wallet balance is: ${nightBalance}`);

    if (config.generateDust) {
      const dustGeneration = await generateDust(logger, seed, unshieldedState, walletFacade);
      if (dustGeneration) {
        logger.info(`Submitted dust generation registration transaction: ${dustGeneration}`);
        await syncWallet(logger, walletFacade);
      }
    }

    const zkConfigProvider = new NodeZkConfigProvider<'subscribe' | 'cancelSubscription'>(config.zkConfigPath);
    const providers: SubscriptionProviders = {
      privateStateProvider: levelPrivateStateProvider<PrivateStateId, SubscriptionPrivateState>({
        privateStateStoreName: config.privateStateStoreName,
        signingKeyStoreName: `${config.privateStateStoreName}-signing-keys`,
        privateStoragePasswordProvider: () => {
          return 'Subscription-Test-2026!';
        },
        accountId: seed,
      }),
      publicDataProvider: indexerPublicDataProvider(envConfiguration.indexer, envConfiguration.indexerWS),
      zkConfigProvider: zkConfigProvider,
      proofProvider: httpClientProofProvider(envConfiguration.proofServer, zkConfigProvider),
      walletProvider: walletProvider,
      midnightProvider: walletProvider,
    };
    await mainLoop(providers, rli, logger);
  } catch (e) {
    logError(logger, e);
    logger.info('Exiting...');
  } finally {
    try {
      rli.close();
      rli.removeAllListeners();
    } catch (e) {
      logError(logger, e);
    } finally {
      try {
        for (const wallet of providersToBeStopped) {
          logger.info('Stopping wallet...');
          await wallet.stop();
        }
        if (testEnv) {
          logger.info('Stopping test environment...');
          await testEnv.shutdown();
        }
      } catch (e) {
        logError(logger, e);
      }
    }
  }
};

function logError(logger: Logger, e: unknown) {
  if (e instanceof Error) {
    logger.error(`Found error '${e.message}'`);
    logger.debug(`${e.stack}`);
  } else {
    logger.error(`Found error (unknown type)`);
  }
}
