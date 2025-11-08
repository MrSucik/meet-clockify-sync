import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { validateEnvironment } from './config/env';
import { closeRedisConnection } from './config/redis';
import { closeDb } from './db';
import { closeSyncQueue, getSyncQueue } from './queues/sync-queue';
import { closeSyncWorker, createSyncWorker } from './workers/sync-worker';

const app = new Hono();

// Apply middleware
app.use('*', logger());
app.use('*', cors());

// Initialize environment
const env = validateEnvironment();

// Setup Bull Board for queue monitoring
const serverAdapter = new HonoAdapter((() => {}) as never);
serverAdapter.setBasePath('/admin/queues');

const syncQueue = getSyncQueue();

createBullBoard({
  queues: [new BullMQAdapter(syncQueue)],
  serverAdapter,
});

// Mount Bull Board routes (no auth for admin UI)
const bullBoardApp = serverAdapter.registerPlugin();
app.route('/admin/queues', bullBoardApp);

// Apply basic auth to all endpoints except health check
app.use('*', async (c, next) => {
  // Skip auth only for health check
  if (c.req.path === '/health') {
    return next();
  }

  const auth = basicAuth({
    username: env.BASIC_AUTH_USERNAME,
    password: env.BASIC_AUTH_PASSWORD,
  });

  return auth(c, next);
});

// Root endpoint with content negotiation
app.get('/', async (c) => {
  const acceptHeader = c.req.header('accept') || '';
  const wantsHtml = acceptHeader.includes('text/html');

  if (wantsHtml) {
    return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Google Meet to Clockify Sync</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            line-height: 1.6;
        }
        h1 { color: #333; }
        .status { color: #28a745; font-weight: bold; }
        .endpoint {
            background: #f4f4f4;
            padding: 10px;
            margin: 10px 0;
            border-radius: 5px;
            font-family: monospace;
        }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1>🎥 Google Meet to Clockify Sync</h1>
    <p>Status: <span class="status">Running</span></p>
    <p>Version: 1.0.0</p>

    <h2>Endpoints</h2>
    <div class="endpoint">GET /health - Health check</div>
    <div class="endpoint">POST /sync - Trigger manual sync</div>
    <div class="endpoint">GET /admin/queues - Bull Board dashboard</div>

    <h2>Quick Links</h2>
    <ul>
        <li><a href="/admin/queues">Queue Dashboard</a></li>
        <li><a href="/health">Health Check</a></li>
    </ul>
</body>
</html>
		`);
  }

  return c.json({
    status: 'ok',
    service: 'meet-clockify-sync',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      sync: '/sync',
      admin: '/admin/queues',
    },
  });
});

// Health endpoint
app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Manual sync trigger endpoint
app.post('/sync', async (c) => {
  try {
    const job = await syncQueue.add('sync', {
      triggeredBy: 'manual',
      timestamp: new Date().toISOString(),
    });

    return c.json({
      status: 'success',
      message: 'Sync job added to queue',
      jobId: job.id,
      queueUrl: `/admin/queues/meet-clockify-sync/${job.id}`,
    });
  } catch (error: unknown) {
    console.error('❌ Failed to add sync job to queue:', error);
    return c.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

const port = env.SERVER_PORT;

/**
 * Setup scheduled sync job with BullMQ repeatable jobs
 */
async function setupScheduledJob(): Promise<void> {
  console.log('\n🔄 Setting up scheduled sync job...');

  // Remove any existing repeatable jobs to avoid duplicates
  const repeatableJobs = await syncQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await syncQueue.removeRepeatableByKey(job.key);
    console.log(`   Removed old repeatable job: ${job.key}`);
  }

  // Add new repeatable job with cron schedule
  await syncQueue.add(
    'sync',
    {
      triggeredBy: 'schedule',
      timestamp: new Date().toISOString(),
    },
    {
      repeat: {
        pattern: env.SYNC_SCHEDULE,
      },
    },
  );

  console.log(`✅ Scheduled sync job added with pattern: ${env.SYNC_SCHEDULE}`);

  // Add immediate initial sync
  await syncQueue.add('sync', {
    triggeredBy: 'schedule',
    timestamp: new Date().toISOString(),
  });

  console.log('✅ Initial sync job queued\n');
}

/**
 * Graceful shutdown handler
 */
async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down gracefully...');

  await closeSyncWorker();
  await closeSyncQueue();
  await closeRedisConnection();
  await closeDb();

  console.log('✅ Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * Start the server and worker
 */
async function startServer(): Promise<void> {
  console.log('\n🚀 Starting Google Meet to Clockify Sync Server...\n');

  // Setup scheduled job
  await setupScheduledJob();

  // Start the worker
  createSyncWorker();

  // Start the HTTP server
  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`✅ HTTP server running on http://localhost:${port}`);
  console.log(`📍 Endpoints:`);
  console.log(`   GET  /                 - Service info (HTML/JSON)`);
  console.log(`   GET  /health           - Health check`);
  console.log(`   POST /sync             - Trigger manual sync`);
  console.log(`   GET  /admin/queues     - Bull Board dashboard`);
  console.log(`\n🔐 Basic Auth:`);
  console.log(`   Username: ${env.BASIC_AUTH_USERNAME}`);
  console.log(`   Password: ${env.BASIC_AUTH_PASSWORD}`);
  console.log(`\n📅 Scheduled Sync:`);
  console.log(`   Pattern: ${env.SYNC_SCHEDULE}`);
  console.log('');
}

startServer();
