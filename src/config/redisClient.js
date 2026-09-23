import Redis from 'ioredis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  connectTimeout: 10000,
  // Refresh-token persistence failures are already caught and logged by
  // callers - fail fast instead of retry-storming and blocking login/refresh
  // requests for tens of seconds when Redis is unavailable.
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

export default redisClient;
