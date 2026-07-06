const { getChannel, QUEUE_NAME, fallbackEmitter } = require('../config/rabbitmq');
const logger = require('../config/logger');
const { Election, Proposal, Vote } = require('../models');
const { emitGlobal, emitToDAO } = require('../websocket/socketManager');
const { getElectionContract, getTreasuryContract } = require('../blockchain/contracts');

async function processEvent(msg) {
  if (!msg) return;

  const routingKey = msg.fields.routingKey;
  const content = msg.content.toString();
  let data;

  try {
    data = JSON.parse(content);
  } catch (err) {
    logger.error('Failed to parse RabbitMQ message', err);
    getChannel().ack(msg);
    return;
  }

  try {
    switch (routingKey) {
      case 'election.created':
        await handleElectionCreated(data);
        break;
      case 'proposal.created':
        await handleProposalCreated(data);
        break;
      case 'vote.cast':
        await handleVoteCast(data);
        break;
      case 'proposal.queued':
        await handleProposalQueued(data);
        break;
      case 'proposal.executed':
        await handleProposalExecuted(data);
        break;
      case 'proposal.cancelled':
        await handleProposalCancelled(data);
        break;
      case 'transaction.executed':
        await handleTransactionExecuted(data);
        break;
      default:
        logger.warn('Unknown routing key received:', routingKey);
    }

    // Acknowledge the message so it's removed from the queue
    getChannel().ack(msg);
  } catch (error) {
    logger.error(`Error processing ${routingKey}:`, error);
    // Nack the message to requeue it (or configure dead-lettering)
    getChannel().nack(msg, false, true);
  }
}

