import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { validateEnvironment } from './config/env';
import { closeRedisConnection } from './config/redis';
import { closeDb } from './db';
import { closeSyncQueue, getSyncQueue } from './queues/sync-queue';
import { createGoogleMeetService } from './services/google-meet-service';
import { loadTokens } from './utils/token-storage';
import { closeSyncWorker, createSyncWorker } from './workers/sync-worker';

const app = new Hono();

// Apply middleware
app.use('*', logger());
app.use('*', cors());

// Initialize environment
const env = validateEnvironment();

// Setup Bull Board for queue monitoring
const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath('/admin/queues');

const syncQueue = getSyncQueue();

createBullBoard({
  queues: [new BullMQAdapter(syncQueue)],
  serverAdapter,
});

// Mount Bull Board routes (no auth for admin UI)
const bullBoardApp = serverAdapter.registerPlugin();
app.route('/admin/queues', bullBoardApp);

// Apply basic auth to all endpoints except health check and OAuth flow
app.use('*', async (c, next) => {
  // Skip auth for health check and OAuth endpoints
  if (c.req.path === '/health' || c.req.path === '/auth' || c.req.path === '/callback') {
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
  // Check token status
  const hasGoogleToken = (await loadTokens()) !== null;
  const hasClockifyToken = !!env.CLOCKIFY_API_TOKEN;

  const acceptHeader = c.req.header('accept') || '';
  const wantsHtml = acceptHeader.includes('text/html');

  if (wantsHtml) {
    return c.html(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Google Meet Clockify Sync</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
      text-align: center;
      background: #f5f5f5;
    }
    h1 {
      color: #333;
      margin-bottom: 30px;
    }
    h2 {
      color: #555;
      margin-bottom: 15px;
    }
    .status-item {
      background: white;
      border: 1px solid #e1e5e9;
      border-radius: 8px;
      padding: 15px;
      margin: 10px 0;
      text-align: left;
    }
    .configured {
      color: #28a745;
    }
    .needs-auth {
      color: #dc3545;
    }
    .sync-form {
      margin: 20px 0;
    }
    .btn {
      background: #007bff;
      color: white;
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      text-decoration: none;
    }
    .btn:hover {
      background: #0056b3;
    }
    .btn:disabled {
      background: #6c757d;
      cursor: not-allowed;
    }
    .auth-link {
      display: inline-block;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <h1>🎥 Google Meet Clockify Sync</h1>

  <h2>📊 Status</h2>
  <div class="status-item">
    <strong>Google Meet API:</strong>
    <span class="${hasGoogleToken ? 'configured' : 'needs-auth'}">
      ${hasGoogleToken ? '✅ Configured' : '❌ Needs Authentication'}
    </span>
  </div>
  <div class="status-item">
    <strong>Clockify API:</strong>
    <span class="${hasClockifyToken ? 'configured' : 'needs-auth'}">
      ${hasClockifyToken ? '✅ Configured' : '❌ Needs Token'}
    </span>
  </div>

  <h2>🔄 Sync Actions</h2>
  <div class="sync-form">
    <form action="/sync" method="post">
      <button type="submit" class="btn" ${!hasGoogleToken || !hasClockifyToken ? 'disabled' : ''}>
        Start Manual Sync
      </button>
    </form>
  </div>

  <div class="auth-link">
    <a href="/auth" class="btn">🔐 Authenticate with Google</a>
  </div>

  <div class="auth-link" style="margin-left: 10px;">
    <a href="/admin/queues" class="btn" style="background: #6c757d;">📊 Job Queue Dashboard</a>
  </div>
</body>
</html>
    `);
  }

  return c.json({
    name: 'Google Meet Clockify Sync',
    status: 'healthy',
    version: '1.0.0',
    authentication: {
      google: {
        configured: hasGoogleToken,
        status: hasGoogleToken ? 'configured' : 'needs_authentication',
      },
      clockify: {
        configured: hasClockifyToken,
        status: hasClockifyToken ? 'configured' : 'needs_token',
      },
    },
    environment: {
      node_env: env.NODE_ENV,
      server_port: env.SERVER_PORT,
      sync_days: env.SYNC_DAYS,
    },
    endpoints: {
      health: '/health',
      sync: '/sync',
      auth: '/auth',
      'oauth-callback': '/callback',
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
    const hasGoogleToken = (await loadTokens()) !== null;

    if (!hasGoogleToken) {
      return c.json(
        {
          error: 'Google access token not configured',
          message: 'Please authenticate with Google first',
          authUrl: '/auth',
        },
        401,
      );
    }

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

// Google OAuth authentication endpoint
app.get('/auth', async (c) => {
  try {
    const googleMeetService = createGoogleMeetService();
    const authUrl = googleMeetService.getAuthUrl();

    // Redirect to Google OAuth URL
    return c.redirect(authUrl);
  } catch (error: unknown) {
    console.error('Auth endpoint error:', error);
    return c.html(
      `
      <h1>Authentication Failed</h1>
      <p>Failed to generate authentication URL: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      <a href="/">Back to home</a>
    `,
      500,
    );
  }
});

// OAuth callback endpoint
app.get('/callback', async (c) => {
  try {
    const code = c.req.query('code');

    if (!code) {
      return c.html(
        `
        <h1>Authentication Failed</h1>
        <p>No authorization code received</p>
        <a href="/">Back to home</a>
      `,
        400,
      );
    }

    const googleMeetService = createGoogleMeetService();
    await googleMeetService.saveCredentialsFromCode(code);

    return c.html(`
      <h1>Authentication Successful</h1>
      <p>Google Meet access token has been saved successfully</p>
      <a href="/">Back to home</a>
    `);
  } catch (error: unknown) {
    console.error('OAuth callback error:', error);
    return c.html(
      `
      <h1>Authentication Failed</h1>
      <p>Failed to save credentials: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      <a href="/">Back to home</a>
    `,
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
