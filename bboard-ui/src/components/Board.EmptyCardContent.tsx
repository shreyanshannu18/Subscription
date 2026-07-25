// Subscription Empty Card Content
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { CardActions, CardContent, IconButton, Tooltip, Typography } from '@mui/material';
import { PostAddOutlined as BoardAddIcon, AddCircleOutlined as CreateBoardIcon, AddLinkOutlined as JoinBoardIcon } from '@mui/icons-material';
import { TextPromptDialog } from './TextPromptDialog.js';

export interface EmptyCardContentProps {
  onCreateBoardCallback: () => void;
  onJoinBoardCallback: (contractAddress: ContractAddress) => void;
}

export const EmptyCardContent: React.FC<Readonly<EmptyCardContentProps>> = ({
  onCreateBoardCallback,
  onJoinBoardCallback,
}) => {
  const [textPromptOpen, setTextPromptOpen] = useState(false);

  return (
    <React.Fragment>
      <CardContent sx={{ pt: 6 }}>
        <Typography align="center" variant="h1" color="primary">
          <BoardAddIcon fontSize="large" />
        </Typography>
        <Typography data-testid="subscription-prompt-msg" align="center" variant="body2" color="gray" sx={{ mt: 2 }}>
          Deploy a new Subscription Contract, or join an existing deployed contract address (<Typography component="span" sx={{ fontFamily: 'monospace', color: '#90caf9' }}>&lt;YOUR_DEPLOYED_CONTRACT_ADDRESS&gt;</Typography>)...
        </Typography>
      </CardContent>
      <CardActions disableSpacing sx={{ justifyContent: 'center', pb: 4 }}>
        <Tooltip title="Deploy Subscription Contract">
          <IconButton data-testid="board-deploy-btn" onClick={onCreateBoardCallback} color="primary">
            <CreateBoardIcon fontSize="large" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Join Existing Contract">
          <IconButton
            data-testid="board-join-btn"
            color="secondary"
            onClick={() => {
              setTextPromptOpen(true);
            }}
          >
            <JoinBoardIcon fontSize="large" />
          </IconButton>
        </Tooltip>
      </CardActions>
      <TextPromptDialog
        prompt="Enter contract address (<YOUR_DEPLOYED_CONTRACT_ADDRESS>)"
        isOpen={textPromptOpen}
        onCancel={() => {
          setTextPromptOpen(false);
        }}
        onSubmit={(text) => {
          setTextPromptOpen(false);
          onJoinBoardCallback(text);
        }}
      />
    </React.Fragment>
  );
};
