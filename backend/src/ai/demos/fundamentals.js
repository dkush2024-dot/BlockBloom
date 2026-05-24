/**
 * ═══════════════════════════════════════════════════════════════════════
 * Phase 1 — AI Fundamentals Demo: Core Concepts for DAO Governance
 * ═══════════════════════════════════════════════════════════════════════
 *
 * HOW TO RUN:
 *   node src/ai/demos/fundamentals.js
 *
 * WHAT THIS DOES:
 *   Demonstrates 5 core AI concepts using governance examples.
 *   No API key needed — this is a local educational demo.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONCEPT 1: PROMPT ENGINEERING
 * ─────────────────────────────────────────────────────────────────────
 *
 * What is it?
 *   Prompt engineering is the art of writing instructions for an AI model
 *   so it gives you exactly what you want. Think of it as writing a very
 *   detailed job description for an AI employee.
 *
 * Why does it matter for DAOs?
 *   When a user asks "explain this proposal", we need the AI to:
 *   - Use real data (not make things up)
 *   - Output structured JSON (so our UI can display it)
 *   - Use beginner-friendly language
 *   - Stay on topic (governance only)
 *
 * KEY TECHNIQUES:
 *   1. Role Assignment → "You are a governance expert..."
 *   2. Clear Constraints → "NEVER fabricate data..."
 *   3. Output Formatting → "Return JSON with this structure..."
 *   4. Few-Shot Examples → "Here's an example of good output..."
 *   5. Chain-of-Thought → "First analyze, then explain..."
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONCEPT 2: TOKENS AND CONTEXT WINDOWS
 * ─────────────────────────────────────────────────────────────────────
 *
 * What are tokens?
 *   AI models don't read words — they read "tokens". A token is roughly
 *   3/4 of a word. "BlockBloom" = 2 tokens. "governance" = 1-2 tokens.
 *
 * What is a context window?
 *   The maximum number of tokens the AI can process in one request.
 *   Gemini 1.5 Flash has a 1,000,000 token context window — that's huge!
 *   It means we can send entire governance documents + proposal history.
 *
 * Why does this matter?
 *   - More context = better answers (the AI has more information)
 *   - But more tokens = more cost and latency
 *   - We need to be smart about what context we include
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONCEPT 3: AI HALLUCINATIONS
 * ─────────────────────────────────────────────────────────────────────
 *
 * What are hallucinations?
 *   When an AI confidently states something that's completely wrong.
 *   For example, it might say "Proposal #42 has 150 votes" when the
 *   real number is 23. It sounds correct but it's fabricated.
 *
 * Why are they dangerous for DAOs?
 *   - Users might vote based on wrong information
 *   - Treasury decisions could be based on fabricated data
 *   - Trust in the governance system erodes
 *
 * How do we prevent them?
 *   1. CONTEXT INJECTION — Feed real blockchain data into every prompt
 *   2. GROUNDING — Tell the AI to ONLY use provided data
 *   3. VERIFICATION — Cross-check AI responses against on-chain data
 *   4. CONFIDENCE SCORING — Ask the AI to rate its own confidence
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONCEPT 4: CONTEXT INJECTION
 * ─────────────────────────────────────────────────────────────────────
 *
 * What is it?
 *   Injecting real, verified data into the AI prompt before sending it.
 *   Instead of asking "What's the treasury balance?", we say:
 *   "The treasury has 5000 ETH. Based on this, answer..."
 *
 * In BlockBloom:
 *   1. User asks a question about a proposal
 *   2. We fetch the REAL proposal data from blockchain/MongoDB
 *   3. We inject that data into the prompt
 *   4. The AI can only answer based on real data
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONCEPT 5: RELIABLE AI OUTPUTS
 * ─────────────────────────────────────────────────────────────────────
 *
 * The problem:
 *   AI responses are unpredictable. Sometimes you get plain text,
 *   sometimes markdown, sometimes JSON — it varies every time.
 *
 * The solution:
 *   1. Specify exact JSON schema in the prompt
 *   2. Use Gemini's structured output mode (responseMimeType: "application/json")
 *   3. Validate the response before sending to frontend
 *   4. Have fallback handlers if the AI gives bad output
 */

// ─── DEMO: Prompt Engineering Examples ──────────────────────────────────────

const BAD_PROMPT = `Tell me about this proposal.`;
// Problem: No context, no format, no constraints. The AI will make everything up.

const GOOD_PROMPT = `You are BlockBloom AI, a governance assistant.

TASK: Explain the following proposal in simple language.

RULES:
- Use ONLY the data provided below
- Do NOT fabricate any numbers or addresses
- Return valid JSON

PROPOSAL DATA:
Title: Fund Community Garden
Description: Allocate 500 BLOOM tokens to establish a community garden initiative
Proposer: 0x1234...5678
Votes For: 45
Votes Against: 12
Status: Active

OUTPUT FORMAT:
{
  "summary": "one sentence summary",
  "recommendation": "brief analysis"
}`;

// ─── DEMO: Token Estimation ────────────────────────────────────────────────

/**
 * Rough token estimator.
 * In production, you'd use the Gemini tokenizer API.
 * Rule of thumb: 1 token ≈ 4 characters ≈ 0.75 words
 *
 * @param {string} text - Input text
 * @returns {number} - Estimated token count
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// ─── DEMO: Context Injection Example ───────────────────────────────────────

/**
 * Demonstrates how context injection works:
 * We take a user question and wrap it with real data
 * so the AI can't hallucinate.
 */
