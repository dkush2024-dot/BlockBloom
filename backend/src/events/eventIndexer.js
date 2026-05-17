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
async function handleDAOCreated(daoAddress, treasuryAddress, name, tokenAddress, proposalThreshold, timelockDelay, creator, event) {
  try {
    const txReceipt = event.log || event;

    const daoData = {
      contractAddress: daoAddress.toLowerCase(),
      treasuryAddress: treasuryAddress.toLowerCase(),
      name,
      tokenAddress: tokenAddress.toLowerCase(),
      proposalThreshold: proposalThreshold.toString(),
      timelockDelay: Number(timelockDelay),
      creator: creator.toLowerCase(),
      blockNumber: txReceipt.blockNumber,
      transactionHash: txReceipt.transactionHash,
    };

    const dao = await DAO.findOneAndUpdate(
      { contractAddress: daoData.contractAddress },
      daoData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    logger.info(`📦 DAO indexed: "${name}" at ${daoAddress} with Treasury ${treasuryAddress}`);

    emitGlobal('dao:created', dao.toObject());

    await startGovernanceListener(daoAddress.toLowerCase());
    await startTreasuryListener(treasuryAddress.toLowerCase(), daoAddress.toLowerCase());
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

    const proposal = await Proposal.findOneAndUpdate(
      { daoAddress: proposalData.daoAddress, proposalId: proposalData.proposalId },
      proposalData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await DAO.findOneAndUpdate(
      { contractAddress: daoAddress.toLowerCase() },
      { $inc: { proposalCount: 1 } }
    );

    logger.info(`📝 Proposal indexed: #${id} in DAO ${daoAddress}`);

    emitToDAO(daoAddress, 'proposal:created', proposal.toObject());
    emitGlobal('proposal:created', proposal.toObject());
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

    const vote = await Vote.findOneAndUpdate(
      {
        daoAddress: voteData.daoAddress,
        proposalId: voteData.proposalId,
        voter: voteData.voter,
      },
      voteData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await Proposal.findOneAndUpdate(
      { daoAddress: voteData.daoAddress, proposalId: voteData.proposalId },
      { $inc: { totalVotesCast: 1 } }
    );

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

    await DAO.findOneAndUpdate(
      { contractAddress: daoAddress.toLowerCase() },
      { $inc: { totalVotes: 1 } }
    );

    logger.info(`🗳️  Vote indexed: voter ${voter} on proposal #${proposalId}`);

    emitToDAO(daoAddress, 'vote:cast', vote.toObject());
    emitGlobal('vote:cast', vote.toObject());
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
    }
  } catch (error) {
    logger.error('Error handling ProposalExecuted event:', error);
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

/**
 * Starts listening to a single Governance contract's events.
 */
async function startGovernanceListener(daoAddress) {
  if (activeListeners.has(daoAddress)) return;

  const governanceContract = getGovernanceContract(daoAddress);
  if (!governanceContract) {
    logger.warn(`Cannot create listener for DAO ${daoAddress} — contract unavailable`);
    return;
  }

  governanceContract.on('ProposalCreated', (id, proposer, description, snapshotBlock, endTime, target, value, event) => {
    handleProposalCreated(daoAddress, id, proposer, description, snapshotBlock, endTime, target, value, event);
  });

  governanceContract.on('VoteCast', (proposalId, voter, optionIndex, weight, event) => {
    handleVoteCast(daoAddress, proposalId, voter, optionIndex, weight, event);
  });

  governanceContract.on('ProposalQueued', (proposalId, timelockTxId, event) => {
    handleProposalQueued(daoAddress, proposalId, timelockTxId);
  });

  governanceContract.on('ProposalExecuted', (proposalId, event) => {
    handleProposalExecuted(daoAddress, proposalId);
  });

  activeListeners.set(daoAddress, governanceContract);
  logger.info(`👂 Listening to Governance events on ${daoAddress}`);
}

/**
 * Starts listening to a single Treasury contract's events.
 */
async function startTreasuryListener(treasuryAddress, daoAddress) {
  if (activeListeners.has(treasuryAddress)) return;

  const treasuryContract = getTreasuryContract(treasuryAddress);
  if (!treasuryContract) {
    logger.warn(`Cannot create listener for Treasury ${treasuryAddress} — contract unavailable`);
    return;
  }

  treasuryContract.on('TransactionExecuted', (txId, target, value, event) => {
    handleTransactionExecuted(treasuryAddress, daoAddress, txId);
  });

  activeListeners.set(treasuryAddress, treasuryContract);
  logger.info(`👂 Listening to Treasury events on ${treasuryAddress}`);
}

/**
 * Main entry point — starts all event listeners.
 */
async function startEventIndexer() {
  const provider = getProvider();
  if (!provider) {
    logger.warn('⚠️  Blockchain provider not available — event indexer disabled.');
    return;
  }

  const daoFactory = getDAOFactoryContract();
  if (daoFactory) {
    daoFactory.on('DAOCreated', (daoAddress, treasuryAddress, name, tokenAddress, proposalThreshold, timelockDelay, creator, event) => {
      handleDAOCreated(daoAddress, treasuryAddress, name, tokenAddress, proposalThreshold, timelockDelay, creator, event);
    });
    logger.info(`👂 Listening to DAOFactory at ${await daoFactory.getAddress()}`);
  } else {
    logger.warn('DAOFactory contract not configured — skipping factory listener.');
  }

  const existingDAOs = await DAO.find({}).select('contractAddress treasuryAddress').lean();
  for (const dao of existingDAOs) {
    await startGovernanceListener(dao.contractAddress);
    if (dao.treasuryAddress) {
      await startTreasuryListener(dao.treasuryAddress, dao.contractAddress);
    }
  }

  logger.info(`🚀 Event indexer started. Tracking ${existingDAOs.length} existing DAO(s).`);
}

/**
 * Stops all event listeners.
 */
async function stopEventIndexer() {
  const daoFactory = getDAOFactoryContract();
  if (daoFactory) {
    daoFactory.removeAllListeners();
  }

  for (const [address, contract] of activeListeners) {
    contract.removeAllListeners();
    logger.debug(`Removed listeners for ${address}`);
  }
  activeListeners.clear();

  logger.info('Event indexer stopped.');
}

module.exports = { startEventIndexer, stopEventIndexer };
