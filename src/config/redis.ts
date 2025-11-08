import Redis from 'ioredis';

let redisConnection: Redis | null = null;

/**
 * Gets the Redis connection
 * Creates a new connection if one doesn't exist
 */
export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false, // Required for BullMQ
    });

    redisConnection.on('error', (error: Error) => {
      console.error('❌ Redis connection error:', error);
    });

    redisConnection.on('connect', () => {
      console.log('✅ Redis connected');
    });

    redisConnection.on('ready', () => {
      console.log('✅ Redis ready');
    });
  }

  return redisConnection;
}

/**
 * Closes the Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
    console.log('✅ Redis connection closed');
  }
}