function demoContextInjection() {
  const userQuestion = 'What is the status of the latest proposal?';

  // ❌ WITHOUT context injection — AI will make up an answer
  const unsafePrompt = `Answer this: ${userQuestion}`;

  // ✅ WITH context injection — AI is grounded in real data
  const realProposal = {
    id: 7,
    title: 'Upgrade Voting Mechanism',
    status: 'Active',
    votesFor: 89,
    votesAgainst: 23,
    deadline: '2026-06-01',
  };

  const safePrompt = `
You are a DAO governance assistant. Answer ONLY based on the data below.

VERIFIED ON-CHAIN DATA:
Proposal #${realProposal.id}: "${realProposal.title}"
Status: ${realProposal.status}
Votes For: ${realProposal.votesFor}
Votes Against: ${realProposal.votesAgainst}
Deadline: ${realProposal.deadline}

USER QUESTION: ${userQuestion}

If the provided data doesn't answer the question, say "I don't have that information."
  `.trim();

  return { unsafePrompt, safePrompt, realProposal };
}

// ─── DEMO: Output Validation ──────────────────────────────────────────────

/**
 * Validates that an AI response matches our expected schema.
 * This is crucial for production — we can't trust the AI to always
 * return perfect JSON.
 *
 * @param {string} rawResponse - Raw text from the AI
 * @param {Array<string>} requiredFields - Fields that must exist
 * @returns {{ valid: boolean, data: Object|null, error: string|null }}
 */
function validateAIResponse(rawResponse, requiredFields = []) {
  try {
    // Step 1: Try to parse as JSON
    const data = JSON.parse(rawResponse);

    // Step 2: Check required fields exist
    for (const field of requiredFields) {
      if (!(field in data)) {
        return {
          valid: false,
          data: null,
          error: `Missing required field: "${field}"`,
        };
      }
    }

    return { valid: true, data, error: null };
  } catch (err) {
    // Step 3: If JSON parse fails, try to extract JSON from markdown code blocks
    const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1].trim());
        return { valid: true, data, error: null };
      } catch {
        // Fall through to error
      }
    }

    return {
      valid: false,
      data: null,
      error: `Invalid JSON response: ${err.message}`,
    };
  }
}

// ─── Run the demos ──────────────────────────────────────────────────────────

function runDemos() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  🧠 BlockBloom AI Fundamentals — Demo Suite  ');
  console.log('══════════════════════════════════════════════\n');

  // Demo 1: Prompt comparison
  console.log('📝 DEMO 1: Prompt Engineering\n');
  console.log('❌ BAD prompt (no context, no format):');
  console.log(`   "${BAD_PROMPT}"`);
  console.log(`   Estimated tokens: ${estimateTokens(BAD_PROMPT)}\n`);
  console.log('✅ GOOD prompt (role + data + format + constraints):');
  console.log(`   ${GOOD_PROMPT.substring(0, 100)}...`);
  console.log(`   Estimated tokens: ${estimateTokens(GOOD_PROMPT)}\n`);

  // Demo 2: Token estimation
  console.log('─────────────────────────────────────────────');
  console.log('📊 DEMO 2: Token Estimation\n');
  const sampleTexts = [
    'Hello',
    'Explain this governance proposal',
    'The treasury has 5000 BLOOM tokens and 10 ETH',
    GOOD_PROMPT,
  ];
  for (const text of sampleTexts) {
    console.log(`   "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" → ~${estimateTokens(text)} tokens`);
  }
  console.log(`\n   Gemini 1.5 Flash context window: 1,000,000 tokens`);
  console.log(`   That's ~${(1000000 * 4).toLocaleString()} characters — enough for entire governance histories!\n`);

  // Demo 3: Context injection
  console.log('─────────────────────────────────────────────');
  console.log('🔒 DEMO 3: Context Injection\n');
  const { unsafePrompt, safePrompt } = demoContextInjection();
  console.log('❌ UNSAFE (no context — AI will hallucinate):');
  console.log(`   "${unsafePrompt}"\n`);
  console.log('✅ SAFE (grounded in real data):');
  console.log(`   ${safePrompt.substring(0, 120)}...\n`);

  // Demo 4: Output validation
  console.log('─────────────────────────────────────────────');
  console.log('✅ DEMO 4: Output Validation\n');

  const goodJSON = '{"summary": "Fund a garden", "recommendation": "Low risk"}';
  const badJSON = 'Here is my analysis: the proposal is good';
  const wrappedJSON = '```json\n{"summary": "Fund a garden"}\n```';

  console.log('   Valid JSON:', validateAIResponse(goodJSON, ['summary']));
  console.log('   Invalid text:', validateAIResponse(badJSON, ['summary']));
  console.log('   Wrapped JSON:', validateAIResponse(wrappedJSON, ['summary']));

  console.log('\n══════════════════════════════════════════════');
  console.log('  ✅ All demos complete! Ready for Phase 2.   ');
  console.log('══════════════════════════════════════════════\n');
}

// Run if executed directly (not imported)
if (require.main === module) {
  runDemos();
}

module.exports = {
  estimateTokens,
  demoContextInjection,
  validateAIResponse,
  BAD_PROMPT,
  GOOD_PROMPT,
};
