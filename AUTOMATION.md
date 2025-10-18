# Automation Guide

This guide explains how to set up automatic syncing of Google Meet attendance to Clockify using Coolify.

## Prerequisites

✅ **OAuth Token Already Configured**
- Your `token.json` contains a refresh token that allows automatic renewal
- The refresh token does NOT expire as long as you use it at least once every 6 months
- The code now automatically refreshes access tokens when they expire

## Coolify Deployment

**For complete Coolify setup instructions, see [COOLIFY.md](./COOLIFY.md)**

The service runs as an HTTP server in Coolify with:
- Health check endpoint: `GET /health`
- Sync trigger endpoint: `POST /sync`
- Automatic cron scheduling via Coolify's Scheduled Tasks

### Quick Setup

1. Deploy to Coolify using the provided Dockerfile
2. Configure environment variables
3. Mount `token.json` as a volume
4. Add Scheduled Task: `curl -X POST http://localhost:3000/sync`
5. Set schedule: `0 9 * * *` (daily at 9 AM)

## Token Refresh Behavior

✅ **Automatic Refresh Enabled**
- The access token expires every hour
- The refresh token is used to automatically get a new access token
- The new tokens are saved back to `token.json`
- **No manual intervention required!**

## Refresh Token Expiration Conditions

Your refresh token will expire if:
- ❌ Not used for 6 months (Solution: Run sync at least every 6 months)
- ❌ User revokes app access in Google Account settings
- ❌ App is in "Testing" mode for more than 7 days (Solution: Publish the app in Google Cloud Console)
- ❌ You exceed 50 refresh tokens per user

**Recommendation:** Run the sync daily or weekly to ensure the refresh token stays active.

## Monitoring

See [COOLIFY.md](./COOLIFY.md) for:
- How to check logs in Coolify dashboard
- Testing sync endpoints manually
- Setting up external monitoring services

## Troubleshooting

### "Refresh token is invalid"
1. Re-authenticate locally: Delete `token.json` and run `npm start`
2. Upload new `token.json` to Coolify
3. Restart the service

### "App in Testing Mode" (7-day expiration)
1. Go to Google Cloud Console → OAuth consent screen
2. Click "PUBLISH APP" to make it production
3. Or add yourself as a test user and keep it in testing

For more troubleshooting, see [COOLIFY.md](./COOLIFY.md)

## Best Practices for Coolify Deployment

1. ✅ Run sync at least once per month to keep refresh token active
2. ✅ Monitor Coolify logs regularly to catch failures
3. ✅ Set `SYNC_DAYS=7` or `SYNC_DAYS=30` for regular syncs
4. ✅ Keep `DRY_RUN=false` for production
5. ✅ Backup your `token.json` file securely
6. ✅ Publish your OAuth app or keep it in testing with yourself as a test user
7. ✅ Set up health check monitoring in Coolify
8. ✅ Use Coolify's Scheduled Tasks for cron instead of external services

## Security Notes

⚠️ **Important:**
- Never commit `token.json` to git (already in `.gitignore`)
- Never commit `.env` to git (already in `.gitignore`)
- Keep your `CLOCKIFY_API_TOKEN` secure
- Regularly review app permissions in Google Account settings
