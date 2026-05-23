/**
 * AI Module Entry Point — Re-exports all AI services
 *
 * Usage:
 *   const { explainProposal, chat, askTreasury } = require('./ai');
 */

const { explainProposal, summarizeProposal, streamExplanation } = require('./services/proposalExplainer');
const { classifyIntent, classifyByKeywords } = require('./services/intentRouter');
const { chat, streamChat } = require('./services/copilotService');
const { askTreasury } = require('./services/treasuryAssistant');
const { generateText, generateJSON, streamText } = require('./services/geminiService');
const { buildFullContext, getProposalContext, getTreasuryContext } = require('./context/contextBuilder');
const memoryManager = require('./memory/memoryManager');
const { checkHealth } = require('./config/gemini');

module.exports = {
  // Proposal AI
  explainProposal,
  summarizeProposal,
  streamExplanation,

  // Copilot
  chat,
  streamChat,

  // Treasury
  askTreasury,

  // Intent routing
  classifyIntent,
  classifyByKeywords,

  // Context
  buildFullContext,
  getProposalContext,
  getTreasuryContext,

  // Memory
  memoryManager,

  // Core Gemini
  generateText,
  generateJSON,
  streamText,

  // Health
  checkHealth,
};
