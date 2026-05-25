/**
 * AI Controller — Request Handlers for AI Endpoints
 *
 * Follows the same pattern as existing controllers (daoController, proposalController).
 * Each handler: validates input → calls service → sends response.
 *
 * STREAMING RESPONSES:
 * For stream endpoints, we use Server-Sent Events (SSE).
 * SSE pushes data from server to client over a regular HTTP connection.
 */

const { explainProposal, summarizeProposal, streamExplanation } = require('../../ai/services/proposalExplainer');
const { classifyIntent, classifyByKeywords } = require('../../ai/services/intentRouter');
const { chat, streamChat } = require('../../ai/services/copilotService');
const { askTreasury } = require('../../ai/services/treasuryAssistant');
const { checkHealth } = require('../../ai/config/gemini');
const memoryManager = require('../../ai/memory/memoryManager');
const { ingestDocument, query: ragQuery } = require('../../ai/rag/ragPipeline');
const { GovernanceDoc } = require('../../models');
const { runAgent, autoRoute, runMultiAgent } = require('../../ai/agents/orchestrator');
const logger = require('../../config/logger');

// ─── Proposal Endpoints ─────────────────────────────────────────────

/** POST /api/ai/explain — Explain a proposal in simple language. */
async function handleExplain(req, res, next) {
  try {
    const { proposal } = req.body;
    if (!proposal) {
      return res.status(400).json({ success: false, message: 'Missing "proposal" in request body' });
    }
    const explanation = await explainProposal(proposal);
    res.json({ success: true, data: explanation });
  } catch (error) {
    if (error.message.includes('GEMINI_API_KEY not configured')) {
      return res.json({ success: true, data: "✨ AI explanation is currently in setup mode. Please add a GEMINI_API_KEY to the backend/.env file." });
    }
    logger.error('[AIController] Explain failed:', error.message);
    next(error);
  }
}

/** POST /api/ai/summarize — Generate a concise summary. */
async function handleSummarize(req, res, next) {
  try {
    const { proposal } = req.body;
    if (!proposal) {
      return res.status(400).json({ success: false, message: 'Missing "proposal" in request body' });
    }
    const summary = await summarizeProposal(proposal);
    res.json({ success: true, data: summary });
  } catch (error) {
    if (error.message.includes('GEMINI_API_KEY not configured')) {
      return res.json({ success: true, data: "✨ AI summarization is currently in setup mode. Please add a GEMINI_API_KEY to the backend/.env file." });
    }
    logger.error('[AIController] Summarize failed:', error.message);
    next(error);
  }
}

