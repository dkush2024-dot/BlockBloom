const { createClient } = require('redis');
const logger = require('./logger');

const redisUrl = process.env.REDIS_URL;

let client;
if (redisUrl) {
  client = createClient({ url: redisUrl });
  client.on('error', (err) => logger.error('Redis Client Error', err));
  client.connect()
    .then(() => logger.info('Redis connected ✅'))
    .catch(err => logger.error('Redis connection failed:', err));
} else {
  // Mock client if REDIS_URL is not set so app doesn't crash locally
  client = {
    get: async () => null,
    setEx: async () => null,
    del: async () => null,
    isOpen: false
  };
  logger.warn('REDIS_URL not set, Redis caching disabled.');
}

module.exports = client;
