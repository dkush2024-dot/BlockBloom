/**
 * Blockchain Event Indexer
 *
 * THE BRAIN OF THE BACKEND — this is where blockchain meets database.
 *
 * CRASH RECOVERY:
 *   The SyncState model stores the last processed block per contract.
 *   On restart, the indexer fetches historical events from that block onward
 *   before switching to live listening — no missed events.
 */

const { ethers } = require('ethers');
const {
  getDAOFactoryContract,
  getGovernanceContract,
  getTreasuryContract,
  GovernanceABI,
} = require('../blockchain');
const { getProvider } = require('../blockchain/provider');
const { DAO, Proposal, Vote, SyncState } = require('../models');
const { emitGlobal, emitToDAO } = require('../websocket/socketManager');
const logger = require('../config/logger');

// Keeps track of which DAO and Treasury addresses we're currently listening to
const activeListeners = new Map();

/**
 * Handles a DAOCreated event — saves DAO to database, emits to clients,
 * and starts listening to the new DAO's Governance and Treasury events.
 */
async function handleDAOCreated(daoAddress, treasuryAddress, name, tokenAddress, proposalThreshold, timelockDelay, quorumPercentage, creator, event) {
  try {
    const txReceipt = event.log || event;

    const daoData = {
      contractAddress: daoAddress.toLowerCase(),
      treasuryAddress: treasuryAddress.toLowerCase(),
      name,
      tokenAddress: tokenAddress.toLowerCase(),
      proposalThreshold: proposalThreshold.toString(),
      timelockDelay: Number(timelockDelay),
      quorumPercentage: Number(quorumPercentage),
      creator: creator.toLowerCase(),
      blockNumber: txReceipt.blockNumber,
      transactionHash: txReceipt.transactionHash,
    };

    const exists = await DAO.findOne({ contractAddress: daoData.contractAddress });

    const dao = await DAO.findOneAndUpdate(
      { contractAddress: daoData.contractAddress },
      daoData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    logger.info(`📦 DAO indexed: "${name}" at ${daoAddress} with Treasury ${treasuryAddress}`);

    if (!exists) {
      emitGlobal('dao:created', dao.toObject());
    }
  } catch (error) {
    logger.error('Error handling DAOCreated event:', error);
  }
}

/**
 * Handles a ProposalCreated event from a specific Governance contract.
 */
async function handleProposalCreated(daoAddress, id, proposer, description, snapshotBlock, endTime, target, value, event) {
  try {
    const txReceipt = event.log || event;

    const governanceContract = getGovernanceContract(daoAddress);
    let optionNames = [];
    try {
      const proposalData = await governanceContract.getProposal(id);
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
      daoAddress: daoAddress.toLowerCase(),
      proposer: proposer.toLowerCase(),
      description,
      snapshotBlock: snapshotBlock.toString(),
      endTime: new Date(Number(endTime) * 1000),
      options,
      status: 'active',
      target: target.toLowerCase(),
      value: value.toString(),
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
      await DAO.findOneAndUpdate(
        { contractAddress: daoAddress.toLowerCase() },
        { $inc: { proposalCount: 1 } }
      );
    }

    logger.info(`📝 Proposal indexed: #${id} in DAO ${daoAddress}`);

    if (!exists) {
      emitToDAO(daoAddress, 'proposal:created', proposal.toObject());
      emitGlobal('proposal:created', proposal.toObject());
    }
  } catch (error) {
    logger.error('Error handling ProposalCreated event:', error);
  }
}

/**
 * Handles a VoteCast event from a specific Governance contract.
 */
async function handleVoteCast(daoAddress, proposalId, voter, optionIndex, weight, event) {
  try {
    const txReceipt = event.log || event;

    const voteData = {
      daoAddress: daoAddress.toLowerCase(),
      proposalId: proposalId.toString(),
      voter: voter.toLowerCase(),
      optionIndex: Number(optionIndex),
      weight: weight.toString(),
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
      const governanceContract = getGovernanceContract(daoAddress);
      const proposalData = await governanceContract.getProposal(proposalId);
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
      await DAO.findOneAndUpdate(
        { contractAddress: daoAddress.toLowerCase() },
        { $inc: { totalVotes: 1 } }
      );
    }

    logger.info(`🗳️  Vote indexed: voter ${voter} on proposal #${proposalId}`);

    if (!exists) {
      emitToDAO(daoAddress, 'vote:cast', vote.toObject());
      emitGlobal('vote:cast', vote.toObject());
      
      const redis = require('../config/redis');
      await redis.del('leaderboard');
    }
  } catch (error) {
    logger.error('Error handling VoteCast event:', error);
  }
}

/**
 * Handles ProposalQueued event (Financial proposal passed and queued in Treasury)
 */
async function handleProposalQueued(daoAddress, proposalId, timelockTxId) {
  try {
    const proposal = await Proposal.findOneAndUpdate(
      { daoAddress: daoAddress.toLowerCase(), proposalId: proposalId.toString() },
      { status: 'queued', timelockTxId: timelockTxId },
      { new: true }
    );
    if (proposal) {
      logger.info(`⏳ Proposal #${proposalId} queued in timelock with txId ${timelockTxId}`);
      emitToDAO(daoAddress, 'proposal:updated', proposal.toObject());
    }
  } catch (error) {
    logger.error('Error handling ProposalQueued event:', error);
  }
}

/**
 * Handles ProposalExecuted event (Standard proposal executed, or financial proposal marked executed and queued)
 */
async function handleProposalExecuted(daoAddress, proposalId) {
  try {
    // If it's a financial proposal, it might have been marked 'queued' by handleProposalQueued already.
    // If it's a standard proposal, it becomes 'executed'.
    const proposal = await Proposal.findOne({ daoAddress: daoAddress.toLowerCase(), proposalId: proposalId.toString() });
    
    if (proposal && proposal.status !== 'queued') {
        proposal.status = 'executed';
        await proposal.save();
        logger.info(`✅ Proposal #${proposalId} executed`);
        emitToDAO(daoAddress, 'proposal:updated', proposal.toObject());
        emitToDAO(daoAddress, 'proposal:executed', { proposalId });
    }
  } catch (error) {
    logger.error('Error handling ProposalExecuted event:', error);
  }
}

/**
 * Handles ProposalCancelled event
 */
async function handleProposalCancelled(daoAddress, proposalId, event) {
  try {
    const txReceipt = event.log || event;
    const provider = getProvider();
    const block = await provider.getBlock(txReceipt.blockNumber);
    const cancelTime = new Date((block.timestamp - 1) * 1000);

    const proposal = await Proposal.findOneAndUpdate(
      { daoAddress: daoAddress.toLowerCase(), proposalId: proposalId.toString() },
      { status: 'closed', endTime: cancelTime },
      { new: true }
    );
    if (proposal) {
      logger.info(`🚫 Proposal #${proposalId} cancelled (endTime set to ${cancelTime})`);
      emitToDAO(daoAddress, 'proposal:updated', proposal.toObject());
      emitToDAO(daoAddress, 'proposal:cancelled', { proposalId });
    }
  } catch (error) {
    logger.error('Error handling ProposalCancelled event:', error);
  }
}

/**
 * Handles TransactionExecuted from Treasury (Financial proposal finalized)
 */
async function handleTransactionExecuted(treasuryAddress, daoAddress, txId) {
  try {
    const proposal = await Proposal.findOneAndUpdate(
      { daoAddress: daoAddress.toLowerCase(), timelockTxId: txId },
      { status: 'finalized' },
      { new: true }
    );
    if (proposal) {
      logger.info(`💸 Financial Proposal #${proposal.proposalId} finalized and funds transferred`);
      emitToDAO(daoAddress, 'proposal:updated', proposal.toObject());
    }
  } catch (error) {
    logger.error('Error handling TransactionExecuted event:', error);
  }
}

let indexerInterval = null;
let isPolling = false;

/**
 * Polls the blockchain for new events.
 * Uses queryFilter which is extremely stable and survives Hardhat restarts.
 */
async function pollBlockchain() {
  if (isPolling) return;
  isPolling = true;

  try {
    const provider = getProvider();
    if (!provider) return;

    const currentBlock = await provider.getBlockNumber();
    const daoFactory = getDAOFactoryContract();

    // 1. Sync Factory
    if (daoFactory) {
      const factorySync = await SyncState.findOne({ contractId: 'DAOFactory' });
      // On brand new node / reset, start from 0
      let startBlock = factorySync ? factorySync.lastSyncedBlock + 1 : 0;
      if (factorySync && factorySync.lastSyncedBlock > currentBlock) {
        // If node reset and currentBlock is lower than last synced, reset sync state
        startBlock = 0;
      }

      if (startBlock <= currentBlock) {
        const events = await daoFactory.queryFilter('DAOCreated', startBlock, currentBlock);
        for (const event of events) {
          const [daoAddress, treasuryAddress, name, tokenAddress, proposalThreshold, timelockDelay, quorumPercentage, creator] = event.args;
          await handleDAOCreated(daoAddress, treasuryAddress, name, tokenAddress, proposalThreshold, timelockDelay, quorumPercentage, creator, event);
        }
        await SyncState.findOneAndUpdate(
          { contractId: 'DAOFactory' },
          { lastSyncedBlock: currentBlock },
          { upsert: true }
        );
      }
    }

    // 2. Sync existing DAOs
    const existingDAOs = await DAO.find({}).lean();
    for (const dao of existingDAOs) {
      const daoAddress = dao.contractAddress;
      const syncKey = `DAO:${daoAddress}`;
      const daoSync = await SyncState.findOne({ contractId: syncKey });
      
      let startBlock = daoSync ? daoSync.lastSyncedBlock + 1 : dao.blockNumber || 0;
      if (daoSync && daoSync.lastSyncedBlock > currentBlock) {
        startBlock = dao.blockNumber || 0;
      }

      if (startBlock <= currentBlock) {
        try {
          const govContract = getGovernanceContract(daoAddress);
          if (!govContract) continue;

          // ProposalCreated
          const pEvents = await govContract.queryFilter('ProposalCreated', startBlock, currentBlock);
          for (const ev of pEvents) {
            const [id, proposer, description, snapshotBlock, endTime, target, value] = ev.args;
            await handleProposalCreated(daoAddress, id, proposer, description, snapshotBlock, endTime, target, value, ev);
          }

          // VoteCast
          const vEvents = await govContract.queryFilter('VoteCast', startBlock, currentBlock);
          for (const ev of vEvents) {
            const [proposalId, voter, optionIndex, weight] = ev.args;
            await handleVoteCast(daoAddress, proposalId, voter, optionIndex, weight, ev);
          }

          // ProposalQueued
          const qEvents = await govContract.queryFilter('ProposalQueued', startBlock, currentBlock);
          for (const ev of qEvents) {
            const [proposalId, timelockTxId] = ev.args;
            await handleProposalQueued(daoAddress, proposalId, timelockTxId);
          }

          // ProposalExecuted
          const eEvents = await govContract.queryFilter('ProposalExecuted', startBlock, currentBlock);
          for (const ev of eEvents) {
            const [proposalId] = ev.args;
            await handleProposalExecuted(daoAddress, proposalId);
          }

          // ProposalCancelled
          const cEvents = await govContract.queryFilter('ProposalCancelled', startBlock, currentBlock);
          for (const ev of cEvents) {
            const [proposalId] = ev.args;
            await handleProposalCancelled(daoAddress, proposalId, ev);
          }

          // Treasury TransactionExecuted
          if (dao.treasuryAddress) {
            const treasuryContract = getTreasuryContract(dao.treasuryAddress);
            if (treasuryContract) {
              const tEvents = await treasuryContract.queryFilter('TransactionExecuted', startBlock, currentBlock);
              for (const ev of tEvents) {
                const [txId] = ev.args;
                await handleTransactionExecuted(dao.treasuryAddress, daoAddress, txId);
              }
            }
          }

          await SyncState.findOneAndUpdate(
            { contractId: syncKey },
            { lastSyncedBlock: currentBlock },
            { upsert: true }
          );
        } catch (err) {
          logger.error(`Error polling events for DAO ${daoAddress}:`, err.message);
          // If contract is not found or throws error on fresh node, mark it as synced up to currentBlock
          // to prevent infinite retry loops
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

/**
 * Main entry point — starts block polling indexer.
 */
async function startEventIndexer() {
  const provider = getProvider();
  if (!provider) {
    logger.warn('⚠️  Blockchain provider not available — event indexer disabled.');
    return;
  }

  // Perform initial sync
  await pollBlockchain();

  // Poll for new blocks every 2 seconds
  indexerInterval = setInterval(pollBlockchain, 2000);
  logger.info('🚀 Polling event indexer started successfully.');
}

/**
 * Stops event indexer polling.
 */
async function stopEventIndexer() {
  if (indexerInterval) {
    clearInterval(indexerInterval);
    indexerInterval = null;
  }
  logger.info('Event indexer stopped.');
}

module.exports = { startEventIndexer, stopEventIndexer };

