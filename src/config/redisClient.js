import Redis from 'ioredis';
import logger from '../utils/logger.js';
import { redisOptions } from './env.js';

// REDIS_URL (redis:// or rediss:// for TLS), or REDIS_HOST/PORT/PASSWORD.
const redisClient = new Redis(...redisOptions({
  connectTimeout: 10000,
  // Refresh-token persistence failures are already caught and logged by
  // callers - fail fast instead of retry-storming and blocking login/refresh
  // requests for tens of seconds when Redis is unavailable.
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 500, 5000),
}));

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});

export default redisClient;
