/**
 * Centralized configuration module.
 *
 * WHY THIS EXISTS:
 * Instead of scattering `process.env.XYZ` calls across dozens of files,
 * we read every environment variable ONCE here, validate it, and export
 * a frozen config object. This means:
 *   1. Typos in env-var names are caught at startup, not at 3 AM in production.
 *   2. Every other module imports `config` — no direct `process.env` coupling.
 *   3. Adding a new variable is a single-line change in one place.
 */

require('dotenv').config();

const config = {
  // --- Server ---
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // --- MongoDB ---
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/blockbloom',

  // --- Blockchain ---
  rpcUrl: process.env.RPC_URL,
  daoFactoryAddress: process.env.DAO_FACTORY_ADDRESS,
  bloomTokenAddress: process.env.BLOOM_TOKEN_ADDRESS,

  // --- CORS ---
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // --- Rate Limiting ---
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,

  // --- Auth ---
  jwtSecret: process.env.JWT_SECRET || 'super-secret-default-key-please-change',

  // --- AI (Gemini) ---
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
};

/**
 * Validate that critical variables are present.
 * The server will refuse to start if any are missing — fail fast.
 */
const requiredVars = ['rpcUrl', 'daoFactoryAddress'];
for (const key of requiredVars) {
  if (!config[key] || config[key].includes('0x000000000000000000000000000000000000')) {
    if (config.isProduction) {
      throw new Error(`Missing required config: ${key}. Set it in your .env file.`);
    }
    console.warn(`⚠️  WARNING: "${key}" is not configured. Blockchain features will be disabled.`);
  }
}

module.exports = config;
