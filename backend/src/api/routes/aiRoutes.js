/**
 * AI Routes — Complete API Endpoints for All AI Features (Phases 1-7)
 *
 * Mounted at: /api/ai/
 *
 * ENDPOINTS:
 *   Health:
 *     GET  /api/ai/health                → AI system health check
 *
 *   Proposal AI:
 *     POST /api/ai/explain               → Explain a proposal (JSON)
 *     POST /api/ai/explain/stream        → Explain a proposal (SSE streaming)
 *     POST /api/ai/summarize             → Summarize a proposal
 *
 *   Intent:
 *     POST /api/ai/classify              → Classify user intent
 *
 *   Copilot:
 *     POST /api/ai/copilot/chat          → Send copilot message (JSON)
 *     POST /api/ai/copilot/chat/stream   → Send copilot message (SSE streaming)
 *     GET  /api/ai/copilot/sessions      → List user's chat sessions
 *     DELETE /api/ai/copilot/sessions/:id → Delete a chat session
 *
 *   Treasury:
 *     POST /api/ai/treasury/ask          → Ask a treasury question
 *
 *   RAG:
 *     POST /api/ai/rag/upload            → Upload governance document
 *     POST /api/ai/rag/query             → Query governance knowledge base
 *     GET  /api/ai/rag/documents         → List indexed documents
 *
 *   Agents:
 *     POST /api/ai/agents/run            → Run a specific agent
 *     POST /api/ai/agents/auto           → Auto-route to best agent
 *     POST /api/ai/agents/multi          → Run multiple agents in parallel
 */

const express = require('express');
const router = express.Router();
const ai = require('../controllers/aiController');

// ─── Health Check ─────────────────────────────────────────────
router.get('/health', ai.handleHealth);

// ─── Proposal AI ──────────────────────────────────────────────
router.post('/explain', ai.handleExplain);
router.post('/explain/stream', ai.handleStreamExplain);
router.post('/summarize', ai.handleSummarize);

// ─── Intent Classification ───────────────────────────────────
router.post('/classify', ai.handleClassify);

// ─── Governance Copilot ──────────────────────────────────────
router.post('/copilot/chat', ai.handleCopilotChat);
router.post('/copilot/chat/stream', ai.handleCopilotStream);
router.get('/copilot/sessions', ai.handleListSessions);
router.delete('/copilot/sessions/:id', ai.handleDeleteSession);

// ─── Treasury Assistant ──────────────────────────────────────
router.post('/treasury/ask', ai.handleTreasuryAsk);

// ─── RAG Pipeline ────────────────────────────────────────────
router.post('/rag/upload', ai.handleRagUpload);
router.post('/rag/query', ai.handleRagQuery);
router.get('/rag/documents', ai.handleRagListDocs);

// ─── Autonomous Agents ───────────────────────────────────────
router.post('/agents/run', ai.handleAgentRun);
router.post('/agents/auto', ai.handleAgentAuto);
router.post('/agents/multi', ai.handleMultiAgent);

module.exports = router;
