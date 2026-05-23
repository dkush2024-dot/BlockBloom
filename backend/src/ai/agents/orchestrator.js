/**
 * Agent Orchestrator — Multi-Agent Coordinator (Phase 7)
 *
 * WHAT IS AN ORCHESTRATOR?
 * -----------------------
 * When multiple agents need to work together, the orchestrator:
 *   1. Receives a complex request
 *   2. Decides which agent(s) to invoke
 *   3. Coordinates their execution
 *   4. Merges their results into a unified response
 *
 * AVAILABLE AGENTS:
 *   - ProposalAgent: Deep proposal analysis
 *   - TreasuryAgent: Treasury health monitoring
 *   - VotingAgent: Balanced voting analysis
 *
 * FUTURE EXPANSION:
 *   This orchestrator is designed to easily add new agents.
 *   Just import them and add a case to the routing logic.
 */

const { analyzeProposal } = require('./proposalAgent');
const { analyzeTreasury } = require('./treasuryAgent');
const { analyzeVote } = require('./votingAgent');
const { classifyByKeywords } = require('../services/intentRouter');
const logger = require('../../config/logger');

// Available agent types
const AGENTS = {
  proposal_analyzer: {
    name: 'Proposal Analyzer',
    description: 'Deep analysis of governance proposals',
    handler: analyzeProposal,
  },
  treasury_monitor: {
    name: 'Treasury Monitor',
    description: 'Treasury health analysis and anomaly detection',
    handler: analyzeTreasury,
  },
  voting_recommender: {
    name: 'Voting Recommender',
    description: 'Balanced voting analysis with pros and cons',
    handler: analyzeVote,
  },
};

/**
 * Run a specific agent by type.
 *
 * @param {string} agentType - One of: proposal_analyzer, treasury_monitor, voting_recommender
 * @param {Object} params - Parameters for the agent
 * @returns {Promise<Object>} - Agent result
 */
async function runAgent(agentType, params) {
  const agent = AGENTS[agentType];
  if (!agent) {
    throw new Error(`Unknown agent type: ${agentType}. Available: ${Object.keys(AGENTS).join(', ')}`);
  }

  logger.info(`[Orchestrator] Running agent: ${agent.name}`);
  const startTime = Date.now();

  try {
    const result = await agent.handler(params);
    const duration = Date.now() - startTime;
    logger.info(`[Orchestrator] ${agent.name} completed in ${duration}ms`);

    return {
      ...result,
      executionTimeMs: duration,
    };
  } catch (error) {
    logger.error(`[Orchestrator] ${agent.name} failed:`, error.message);
    throw error;
  }
}

/**
 * Auto-route: Given a natural language request, decide which agent to use.
 *
 * @param {string} message - User's request
 * @param {Object} context - Context (daoAddress, proposalId, etc.)
 * @returns {Promise<Object>} - Agent result
 */
async function autoRoute(message, context = {}) {
  const intent = classifyByKeywords(message);

  let agentType;
  switch (intent.intent) {
    case 'treasury_query':
      agentType = 'treasury_monitor';
      break;
    case 'voting_help':
      agentType = 'voting_recommender';
      break;
    case 'proposal_explain':
    case 'proposal_status':
    default:
      agentType = 'proposal_analyzer';
      break;
  }

  logger.info(`[Orchestrator] Auto-routed "${message.substring(0, 50)}" → ${agentType}`);
  return runAgent(agentType, { ...context, question: message });
}

/**
 * Run multiple agents in parallel and merge results.
 *
 * @param {Array<{ type: string, params: Object }>} tasks
 * @returns {Promise<Object>} - Merged results keyed by agent type
 */
async function runMultiAgent(tasks) {
  logger.info(`[Orchestrator] Running ${tasks.length} agents in parallel`);
  const startTime = Date.now();

  const results = await Promise.allSettled(
    tasks.map(task => runAgent(task.type, task.params))
  );

  const merged = {};
  tasks.forEach((task, i) => {
    const result = results[i];
    merged[task.type] = result.status === 'fulfilled'
      ? result.value
      : { error: result.reason?.message || 'Agent failed' };
  });

  const duration = Date.now() - startTime;
  logger.info(`[Orchestrator] Multi-agent run completed in ${duration}ms`);

  return {
    agents: merged,
    totalExecutionTimeMs: duration,
    agentsRun: tasks.length,
  };
}

module.exports = {
  runAgent,
  autoRoute,
  runMultiAgent,
  AGENTS,
};