/** POST /api/ai/explain/stream — Stream explanation via SSE. */
async function handleStreamExplain(req, res, next) {
  try {
    const { proposal } = req.body;
    if (!proposal) {
      return res.status(400).json({ success: false, message: 'Missing "proposal" in request body' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    for await (const chunk of streamExplanation(proposal)) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    logger.error('[AIController] Stream failed:', error.message);
    if (!res.headersSent) next(error);
    else { res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`); res.end(); }
  }
}

// ─── Copilot Endpoints ──────────────────────────────────────────────

/** POST /api/ai/copilot/chat — Send a message to the copilot. */
async function handleCopilotChat(req, res, next) {
  try {
    const { message, sessionId, daoAddress, userAddress } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'Missing "message"' });
    }
    if (!userAddress) {
      return res.status(400).json({ success: false, message: 'Missing "userAddress"' });
    }

    // Create session if none provided
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const session = await memoryManager.createSession(userAddress, daoAddress);
      activeSessionId = session.sessionId;
    }

    // Get chat history from memory
    const chatHistory = await memoryManager.getHistory(activeSessionId, 10);

    // Save user message
    await memoryManager.addMessage(activeSessionId, 'user', message);

    // Generate AI response
    const result = await chat({ message, daoAddress, userAddress, chatHistory, sessionId: activeSessionId });

    // Save assistant response
    await memoryManager.addMessage(activeSessionId, 'assistant', result.reply, {
      intent: result.intent.intent,
      confidence: result.intent.confidence,
    });

    res.json({
      success: true,
      data: {
        reply: result.reply,
        sessionId: activeSessionId,
        intent: result.intent,
      },
    });
  } catch (error) {
    if (error.message.includes('GEMINI_API_KEY not configured')) {
      return res.json({
        success: true,
        data: {
          reply: "👋 Hi! The AI Copilot is currently in setup mode. Please add your GEMINI_API_KEY to the backend/.env file to activate AI responses.",
          sessionId: sessionId || 'setup-mode',
          intent: { intent: 'setup', confidence: 1.0 },
        },
      });
    }
    logger.error('[AIController] Copilot chat failed:', error.message);
    next(error);
  }
}

/** POST /api/ai/copilot/chat/stream — Stream copilot response via SSE. */
async function handleCopilotStream(req, res, next) {
  try {
    const { message, sessionId, daoAddress, userAddress } = req.body;
    if (!message || !userAddress) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const session = await memoryManager.createSession(userAddress, daoAddress);
      activeSessionId = session.sessionId;
    }

    const chatHistory = await memoryManager.getHistory(activeSessionId, 10);
    await memoryManager.addMessage(activeSessionId, 'user', message);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send sessionId first
    res.write(`data: ${JSON.stringify({ sessionId: activeSessionId })}\n\n`);

    let fullReply = '';
    for await (const chunk of streamChat({ message, daoAddress, chatHistory })) {
      fullReply += chunk;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    // Save the full response to memory
    await memoryManager.addMessage(activeSessionId, 'assistant', fullReply);

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    if (error.message.includes('GEMINI_API_KEY not configured')) {
      const msg = "👋 Hi! The AI Copilot is currently in setup mode. Please add your GEMINI_API_KEY to the backend/.env file to activate AI responses.";
      if (!res.headersSent) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ sessionId: sessionId || 'setup-mode' })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ text: msg })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }
    logger.error('[AIController] Copilot stream failed:', error.message);
    if (!res.headersSent) next(error);
    else { res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`); res.end(); }
  }
}

/** GET /api/ai/copilot/sessions?userAddress=0x... — List user's sessions. */
async function handleListSessions(req, res, next) {
  try {
    const { userAddress } = req.query;
    if (!userAddress) {
      return res.status(400).json({ success: false, message: 'Missing "userAddress" query param' });
    }
    const sessions = await memoryManager.listSessions(userAddress);
    res.json({ success: true, data: sessions });
  } catch (error) {
    logger.error('[AIController] List sessions failed:', error.message);
    next(error);
  }
}

/** DELETE /api/ai/copilot/sessions/:id — Delete a session. */
async function handleDeleteSession(req, res, next) {
  try {
    const { id } = req.params;
    const { userAddress } = req.body;
    if (!userAddress) {
      return res.status(400).json({ success: false, message: 'Missing "userAddress"' });
    }
    const deleted = await memoryManager.deleteSession(id, userAddress);
    res.json({ success: true, deleted });
  } catch (error) {
    logger.error('[AIController] Delete session failed:', error.message);
    next(error);
  }
}

// ─── Treasury Endpoint ──────────────────────────────────────────────

/** POST /api/ai/treasury/ask — Ask a treasury question. */
async function handleTreasuryAsk(req, res, next) {
  try {
    const { question, treasuryAddress } = req.body;
    if (!question || !treasuryAddress) {
      return res.status(400).json({ success: false, message: 'Missing "question" or "treasuryAddress"' });
    }
    const answer = await askTreasury(question, treasuryAddress);
    res.json({ success: true, data: answer });
  } catch (error) {
    logger.error('[AIController] Treasury ask failed:', error.message);
    next(error);
  }
}

// ─── Utility Endpoints ──────────────────────────────────────────────

/** POST /api/ai/classify — Classify user intent. */
async function handleClassify(req, res, next) {
  try {
    const { message, useKeywords } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'Missing "message"' });
    }
    const result = useKeywords ? classifyByKeywords(message) : await classifyIntent(message);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[AIController] Classify failed:', error.message);
    next(error);
  }
}

