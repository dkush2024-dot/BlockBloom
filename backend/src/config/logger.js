/**
 * Application-wide logger using Winston.
 *
 * WHY WINSTON INSTEAD OF console.log:
 *   - Structured JSON logs in production (easy to parse by log aggregators)
 *   - Log levels (error, warn, info, debug) — filter noise in production
 *   - File transport in production so logs survive process restarts
 *   - Colorized output in development for readability
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');
const config = require('./index');

const logger = createLogger({
  level: config.isProduction ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'blockbloom-backend' },
  transports: [
    // Console transport — always active
    new transports.Console({
      format: config.isProduction
        ? format.json()
        : format.combine(
            format.colorize(),
            format.printf(({ level, message, timestamp, ...meta }) => {
              const metaStr = Object.keys(meta).length > 1
                ? ` ${JSON.stringify(meta)}`
                : '';
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            })
          ),
    }),
  ],
});

// In production, also write to rotating log files
if (config.isProduction) {
  const logDir = path.join(__dirname, '../../logs');
  logger.add(new transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }));
  logger.add(new transports.File({ filename: path.join(logDir, 'combined.log') }));
}

module.exports = logger;
