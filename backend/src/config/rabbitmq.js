const amqp = require('amqplib');
const logger = require('./logger');

let connection = null;
let channel = null;

const EXCHANGE_NAME = 'blockbloom_events';
const QUEUE_NAME = 'event_processing_queue';

async function connectRabbitMQ() {
  try {
    const rabbitMqUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
    connection = await amqp.connect(rabbitMqUrl);
    channel = await connection.createChannel();

    // Assert Exchange
    await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });

    // Assert Queue
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    // Bind Queue to Exchange for all event types we care about
    const routingKeys = [
      'election.created',
      'proposal.created',
      'vote.cast',
      'proposal.queued',
      'proposal.executed',
      'proposal.cancelled',
      'transaction.executed',
    ];

    for (const key of routingKeys) {
      await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, key);
    }

    logger.info(`🐇 RabbitMQ connected to ${rabbitMqUrl}`);
  } catch (error) {
    logger.error('Error connecting to RabbitMQ:', error);
    // Retry connection logic could go here
    setTimeout(connectRabbitMQ, 5000);
  }
}

const EventEmitter = require('events');
const fallbackEmitter = new EventEmitter();

function getChannel() {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  return channel;
}

function publishEvent(routingKey, data) {
  if (!channel) {
    logger.warn(`⚠️ RabbitMQ not connected. Falling back to in-memory event dispatch: "${routingKey}"`);
    fallbackEmitter.emit(routingKey, data);
    return true;
  }
  try {
    channel.publish(
      EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(data)),
      { persistent: true }
    );
    return true;
  } catch (error) {
    logger.error('Error publishing event to RabbitMQ:', error);
    return false;
  }
}

async function closeRabbitMQ() {
  if (channel) await channel.close();
  if (connection) await connection.close();
  logger.info('RabbitMQ connection closed.');
}

module.exports = {
  connectRabbitMQ,
  getChannel,
  publishEvent,
  closeRabbitMQ,
  QUEUE_NAME,
  fallbackEmitter,
};