/** GET /api/ai/health — AI system health check. */
async function handleHealth(req, res) {
  const health = await checkHealth();
  res.json({ success: true, data: { ai: health, timestamp: new Date().toISOString() } });
}

// ─── RAG Endpoints ──────────────────────────────────────────────────

/** POST /api/ai/rag/upload — Upload and index a governance document. */
async function handleRagUpload(req, res, next) {
  try {
    const { title, content, type, daoAddress, userAddress } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Missing "title" or "content"' });
    }

    // Save to MongoDB first
    const doc = await GovernanceDoc.create({
      documentId: `doc_${Date.now()}`,
      title,
      type: type || 'other',
      content,
      daoAddress,
      uploadedBy: userAddress,
      indexStatus: 'pending',
    });

    // Index into Qdrant
    const result = await ingestDocument(content, {
      documentId: doc.documentId,
      title,
      type: type || 'other',
      source: 'upload',
    });

    // Update indexing status
    await GovernanceDoc.updateOne(
      { documentId: doc.documentId },
      { indexStatus: 'indexed', chunksIndexed: result.chunksIndexed, indexedAt: new Date() }
    );

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[AIController] RAG upload failed:', error.message);
    next(error);
  }
}

/** POST /api/ai/rag/query — Query the governance knowledge base. */
async function handleRagQuery(req, res, next) {
  try {
    const { question, topK } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, message: 'Missing "question"' });
    }
    const answer = await ragQuery(question, { topK: topK || 5 });
    res.json({ success: true, data: answer });
  } catch (error) {
    logger.error('[AIController] RAG query failed:', error.message);
    next(error);
  }
}

/** GET /api/ai/rag/documents — List indexed documents. */
async function handleRagListDocs(req, res, next) {
  try {
    const { daoAddress } = req.query;
    const filter = daoAddress ? { daoAddress } : {};
    const docs = await GovernanceDoc.find(filter, {
      documentId: 1, title: 1, type: 1, indexStatus: 1, chunksIndexed: 1, createdAt: 1,
    }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, data: docs });
  } catch (error) {
    logger.error('[AIController] RAG list docs failed:', error.message);
    next(error);
  }
}

module.exports = {
  handleExplain,
  handleSummarize,
  handleStreamExplain,
  handleCopilotChat,
  handleCopilotStream,
  handleListSessions,
  handleDeleteSession,
  handleTreasuryAsk,
  handleClassify,
  handleHealth,
  handleRagUpload,
  handleRagQuery,
  handleRagListDocs,
};

// ─── Agent Endpoints ────────────────────────────────────────────────

/** POST /api/ai/agents/run — Run a specific agent. */
async function handleAgentRun(req, res, next) {
  try {
    const { agentType, params } = req.body;
    if (!agentType || !params) {
      return res.status(400).json({ success: false, message: 'Missing "agentType" or "params"' });
    }
    const result = await runAgent(agentType, params);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[AIController] Agent run failed:', error.message);
    next(error);
  }
}

/** POST /api/ai/agents/auto — Auto-route a message to the best agent. */
async function handleAgentAuto(req, res, next) {
  try {
    const { message, context } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'Missing "message"' });
    }
    const result = await autoRoute(message, context || {});
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[AIController] Agent auto-route failed:', error.message);
    next(error);
  }
}

/** POST /api/ai/agents/multi — Run multiple agents in parallel. */
async function handleMultiAgent(req, res, next) {
  try {
    const { tasks } = req.body;
    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ success: false, message: 'Missing "tasks" array' });
    }
    const result = await runMultiAgent(tasks);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[AIController] Multi-agent failed:', error.message);
    next(error);
  }
}

// Re-export with agent handlers
module.exports = {
  ...module.exports,
  handleAgentRun,
  handleAgentAuto,
  handleMultiAgent,
};
