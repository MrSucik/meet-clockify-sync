# Coolify Deployment Guide

This guide explains how to deploy the meet-clockify-sync service to Coolify with HTTP endpoint for cron scheduling.

## Overview

The service runs a Hono web server with endpoints for:
- Health checks
- HTTP-triggered sync (for cron jobs)

## Deployment Steps

### 1. Prerequisites

- Coolify instance set up
- Google OAuth credentials configured
- Clockify API token

### 2. Create New Service in Coolify

1. Go to your Coolify dashboard
2. Click **"+ New Resource"** → **"Service"**
3. Choose **"Docker Compose"** or **"Dockerfile"**

### 3. Configure Environment Variables

Add these environment variables in Coolify:

```env
# Google Meet API Configuration
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_USER_EMAIL=your.email@gmail.com

# Clockify API Configuration
CLOCKIFY_API_TOKEN=your_clockify_token

# Application Configuration
NODE_ENV=production
SYNC_DAYS=90
PORT=3000

# API Endpoints
CLOCKIFY_API_BASE=https://api.clockify.me/api

# Rate Limiting
CLOCKIFY_API_DELAY=50

# Project Configuration
MEET_PROJECT_NAME=Google Meet

# Dry Run (set to false for production)
DRY_RUN=false
```

### 4. Add token.json as Secret

Since you need the OAuth refresh token, you have two options:

#### Option A: Mount as Volume (Recommended)
1. First, authenticate locally to generate `token.json`
2. In Coolify, go to **Storage** → **Add Volume**
3. Upload your `token.json` file
4. Mount it to `/app/token.json` in the container

#### Option B: Embed in Docker Image
1. Build image locally with token.json
2. Push to registry
3. Use that image in Coolify

### 5. Configure Dockerfile Deployment

If using Dockerfile method:

**Build Pack:** Dockerfile
**Dockerfile Location:** `./Dockerfile`
**Port:** 3000

### 6. Set Up Cron Job in Coolify

1. Go to your service → **Scheduled Tasks**
2. Click **"Add Scheduled Task"**
3. Configure:
   - **Name:** Sync Google Meet to Clockify
   - **Schedule:** `0 9 * * *` (daily at 9 AM)
   - **Command:** `curl -X POST http://localhost:3000/sync`

Or use external cron service:
```bash
curl -X POST https://your-app.coolify.domain/sync
```

### 7. Health Check Configuration

Configure health check in Coolify:
- **Health Check Path:** `/health`
- **Health Check Port:** 3000
- **Health Check Interval:** 30s

## API Endpoints

### GET `/`
Service information
```bash
curl https://your-app.coolify.domain/
```

Response:
```json
{
  "status": "ok",
  "service": "meet-clockify-sync",
  "version": "1.0.0"
}
```

### GET `/health`
Health check endpoint
```bash
curl https://your-app.coolify.domain/health
```

Response:
```json
{
  "status": "healthy"
}
```

### POST `/sync`
Trigger sync manually or via cron
```bash
curl -X POST https://your-app.coolify.domain/sync
```

Response:
```json
{
  "status": "success",
  "message": "Sync completed",
  "stats": {
    "meetings_found": 12,
    "synced": 2,
    "skipped": 10,
    "failed": 0,
    "total_in_clockify": 12
  },
  "dry_run": false
}
```

## Cron Schedule Examples

Set these in Coolify's Scheduled Tasks:

```bash
# Every day at 9 AM
0 9 * * *

# Every 6 hours
0 */6 * * *

# Weekdays at 9 AM
0 9 * * 1-5

# Every hour during work hours (9 AM - 5 PM)
0 9-17 * * *
```

## Monitoring

### Check Logs
In Coolify dashboard:
1. Go to your service
2. Click **"Logs"**
3. Watch sync output in real-time

### Test Sync Manually
```bash
# Trigger sync via curl
curl -X POST https://your-app.coolify.domain/sync

# Check health
curl https://your-app.coolify.domain/health
```

### Monitor with External Services
Use services like:
- **Better Uptime** - Monitor `/health` endpoint
- **Cronitor** - Monitor cron job execution
- **UptimeRobot** - HTTP monitoring

## Troubleshooting

### "No saved credentials found"
**Problem:** `token.json` is missing or not mounted

**Solution:**
1. Generate `token.json` locally by running `npm start`
2. Upload to Coolify as volume or secret
3. Redeploy

### "Refresh token expired"
**Problem:** Token hasn't been used in 6 months

**Solution:**
1. Delete `token.json`
2. Re-authenticate locally
3. Upload new token to Coolify

### "App in Testing Mode" (7-day token expiration)
**Problem:** OAuth app is in testing mode

**Solution:**
1. Go to Google Cloud Console → OAuth consent screen
2. Click **"PUBLISH APP"**
3. Or keep in testing and add yourself as test user

### Service won't start
**Problem:** Missing environment variables

**Solution:**
Check all required env vars are set in Coolify:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_USER_EMAIL`
- `CLOCKIFY_API_TOKEN`

### Sync fails with rate limit
**Problem:** Too many API requests

**Solution:**
Increase `CLOCKIFY_API_DELAY` in environment variables (e.g., from 50 to 100)

## Security Best Practices

1. ✅ Use Coolify's **Secret Management** for sensitive values
2. ✅ Enable **HTTPS** for your domain
3. ✅ Add **Authentication** to `/sync` endpoint if exposed publicly
4. ✅ Regularly rotate API tokens
5. ✅ Monitor logs for suspicious activity
6. ✅ Keep `token.json` secure and never commit to git

## Advanced: Add Authentication to /sync

To protect the sync endpoint, add a simple bearer token:

1. Add to `.env`:
```env
SYNC_API_KEY=your-random-secret-key
```

2. Modify `src/server.ts`:
```typescript
app.post('/sync', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return c.json({ status: 'error', message: 'Unauthorized' }, 401);
  }
  // ... rest of sync code
});
```

3. Call with auth:
```bash
curl -X POST https://your-app.coolify.domain/sync \
  -H "Authorization: Bearer your-random-secret-key"
```

## Local Testing

Test the server locally before deploying:

```bash
# Start server
npm run server

# In another terminal, test endpoints
curl http://localhost:3000/
curl http://localhost:3000/health
curl -X POST http://localhost:3000/sync
```

## Resources

- [Coolify Documentation](https://coolify.io/docs)
- [Hono Documentation](https://hono.dev/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Clockify API](https://clockify.me/developers-api)