async function handleElectionCreated(data) {
  const exists = await Election.findOne({ contractAddress: data.contractAddress });

  const election = await Election.findOneAndUpdate(
    { contractAddress: data.contractAddress },
    data,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info(`📦 Election indexed via Worker: "${data.name}" at ${data.contractAddress}`);

  if (!exists) {
    emitGlobal('election:created', election.toObject());
    
    const { AuditLog } = require('../models');
    await AuditLog.create({
      action: 'ELECTION_CREATED',
      performedBy: data.creator,
      targetResource: `Election:${data.contractAddress}`,
      metadata: { name: data.name }
    });
  }
}

async function handleProposalCreated(data) {
  const exists = await Proposal.findOne({
    daoAddress: data.daoAddress,
    proposalId: data.proposalId,
  });

  const proposal = await Proposal.findOneAndUpdate(
    { daoAddress: data.daoAddress, proposalId: data.proposalId },
    data,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (!exists) {
    await Election.findOneAndUpdate(
      { contractAddress: data.daoAddress },
      { $inc: { proposalCount: 1 } }
    );
  }

  logger.info(`📝 Proposal indexed via Worker: #${data.proposalId} in Election ${data.daoAddress}`);

  if (!exists) {
    emitToDAO(data.daoAddress, 'proposal:created', proposal.toObject());
    emitGlobal('proposal:created', proposal.toObject());

    const { AuditLog } = require('../models');
    await AuditLog.create({
      action: 'PROPOSAL_CREATED',
      performedBy: data.proposer,
      targetResource: `Proposal:${data.proposalId}`,
      metadata: { daoAddress: data.daoAddress, description: data.description }
    });
  }
}

async function handleVoteCast(data) {
  const exists = await Vote.findOne({
    daoAddress: data.daoAddress,
    proposalId: data.proposalId,
    voter: data.voter,
  });

  const vote = await Vote.findOneAndUpdate(
    {
      daoAddress: data.daoAddress,
      proposalId: data.proposalId,
      voter: data.voter,
    },
    data,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (!exists) {
    await Proposal.findOneAndUpdate(
      { daoAddress: data.daoAddress, proposalId: data.proposalId },
      { $inc: { totalVotesCast: 1 } }
    );
  }

  try {
    const electionContract = getElectionContract(data.daoAddress);
    const proposalData = await electionContract.getProposal(data.proposalId);
    const updatedOptions = (proposalData.optionNames || []).map((name, i) => ({
      name,
      voteCount: (proposalData.optionVotes[i] || 0n).toString(),
    }));

    await Proposal.findOneAndUpdate(
      { daoAddress: data.daoAddress, proposalId: data.proposalId },
      { options: updatedOptions }
    );
  } catch (err) {
    logger.warn('Could not refresh proposal tallies from chain via Worker:', err.message);
  }

  if (!exists) {
    await Election.findOneAndUpdate(
      { contractAddress: data.daoAddress },
      { $inc: { totalVotes: 1 } }
    );
  }

  logger.info(`🗳️ Vote indexed via Worker: voter ${data.voter} on proposal #${data.proposalId}`);

  if (!exists) {
    emitToDAO(data.daoAddress, 'vote:cast', vote.toObject());
    emitGlobal('vote:cast', vote.toObject());
    
    const redis = require('../config/redis');
    if (redis.isOpen) await redis.del('leaderboard');
  }
}

async function handleProposalQueued(data) {
  const proposal = await Proposal.findOneAndUpdate(
    { daoAddress: data.daoAddress, proposalId: data.proposalId },
    { status: 'queued', timelockTxId: data.timelockTxId },
    { new: true }
  );
  if (proposal) {
    logger.info(`⏳ Proposal #${data.proposalId} queued in timelock with txId ${data.timelockTxId} via Worker`);
    emitToDAO(data.daoAddress, 'proposal:updated', proposal.toObject());

    const { AuditLog } = require('../models');
    await AuditLog.create({
      action: 'PROPOSAL_QUEUED',
      performedBy: 'system',
      targetResource: `Proposal:${data.proposalId}`,
      metadata: { daoAddress: data.daoAddress, timelockTxId: data.timelockTxId }
    });
  }
}

async function handleProposalExecuted(data) {
  const proposal = await Proposal.findOne({ daoAddress: data.daoAddress, proposalId: data.proposalId });
  
  if (proposal && proposal.status !== 'queued') {
      proposal.status = 'executed';
      await proposal.save();
      logger.info(`✅ Proposal #${data.proposalId} executed via Worker`);
      emitToDAO(data.daoAddress, 'proposal:updated', proposal.toObject());
      emitToDAO(data.daoAddress, 'proposal:executed', { proposalId: data.proposalId });

      const { AuditLog } = require('../models');
      await AuditLog.create({
        action: 'PROPOSAL_EXECUTED',
        performedBy: 'system',
        targetResource: `Proposal:${data.proposalId}`,
        metadata: { daoAddress: data.daoAddress }
      });
  }
}

async function handleProposalCancelled(data) {
  const proposal = await Proposal.findOneAndUpdate(
    { daoAddress: data.daoAddress, proposalId: data.proposalId },
    { status: 'closed', endTime: data.endTime },
    { new: true }
  );
  if (proposal) {
    logger.info(`🚫 Proposal #${data.proposalId} cancelled via Worker`);
    emitToDAO(data.daoAddress, 'proposal:updated', proposal.toObject());
    emitToDAO(data.daoAddress, 'proposal:cancelled', { proposalId: data.proposalId });

    const { AuditLog } = require('../models');
    await AuditLog.create({
      action: 'PROPOSAL_CANCELLED',
      performedBy: 'system',
      targetResource: `Proposal:${data.proposalId}`,
      metadata: { daoAddress: data.daoAddress }
    });
  }
}

async function handleTransactionExecuted(data) {
  const proposal = await Proposal.findOneAndUpdate(
    { daoAddress: data.daoAddress, timelockTxId: data.txId },
    { status: 'finalized' },
    { new: true }
  );
  if (proposal) {
    logger.info(`💸 Financial Proposal #${proposal.proposalId} finalized via Worker`);
    emitToDAO(data.daoAddress, 'proposal:updated', proposal.toObject());

    const { AuditLog } = require('../models');
    await AuditLog.create({
      action: 'PROPOSAL_FINALIZED',
      performedBy: 'system',
      targetResource: `Proposal:${proposal.proposalId}`,
      metadata: { daoAddress: data.daoAddress, txId: data.txId }
    });
  }
}

async function startWorker() {
  try {
    const channel = getChannel();
    // Prefetch limits the number of unacknowledged messages the worker can handle at once
    channel.prefetch(10);
    logger.info(`👷 Event Worker started, listening to queue: ${QUEUE_NAME}`);
    
    channel.consume(QUEUE_NAME, processEvent, { noAck: false });
  } catch (error) {
    logger.warn('⚠️ RabbitMQ not available. Falling back to In-Memory Event Worker subscriptions.');
    
    fallbackEmitter.on('election.created', async (data) => {
      try { await handleElectionCreated(data); } catch (e) { logger.error('Error in fallback handleElectionCreated:', e); }
    });
    fallbackEmitter.on('proposal.created', async (data) => {
      try { await handleProposalCreated(data); } catch (e) { logger.error('Error in fallback handleProposalCreated:', e); }
    });
    fallbackEmitter.on('vote.cast', async (data) => {
      try { await handleVoteCast(data); } catch (e) { logger.error('Error in fallback handleVoteCast:', e); }
    });
    fallbackEmitter.on('proposal.queued', async (data) => {
      try { await handleProposalQueued(data); } catch (e) { logger.error('Error in fallback handleProposalQueued:', e); }
    });
    fallbackEmitter.on('proposal.executed', async (data) => {
      try { await handleProposalExecuted(data); } catch (e) { logger.error('Error in fallback handleProposalExecuted:', e); }
    });
    fallbackEmitter.on('proposal.cancelled', async (data) => {
      try { await handleProposalCancelled(data); } catch (e) { logger.error('Error in fallback handleProposalCancelled:', e); }
    });
    fallbackEmitter.on('transaction.executed', async (data) => {
      try { await handleTransactionExecuted(data); } catch (e) { logger.error('Error in fallback handleTransactionExecuted:', e); }
    });
  }
}

module.exports = { startWorker };
