/**
 * Blockchain Event Indexer
 *
 * THE BRAIN OF THE BACKEND — this is where blockchain meets database.
 */

const { ethers } = require('ethers');
const {
  getElectionFactoryContract,
  getElectionContract,
  getTreasuryContract,
} = require('../blockchain/contracts');
const { getProvider } = require('../blockchain/provider');
const { Election, Proposal, Vote, SyncState } = require('../models');
const { emitGlobal, emitToDAO } = require('../websocket/socketManager');
const logger = require('../config/logger');

/**
 * Handles an ElectionCreated event
 */
async function handleElectionCreated(orgId, electionAddress, treasuryAddress, name, timelockDelay, quorumVotes, creator, event) {
  try {
    const txReceipt = event.log || event;

    const electionData = {
      orgId,
      contractAddress: electionAddress.toLowerCase(),
      treasuryAddress: treasuryAddress.toLowerCase(),
      name,
      timelockDelay: Number(timelockDelay),
      quorumVotes: Number(quorumVotes),
      creator: creator.toLowerCase(),
      blockNumber: txReceipt.blockNumber,
      transactionHash: txReceipt.transactionHash,
    };

    const exists = await Election.findOne({ contractAddress: electionData.contractAddress });

    const election = await Election.findOneAndUpdate(
      { contractAddress: electionData.contractAddress },
      electionData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    logger.info(`📦 Election indexed: "${name}" at ${electionAddress}`);

    if (!exists) {
      emitGlobal('election:created', election.toObject());
    }
  } catch (error) {
    logger.error('Error handling ElectionCreated event:', error);
  }
}

/**
 * Handles a ProposalCreated event from an Election contract.
 */
async function handleProposalCreated(electionAddress, id, proposer, description, endTime, target, value, event) {
  try {
    const txReceipt = event.log || event;

    const electionContract = getElectionContract(electionAddress);
    let optionNames = [];
    try {
      const proposalData = await electionContract.getProposal(id);
      optionNames = proposalData.optionNames || [];
    } catch (err) {
      logger.warn(`Could not fetch proposal options from chain for proposal ${id}:`, err.message);
      optionNames = ['Option 1', 'Option 2']; // Fallback
    }

    const options = optionNames.map((name) => ({
      name,
      voteCount: '0',
    }));

    const proposalData = {
      proposalId: id.toString(),
      daoAddress: electionAddress.toLowerCase(), // Keeping daoAddress field for compatibility or update to electionAddress
      proposer: proposer.toLowerCase(),
      description,
      endTime: new Date(Number(endTime) * 1000),
      options,
      status: 'active',
      target: (target || '0x0000000000000000000000000000000000000000').toLowerCase(),
      value: (value || 0).toString(),
      blockNumber: txReceipt.blockNumber,
      transactionHash: txReceipt.transactionHash,
    };

    const exists = await Proposal.findOne({
      daoAddress: proposalData.daoAddress,
      proposalId: proposalData.proposalId,
    });

    const proposal = await Proposal.findOneAndUpdate(
      { daoAddress: proposalData.daoAddress, proposalId: proposalData.proposalId },
      proposalData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (!exists) {
      await Election.findOneAndUpdate(
        { contractAddress: electionAddress.toLowerCase() },
        { $inc: { proposalCount: 1 } }
      );
    }

    logger.info(`📝 Proposal indexed: #${id} in Election ${electionAddress}`);

    if (!exists) {
      emitToDAO(electionAddress, 'proposal:created', proposal.toObject());
      emitGlobal('proposal:created', proposal.toObject());
    }
  } catch (error) {
    logger.error('Error handling ProposalCreated event:', error);
  }
}

/**
 * Handles a VoteCast event from a specific Election contract.
 */
async function handleVoteCast(electionAddress, proposalId, voter, optionIndex, event) {
  try {
    const txReceipt = event.log || event;

    const voteData = {
      daoAddress: electionAddress.toLowerCase(),
      proposalId: proposalId.toString(),
      voter: voter.toLowerCase(),
      optionIndex: Number(optionIndex),
      weight: "1", // 1 student = 1 vote
      blockNumber: txReceipt.blockNumber,
      transactionHash: txReceipt.transactionHash,
    };

    const exists = await Vote.findOne({
      daoAddress: voteData.daoAddress,
      proposalId: voteData.proposalId,
      voter: voteData.voter,
    });

    const vote = await Vote.findOneAndUpdate(
      {
        daoAddress: voteData.daoAddress,
        proposalId: voteData.proposalId,
        voter: voteData.voter,
      },
      voteData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (!exists) {
      await Proposal.findOneAndUpdate(
        { daoAddress: voteData.daoAddress, proposalId: voteData.proposalId },
        { $inc: { totalVotesCast: 1 } }
      );
    }

    try {
      const electionContract = getElectionContract(electionAddress);
      const proposalData = await electionContract.getProposal(proposalId);
      const updatedOptions = (proposalData.optionNames || []).map((name, i) => ({
        name,
        voteCount: (proposalData.optionVotes[i] || 0n).toString(),
      }));

      await Proposal.findOneAndUpdate(
        { daoAddress: voteData.daoAddress, proposalId: voteData.proposalId },
        { options: updatedOptions }
      );
    } catch (err) {
      logger.warn('Could not refresh proposal tallies from chain:', err.message);
    }

    if (!exists) {
      await Election.findOneAndUpdate(
        { contractAddress: electionAddress.toLowerCase() },
        { $inc: { totalVotes: 1 } }
      );
    }

    logger.info(`🗳️  Vote indexed: voter ${voter} on proposal #${proposalId}`);

    if (!exists) {
      emitToDAO(electionAddress, 'vote:cast', vote.toObject());
      emitGlobal('vote:cast', vote.toObject());
      
      const redis = require('../config/redis');
      if (redis.isOpen) await redis.del('leaderboard');
    }
  } catch (error) {
    logger.error('Error handling VoteCast event:', error);
  }
}

async function handleProposalQueued(electionAddress, proposalId, timelockTxId) {
  try {
    const proposal = await Proposal.findOneAndUpdate(
      { daoAddress: electionAddress.toLowerCase(), proposalId: proposalId.toString() },
      { status: 'queued', timelockTxId: timelockTxId },
      { new: true }
    );
    if (proposal) {
      logger.info(`⏳ Proposal #${proposalId} queued in timelock with txId ${timelockTxId}`);
      emitToDAO(electionAddress, 'proposal:updated', proposal.toObject());
    }
  } catch (error) {
    logger.error('Error handling ProposalQueued event:', error);
  }
}

async function handleProposalExecuted(electionAddress, proposalId) {
  try {
    const proposal = await Proposal.findOne({ daoAddress: electionAddress.toLowerCase(), proposalId: proposalId.toString() });
    
    if (proposal && proposal.status !== 'queued') {
        proposal.status = 'executed';
        await proposal.save();
        logger.info(`✅ Proposal #${proposalId} executed`);
        emitToDAO(electionAddress, 'proposal:updated', proposal.toObject());
        emitToDAO(electionAddress, 'proposal:executed', { proposalId });
    }
  } catch (error) {
    logger.error('Error handling ProposalExecuted event:', error);
  }
}

async function handleProposalCancelled(electionAddress, proposalId, event) {
  try {
    const txReceipt = event.log || event;
    const provider = getProvider();
    const block = await provider.getBlock(txReceipt.blockNumber);
    const cancelTime = new Date((block.timestamp - 1) * 1000);

    const proposal = await Proposal.findOneAndUpdate(
      { daoAddress: electionAddress.toLowerCase(), proposalId: proposalId.toString() },
      { status: 'closed', endTime: cancelTime },
      { new: true }
    );
    if (proposal) {
      logger.info(`🚫 Proposal #${proposalId} cancelled (endTime set to ${cancelTime})`);
      emitToDAO(electionAddress, 'proposal:updated', proposal.toObject());
      emitToDAO(electionAddress, 'proposal:cancelled', { proposalId });
    }
  } catch (error) {
    logger.error('Error handling ProposalCancelled event:', error);
  }
}

async function handleTransactionExecuted(treasuryAddress, electionAddress, txId) {
  try {
    const proposal = await Proposal.findOneAndUpdate(
      { daoAddress: electionAddress.toLowerCase(), timelockTxId: txId },
      { status: 'finalized' },
      { new: true }
    );
    if (proposal) {
      logger.info(`💸 Financial Proposal #${proposal.proposalId} finalized and funds transferred`);
      emitToDAO(electionAddress, 'proposal:updated', proposal.toObject());
    }
  } catch (error) {
    logger.error('Error handling TransactionExecuted event:', error);
  }
}

let indexerInterval = null;
let isPolling = false;

async function pollBlockchain() {
  if (isPolling) return;
  isPolling = true;

  try {
    const provider = getProvider();
    if (!provider) return;

    const currentBlock = await provider.getBlockNumber();
    const electionFactory = getElectionFactoryContract();

    // 1. Sync Factory
    if (electionFactory) {
      const factorySync = await SyncState.findOne({ contractId: 'ElectionFactory' });
      let startBlock = factorySync ? factorySync.lastSyncedBlock + 1 : Math.max(0, currentBlock - 49000);
      if (factorySync && factorySync.lastSyncedBlock > currentBlock) {
        startBlock = Math.max(0, currentBlock - 49000);
      }
      if (currentBlock - startBlock > 49000) {
         startBlock = currentBlock - 49000;
      }

      if (startBlock <= currentBlock) {
        const events = await electionFactory.queryFilter('ElectionCreated', startBlock, currentBlock);
        for (const event of events) {
          const [orgId, electionAddress, treasuryAddress, name, timelockDelay, quorumVotes, creator] = event.args;
          await handleElectionCreated(orgId, electionAddress, treasuryAddress, name, timelockDelay, quorumVotes, creator, event);
        }
        await SyncState.findOneAndUpdate(
          { contractId: 'ElectionFactory' },
          { lastSyncedBlock: currentBlock },
          { upsert: true }
        );
      }
    }

    // 2. Sync existing Elections
    const existingElections = await Election.find({}).lean();
    for (const election of existingElections) {
      const electionAddress = election.contractAddress;
      const syncKey = `Election:${electionAddress}`;
      const electionSync = await SyncState.findOne({ contractId: syncKey });
      
      let startBlock = electionSync ? electionSync.lastSyncedBlock + 1 : election.blockNumber || Math.max(0, currentBlock - 49000);
      if (electionSync && electionSync.lastSyncedBlock > currentBlock) {
        startBlock = election.blockNumber || Math.max(0, currentBlock - 49000);
      }
      if (currentBlock - startBlock > 49000) {
         startBlock = currentBlock - 49000;
      }

      if (startBlock <= currentBlock) {
        try {
          const electionContract = getElectionContract(electionAddress);
          if (!electionContract) continue;

          // ProposalCreated
          const pEvents = await electionContract.queryFilter('ProposalCreated', startBlock, currentBlock);
          for (const ev of pEvents) {
            const [id, proposer, description, endTime, target, value] = ev.args;
            await handleProposalCreated(electionAddress, id, proposer, description, endTime, target, value, ev);
          }

          // VoteCast
          const vEvents = await electionContract.queryFilter('VoteCast', startBlock, currentBlock);
          for (const ev of vEvents) {
            const [proposalId, voter, optionIndex] = ev.args;
            await handleVoteCast(electionAddress, proposalId, voter, optionIndex, ev);
          }

          // ProposalQueued
          const qEvents = await electionContract.queryFilter('ProposalQueued', startBlock, currentBlock);
          for (const ev of qEvents) {
            const [proposalId, timelockTxId] = ev.args;
            await handleProposalQueued(electionAddress, proposalId, timelockTxId);
          }

          // ProposalExecuted
          const eEvents = await electionContract.queryFilter('ProposalExecuted', startBlock, currentBlock);
          for (const ev of eEvents) {
            const [proposalId] = ev.args;
            await handleProposalExecuted(electionAddress, proposalId);
          }

          // ProposalCancelled
          const cEvents = await electionContract.queryFilter('ProposalCancelled', startBlock, currentBlock);
          for (const ev of cEvents) {
            const [proposalId] = ev.args;
            await handleProposalCancelled(electionAddress, proposalId, ev);
          }

          // Treasury TransactionExecuted
          if (election.treasuryAddress) {
            const treasuryContract = getTreasuryContract(election.treasuryAddress);
            if (treasuryContract) {
              const tEvents = await treasuryContract.queryFilter('TransactionExecuted', startBlock, currentBlock);
              for (const ev of tEvents) {
                const [txId] = ev.args;
                await handleTransactionExecuted(election.treasuryAddress, electionAddress, txId);
              }
            }
          }

          await SyncState.findOneAndUpdate(
            { contractId: syncKey },
            { lastSyncedBlock: currentBlock },
            { upsert: true }
          );
        } catch (err) {
          logger.error(`Error polling events for Election ${electionAddress}:`, err.message);
          await SyncState.findOneAndUpdate(
            { contractId: syncKey },
            { lastSyncedBlock: currentBlock },
            { upsert: true }
          );
        }
      }
    }
  } catch (err) {
    logger.error('Error in block polling loop:', err);
  } finally {
    isPolling = false;
  }
}

async function startEventIndexer() {
  const provider = getProvider();
  if (!provider) {
    logger.warn('⚠️  Blockchain provider not available — event indexer disabled.');
    return;
  }

  await pollBlockchain();
  indexerInterval = setInterval(pollBlockchain, 2000);
  logger.info('🚀 Polling event indexer started successfully.');
}

async function stopEventIndexer() {
  if (indexerInterval) {
    clearInterval(indexerInterval);
    indexerInterval = null;
  }
  logger.info('Event indexer stopped.');
}

module.exports = { startEventIndexer, stopEventIndexer };
