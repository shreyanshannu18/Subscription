// Subscription DApp Component
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Backdrop,
  CircularProgress,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  IconButton,
  Skeleton,
  Typography,
  Button,
  Chip,
  Stack,
} from '@mui/material';
import {
  LockOpen as LockOpenIcon,
  DeleteOutlined as DeleteIcon,
  ContentPasteOutlined as CopyIcon,
  HighlightOffOutlined as StopIcon,
  VerifiedUser as VerifiedUserIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import { type SubscriptionDerivedState, type DeployedSubscriptionAPI } from '../../../api/src/index.js';
import { useDeployedBoardContext } from '../hooks/index.js';
import { type SubscriptionDeployment } from '../contexts/index.js';
import { type Observable } from 'rxjs';
import { PlanTier } from '../../../contract/src/index.js';
import { EmptyCardContent } from './Board.EmptyCardContent.js';

export interface BoardProps {
  boardDeployment$?: Observable<SubscriptionDeployment>;
}

export const Board: React.FC<Readonly<BoardProps>> = ({ boardDeployment$ }) => {
  const boardApiProvider = useDeployedBoardContext();
  const [boardDeployment, setBoardDeployment] = useState<SubscriptionDeployment>();
  const [deployedBoardAPI, setDeployedBoardAPI] = useState<DeployedSubscriptionAPI>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [boardState, setBoardState] = useState<SubscriptionDerivedState>();
  const [isWorking, setIsWorking] = useState(!!boardDeployment$);

  const onCreateBoard = useCallback(() => boardApiProvider.resolve(), [boardApiProvider]);
  const onJoinBoard = useCallback(
    (contractAddress: ContractAddress) => boardApiProvider.resolve(contractAddress),
    [boardApiProvider],
  );

  const onSubscribe = useCallback(async (tier: PlanTier) => {
    try {
      if (deployedBoardAPI) {
        setIsWorking(true);
        await deployedBoardAPI.subscribe(tier);
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  }, [deployedBoardAPI]);

  const onCancelSubscription = useCallback(async () => {
    try {
      if (deployedBoardAPI) {
        setIsWorking(true);
        await deployedBoardAPI.cancelSubscription();
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  }, [deployedBoardAPI]);

  const onCopyContractAddress = useCallback(async () => {
    if (deployedBoardAPI) {
      await navigator.clipboard.writeText(deployedBoardAPI.deployedContractAddress);
    }
  }, [deployedBoardAPI]);

  useEffect(() => {
    if (!boardDeployment$) return;
    const subscription = boardDeployment$.subscribe(setBoardDeployment);
    return () => subscription.unsubscribe();
  }, [boardDeployment$]);

  useEffect(() => {
    if (!boardDeployment || boardDeployment.status === 'in-progress') return;

    setIsWorking(false);
    if (boardDeployment.status === 'failed') {
      setErrorMessage(boardDeployment.error.message || 'Encountered an unexpected error.');
      return;
    }

    setDeployedBoardAPI(boardDeployment.api);
    const subscription = boardDeployment.api.state$.subscribe(setBoardState);
    return () => subscription.unsubscribe();
  }, [boardDeployment]);

  const getTierLabel = (tier?: PlanTier) => {
    switch (tier) {
      case PlanTier.BASIC: return 'BASIC TIER';
      case PlanTier.PREMIUM: return 'PREMIUM TIER';
      case PlanTier.ENTERPRISE: return 'ENTERPRISE TIER';
      default: return 'NO ACTIVE SUBSCRIPTION';
    }
  };

  return (
    <Card sx={{ position: 'relative', width: 340, minHeight: 380, borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', background: '#121212', color: '#fff' }}>
      {!boardDeployment$ && (
        <EmptyCardContent onCreateBoardCallback={onCreateBoard} onJoinBoardCallback={onJoinBoard} />
      )}

      {boardDeployment$ && (
        <React.Fragment>
          <Backdrop sx={{ position: 'absolute', color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }} open={isWorking}>
            <CircularProgress color="secondary" />
          </Backdrop>
          <Backdrop sx={{ position: 'absolute', color: '#ff4d4d', zIndex: (theme) => theme.zIndex.drawer + 1, flexDirection: 'column', padding: 2 }} open={!!errorMessage}>
            <StopIcon fontSize="large" />
            <Typography variant="body2" sx={{ textAlign: 'center', mt: 1 }}>{errorMessage}</Typography>
          </Backdrop>

          <CardHeader
            avatar={
              boardState?.state !== PlanTier.INACTIVE ? (
                <VerifiedUserIcon color="success" />
              ) : (
                <LockOpenIcon color="disabled" />
              )
            }
            titleTypographyProps={{ color: '#fff', fontWeight: 'bold' }}
            title={toShortFormatContractAddress(deployedBoardAPI?.deployedContractAddress) ?? '<YOUR_DEPLOYED_CONTRACT_ADDRESS>'}
            action={
              deployedBoardAPI?.deployedContractAddress ? (
                <IconButton title="Copy contract address" onClick={onCopyContractAddress} sx={{ color: '#aaa' }}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              ) : (
                <Skeleton variant="circular" width={20} height={20} />
              )
            }
          />

          <CardContent>
            {boardState ? (
              <Stack spacing={2}>
                <Chip
                  icon={<StarIcon />}
                  label={getTierLabel(boardState.state)}
                  color={boardState.state !== PlanTier.INACTIVE ? 'primary' : 'default'}
                  variant={boardState.state !== PlanTier.INACTIVE ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 'bold' }}
                />

                <Typography variant="body2" color="gray">
                  Privacy Guarantee: Zero-Knowledge proof verifies your subscription status without revealing your identity or payment key.
                </Typography>

                <Stack spacing={1}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    disabled={boardState.state === PlanTier.BASIC}
                    onClick={() => onSubscribe(PlanTier.BASIC)}
                  >
                    Subscribe Basic (0.1 NIGHT)
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    size="small"
                    disabled={boardState.state === PlanTier.PREMIUM}
                    onClick={() => onSubscribe(PlanTier.PREMIUM)}
                  >
                    Subscribe Premium (0.5 NIGHT)
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    disabled={boardState.state === PlanTier.ENTERPRISE}
                    onClick={() => onSubscribe(PlanTier.ENTERPRISE)}
                  >
                    Subscribe Enterprise (1.0 NIGHT)
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Skeleton variant="rectangular" width="100%" height={180} />
            )}
          </CardContent>

          <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
            {deployedBoardAPI && boardState ? (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteIcon />}
                disabled={boardState.state === PlanTier.INACTIVE}
                onClick={onCancelSubscription}
              >
                Cancel Subscription
              </Button>
            ) : (
              <Skeleton variant="rectangular" width={120} height={30} />
            )}
          </CardActions>
        </React.Fragment>
      )}
    </Card>
  );
};

const toShortFormatContractAddress = (contractAddress: ContractAddress | undefined): React.ReactElement | undefined =>
  contractAddress ? (
    <span data-testid="subscription-address">
      0x{contractAddress.replace(/^[A-Fa-f0-9]{6}([A-Fa-f0-9]{8}).*([A-Fa-f0-9]{8})$/g, '$1...$2')}
    </span>
  ) : undefined;
