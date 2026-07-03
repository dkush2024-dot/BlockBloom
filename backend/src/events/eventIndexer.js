/**
 * Blockchain Event Indexer
 *
 * THE BRAIN OF THE BACKEND — this is where blockchain meets RabbitMQ.
 */

const { ethers } = require('ethers');
const {
  getElectionFactoryContract,
  getElectionContract,
  getTreasuryContract,
} = require('../blockchain/contracts');
const { getProvider } = require('../blockchain/provider');
const { Election, SyncState } = require('../models');
const { publishEvent } = require('../config/rabbitmq');
const logger = require('../config/logger');

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
          const txReceipt = event.log || event;
          
          publishEvent('election.created', {
            orgId,
            contractAddress: electionAddress.toLowerCase(),
            treasuryAddress: treasuryAddress.toLowerCase(),
            name,
            timelockDelay: Number(timelockDelay),
            quorumVotes: Number(quorumVotes),
            creator: creator.toLowerCase(),
            blockNumber: txReceipt.blockNumber,
            transactionHash: txReceipt.transactionHash,
          });
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
            const txReceipt = ev.log || ev;
            publishEvent('proposal.created', {
              proposalId: id.toString(),
              daoAddress: electionAddress.toLowerCase(),
              proposer: proposer.toLowerCase(),
              description,
              endTime: new Date(Number(endTime) * 1000).toISOString(),
              target: (target || '0x0000000000000000000000000000000000000000').toLowerCase(),
              value: (value || 0).toString(),
              blockNumber: txReceipt.blockNumber,
              transactionHash: txReceipt.transactionHash,
            });
          }

          // VoteCast
          const vEvents = await electionContract.queryFilter('VoteCast', startBlock, currentBlock);
          for (const ev of vEvents) {
            const [proposalId, voter, optionIndex] = ev.args;
            const txReceipt = ev.log || ev;
            publishEvent('vote.cast', {
              daoAddress: electionAddress.toLowerCase(),
              proposalId: proposalId.toString(),
              voter: voter.toLowerCase(),
              optionIndex: Number(optionIndex),
              weight: "1",
              blockNumber: txReceipt.blockNumber,
              transactionHash: txReceipt.transactionHash,
            });
          }

          // ProposalQueued
          const qEvents = await electionContract.queryFilter('ProposalQueued', startBlock, currentBlock);
          for (const ev of qEvents) {
            const [proposalId, timelockTxId] = ev.args;
            publishEvent('proposal.queued', {
              daoAddress: electionAddress.toLowerCase(),
              proposalId: proposalId.toString(),
              timelockTxId,
            });
          }

          // ProposalExecuted
          const eEvents = await electionContract.queryFilter('ProposalExecuted', startBlock, currentBlock);
          for (const ev of eEvents) {
            const [proposalId] = ev.args;
            publishEvent('proposal.executed', {
              daoAddress: electionAddress.toLowerCase(),
              proposalId: proposalId.toString(),
            });
          }

          // ProposalCancelled
          const cEvents = await electionContract.queryFilter('ProposalCancelled', startBlock, currentBlock);
          for (const ev of cEvents) {
            const [proposalId] = ev.args;
            const txReceipt = ev.log || ev;
            const block = await provider.getBlock(txReceipt.blockNumber);
            publishEvent('proposal.cancelled', {
              daoAddress: electionAddress.toLowerCase(),
              proposalId: proposalId.toString(),
              endTime: new Date((block.timestamp - 1) * 1000).toISOString(),
            });
          }

          // Treasury TransactionExecuted
          if (election.treasuryAddress) {
            const treasuryContract = getTreasuryContract(election.treasuryAddress);
            if (treasuryContract) {
              const tEvents = await treasuryContract.queryFilter('TransactionExecuted', startBlock, currentBlock);
              for (const ev of tEvents) {
                const [txId] = ev.args;
                publishEvent('transaction.executed', {
                  daoAddress: electionAddress.toLowerCase(),
                  txId,
                });
              }
            }
          }

          // Note: we still update the SyncState here since this is tracking what we successfully read from blockchain
          // We could move this to the worker for extreme resilience, but for now we keep it here to avoid re-publishing
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
