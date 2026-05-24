/**
 * Core Gemini Service — The AI Engine of BlockBloom
 *
 * This is the central wrapper around the Gemini API. All AI features
 * (proposal explainer, copilot, treasury assistant) call through here.
 *
 * WHY A WRAPPER?
 * - Centralized error handling (API failures, rate limits, bad responses)
 * - Response validation (ensure JSON is valid before returning)
 * - Logging and metrics (track AI usage)
 * - Easy to swap models later (just change this file)
 *
 * ARCHITECTURE:
 *   Feature Service (e.g. proposalExplainer.js)
 *       ↓ calls
 *   geminiService.js (this file) — validates, logs, retries
 *       ↓ calls
 *   gemini.js (config) — raw Gemini SDK
 */

const { getModel, getJsonModel, getStreamingModel } = require('../config/gemini');
const logger = require('../../config/logger');

/**
 * Generate a text response from Gemini.
 *
 * @param {string} prompt - The complete prompt to send
 * @param {Object} opts - Options
 * @param {number} opts.temperature - Override temperature
 * @param {number} opts.maxOutputTokens - Override max tokens
 * @returns {Promise<{ text: string, tokenCount: number|null }>}
 */
async function generateText(prompt, opts = {}) {
  const model = getModel(opts);
  if (!model) {
    throw new Error('AI service unavailable: GEMINI_API_KEY not configured');
  }

  try {
    logger.debug(`[GeminiService] Generating text (${prompt.length} chars)`);
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Log candidate details for debugging
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      logger.debug(`[GeminiService] Candidate finishReason: ${candidate.finishReason}`);
      if (candidate.safetyRatings) {
        logger.debug(`[GeminiService] Safety ratings: ${JSON.stringify(candidate.safetyRatings)}`);
      }
    }

    // Log token usage if available
    const usage = response.usageMetadata;
    if (usage) {
      logger.debug(`[GeminiService] Tokens — prompt: ${usage.promptTokenCount}, response: ${usage.candidatesTokenCount}`);
    }

    return {
      text,
      tokenCount: usage?.totalTokenCount || null,
    };
  } catch (error) {
    logger.error('[GeminiService] Text generation failed:', error.message);
    const msg = error.message.toLowerCase();
    if (msg.includes('429') || msg.includes('quota') || msg.includes('too many requests')) {
      throw new Error('Gemini API rate limit exceeded (20 requests per minute on the free tier). Please wait a few seconds and try again.');
    }
    throw new Error(`AI generation failed: ${error.message}`);
  }
}

/**
 * Generate a structured JSON response from Gemini.
 * Uses Gemini's native JSON mode for reliable structured output.
 *
 * @param {string} prompt - The prompt (should request JSON output)
 * @param {Array<string>} requiredFields - Fields that must exist in response
 * @param {Object} opts - Options
 * @returns {Promise<{ data: Object, tokenCount: number|null }>}
 */
async function generateJSON(prompt, requiredFields = [], opts = {}) {
  const model = getJsonModel(opts);
  if (!model) {
    throw new Error('AI service unavailable: GEMINI_API_KEY not configured');
  }

  try {
    logger.debug(`[GeminiService] Generating JSON (${prompt.length} chars)`);
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse the JSON response
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks (fallback)
      const match = text.match(/```json\s*([\s\S]*?)```/);
      if (match) {
        data = JSON.parse(match[1].trim());
      } else {
        throw new Error(`AI returned invalid JSON: ${text.substring(0, 200)}`);
      }
    }

    // Validate required fields
    for (const field of requiredFields) {
      if (!(field in data)) {
        logger.warn(`[GeminiService] Missing field "${field}" in AI response`);
      }
    }

    return {
      data,
      tokenCount: response.usageMetadata?.totalTokenCount || null,
    };
  } catch (error) {
    logger.error('[GeminiService] JSON generation failed:', error.message);
    throw new Error(`AI JSON generation failed: ${error.message}`);
  }
}

/**
 * Generate a streaming response from Gemini.
 * Returns an async generator that yields text chunks.
 *
 * WHY STREAMING?
 * Without streaming, users wait 2-5 seconds staring at nothing.
 * With streaming, text appears word-by-word — feels instant.
 *
 * USAGE:
 *   for await (const chunk of streamText(prompt)) {
 *     res.write(chunk); // Send to frontend via SSE
 *   }
 *
 * @param {string} prompt - The prompt to send
 * @param {Object} opts - Options
 * @returns {AsyncGenerator<string>} - Yields text chunks
 */
async function* streamText(prompt, opts = {}) {
  const model = getStreamingModel(opts);
  if (!model) {
    throw new Error('AI service unavailable: GEMINI_API_KEY not configured');
  }

  try {
    logger.debug(`[GeminiService] Starting stream (${prompt.length} chars)`);
    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  } catch (error) {
    logger.error('[GeminiService] Stream failed:', error.message);
    throw new Error(`AI streaming failed: ${error.message}`);
  }
}

module.exports = {
  generateText,
  generateJSON,
  streamText,
};
