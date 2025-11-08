# Migration Guide: PostgreSQL, Redis, BullMQ & Enhanced Architecture

This guide explains the new architecture and how to migrate from the previous token.json-based setup.

## What's New

### 1. Database (PostgreSQL + Drizzle ORM)
- **Token Storage**: OAuth tokens now stored in PostgreSQL instead of `token.json`
- **Schema**: Single `tokens` table with automatic timestamps and upsert support
- **Migrations**: Drizzle migrations in `./drizzle` directory

### 2. Job Queue (Redis + BullMQ)
- **Background Jobs**: Sync operations run as BullMQ jobs
- **Scheduled Sync**: Automatic hourly syncs via cron pattern (configurable)
- **Manual Trigger**: POST `/sync` adds job to queue immediately
- **Monitoring**: Bull Board dashboard at `/admin/queues`

### 3. Enhanced Server (Hono.js)
- **Middleware Stack**: Logger, CORS, Basic Auth
- **Content Negotiation**: HTML landing page or JSON response
- **Admin Dashboard**: Bull Board UI for queue monitoring
- **Graceful Shutdown**: Proper cleanup of connections

## New Environment Variables

Add these to your `.env` file:

```bash
# Database Configuration
DATABASE_URL=postgresql://meet_user:changeme@localhost:5432/meet_clockify

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Server Configuration
SERVER_PORT=3000

# Scheduler Configuration (cron pattern)
SYNC_SCHEDULE=0 * * * *

# Basic Authentication
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=changeme
```

## Migration Steps

### Option 1: Fresh Start (Recommended)

1. **Update dependencies:**
   ```bash
   npm install
   ```

2. **Generate and run migrations:**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

3. **Migrate existing tokens** (if you have `token.json`):
   ```bash
   # Start a Node REPL
   node
   ```

   ```javascript
   // In the REPL:
   const { loadTokens, saveTokens } = require('./src/utils/token-storage');
   const fs = require('fs');

   // Load from token.json
   const tokenJson = JSON.parse(fs.readFileSync('./token.json', 'utf-8'));

   // Convert and save to database
   await saveTokens({
     access_token: tokenJson.access_token,
     refresh_token: tokenJson.refresh_token,
     expires_at: tokenJson.expiry_date,
     token_type: tokenJson.token_type || 'Bearer',
     scope: tokenJson.scope
   });
   ```

4. **Start with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

### Option 2: Local Development

1. **Start PostgreSQL:**
   ```bash
   # Using Docker:
   docker run -d \
     --name meet-postgres \
     -e POSTGRES_PASSWORD=changeme \
     -e POSTGRES_USER=meet_user \
     -e POSTGRES_DB=meet_clockify \
     -p 5432:5432 \
     postgres:16-alpine
   ```

2. **Start Redis:**
   ```bash
   # Using Docker:
   docker run -d \
     --name meet-redis \
     -p 6379:6379 \
     redis:7-alpine
   ```

3. **Run migrations:**
   ```bash
   npm run db:migrate
   ```

4. **Start server:**
   ```bash
   npm run server
   ```

## New NPM Scripts

```bash
# Database
npm run db:generate    # Generate migration files
npm run db:migrate     # Run migrations
npm run db:studio      # Open Drizzle Studio UI

# Server
npm run server         # Start production server
npm run server:watch   # Start server in watch mode

# CLI (still available for local testing)
npm start              # Run one-off sync
```

## Architecture Changes

### Before
```
┌─────────────┐
│  CLI Script │
│             │
│  token.json ├──> Google Meet API
│             │
└─────────────┘
```

### After
```
┌──────────────┐     ┌──────────┐     ┌────────────┐
│ Hono Server  │────>│  Redis   │────>│   Worker   │
│              │     │          │     │            │
│ Bull Board   │     │ BullMQ   │     │ Sync Logic │
│ Basic Auth   │     │ Queues   │     │            │
└──────────────┘     └──────────┘     └────────────┘
        │                                     │
        │                                     v
        v                              ┌──────────┐
  ┌──────────┐                         │PostgreSQL│
  │ Schedule │                         │  Tokens  │
  │  Cron    │                         └──────────┘
  └──────────┘
```

## API Endpoints

### New Endpoints

- `GET /` - Landing page (HTML) or service info (JSON)
- `GET /health` - Health check endpoint
- `POST /sync` - Trigger manual sync (returns job ID)
- `GET /admin/queues` - Bull Board dashboard (no auth required)

### Authentication

All endpoints except `/admin/queues` require Basic Auth:
- Username: `BASIC_AUTH_USERNAME` from .env
- Password: `BASIC_AUTH_PASSWORD` from .env

Example:
```bash
curl -u admin:changeme -X POST http://localhost:3000/sync
```

## Monitoring

Access the Bull Board dashboard at:
```
http://localhost:3000/admin/queues
```

Features:
- View all jobs (pending, active, completed, failed)
- Retry failed jobs
- See job details and logs
- Monitor queue metrics

## Troubleshooting

### Database connection errors
```bash
# Check DATABASE_URL is set correctly
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL
```

### Redis connection errors
```bash
# Check REDIS_URL is set correctly
echo $REDIS_URL

# Test connection
redis-cli -u $REDIS_URL ping
```

### Token migration issues
If tokens aren't working after migration:
1. Re-run the authentication flow: `npm start`
2. Tokens will be saved to database automatically

### Jobs not processing
Check worker is running:
```bash
# Check server logs
docker-compose logs -f app

# Or if running locally
npm run server:watch
```

## Docker Deployment

### Build and run:
```bash
docker-compose up -d
```

### Check logs:
```bash
docker-compose logs -f app
```

### Stop services:
```bash
docker-compose down
```

### Reset database:
```bash
docker-compose down -v  # Warning: Deletes all data!
docker-compose up -d
```

## Production Considerations

1. **Environment Variables**: Update all values in `.env`
2. **Database Backups**: Set up regular PostgreSQL backups
3. **Redis Persistence**: Configure Redis with AOF or RDB persistence
4. **Monitoring**: Use Bull Board + external monitoring (e.g., Sentry)
5. **Scaling**: Run multiple workers if needed (update concurrency)
6. **Secrets**: Use proper secret management (not .env files)

## Rollback Plan

If you need to rollback to the old system:

1. Stop the new server
2. Checkout previous git commit
3. Restore `token.json` from backup
4. Run old CLI: `npm start`

Note: Keep `token.json` backed up during migration!
