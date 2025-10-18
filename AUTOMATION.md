# Automation Guide

This guide explains how to set up automatic syncing of Google Meet attendance to Clockify.

## Prerequisites

✅ **OAuth Token Already Configured**
- Your `token.json` contains a refresh token that allows automatic renewal
- The refresh token does NOT expire as long as you use it at least once every 6 months
- The code now automatically refreshes access tokens when they expire

## Automation Options

### Option 1: macOS Cron Job (Recommended for Local)

Run the sync automatically every day at 9 AM:

1. **Create a log directory:**
   ```bash
   mkdir -p ~/Library/Logs/meet-clockify-sync
   ```

2. **Open crontab editor:**
   ```bash
   crontab -e
   ```

3. **Add this line** (adjust npm path if needed):
   ```bash
   0 9 * * * cd /Users/xxx/p/meet-clockify-sync && /Users/xxx/.nvm/versions/node/v20.13.1/bin/npm start >> ~/Library/Logs/meet-clockify-sync/sync.log 2>&1
   ```

   **Note:** Find your npm path with `which npm` and use that instead.

4. **Save and exit** (`:wq` in vim)

5. **Verify cron job:**
   ```bash
   crontab -l
   ```

**Cron Schedule Examples:**
- `0 9 * * *` - Every day at 9:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1-5` - Weekdays at 9:00 AM
- `0 0 * * *` - Every day at midnight

### Option 2: macOS LaunchAgent (Better for macOS)

LaunchAgent is more reliable on macOS than cron.

1. **Create the plist file:**
   ```bash
   nano ~/Library/LaunchAgents/com.blaze.meet-clockify-sync.plist
   ```

2. **Paste this content:**
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.blaze.meet-clockify-sync</string>
       <key>ProgramArguments</key>
       <array>
           <string>/Users/xxx/.nvm/versions/node/v20.13.1/bin/npm</string>
           <string>start</string>
       </array>
       <key>WorkingDirectory</key>
       <string>/Users/xxx/p/meet-clockify-sync</string>
       <key>StandardOutPath</key>
       <string>/Users/xxx/Library/Logs/meet-clockify-sync/sync.log</string>
       <key>StandardErrorPath</key>
       <string>/Users/xxx/Library/Logs/meet-clockify-sync/error.log</string>
       <key>StartCalendarInterval</key>
       <dict>
           <key>Hour</key>
           <integer>9</integer>
           <key>Minute</key>
           <integer>0</integer>
       </dict>
       <key>RunAtLoad</key>
       <false/>
   </dict>
   </plist>
   ```

3. **Create log directory:**
   ```bash
   mkdir -p ~/Library/Logs/meet-clockify-sync
   ```

4. **Load the agent:**
   ```bash
   launchctl load ~/Library/LaunchAgents/com.blaze.meet-clockify-sync.plist
   ```

5. **Test it manually:**
   ```bash
   launchctl start com.blaze.meet-clockify-sync
   ```

6. **Check logs:**
   ```bash
   tail -f ~/Library/Logs/meet-clockify-sync/sync.log
   ```

**Useful LaunchAgent Commands:**
```bash
# Stop the agent
launchctl stop com.blaze.meet-clockify-sync

# Unload the agent
launchctl unload ~/Library/LaunchAgents/com.blaze.meet-clockify-sync.plist

# Reload after changes
launchctl unload ~/Library/LaunchAgents/com.blaze.meet-clockify-sync.plist
launchctl load ~/Library/LaunchAgents/com.blaze.meet-clockify-sync.plist

# Check if it's loaded
launchctl list | grep meet-clockify-sync
```

### Option 3: Cloud Deployment (For 24/7 Automation)

If your Mac isn't always on, deploy to a server:

#### Using GitHub Actions (Free)

1. **Create `.github/workflows/sync.yml`:**
   ```yaml
   name: Sync Google Meet to Clockify

   on:
     schedule:
       - cron: '0 9 * * *'  # Daily at 9 AM UTC
     workflow_dispatch:  # Manual trigger

   jobs:
     sync:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: 18
             cache: 'npm'
         - run: npm install
         - run: npm start
           env:
             GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
             GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
             GOOGLE_USER_EMAIL: ${{ secrets.GOOGLE_USER_EMAIL }}
             CLOCKIFY_API_TOKEN: ${{ secrets.CLOCKIFY_API_TOKEN }}
   ```

2. **Add secrets to GitHub:**
   - Go to: Repository → Settings → Secrets and variables → Actions
   - Add each environment variable as a secret
   - Upload `token.json` content as a secret

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

### Check Logs
```bash
# For cron
tail -f ~/Library/Logs/meet-clockify-sync/sync.log

# For LaunchAgent
tail -f ~/Library/Logs/meet-clockify-sync/sync.log
tail -f ~/Library/Logs/meet-clockify-sync/error.log
```

### Verify Token is Fresh
```bash
# Check token expiry
cat token.json | grep expiry_date
```

### Manual Test Run
```bash
cd /Users/xxx/p/meet-clockify-sync
npm start
```

## Troubleshooting

### "Refresh token is invalid"
- Re-authenticate: Delete `token.json` and run `npm start`
- Check if app was revoked in https://myaccount.google.com/permissions

### "App in Testing Mode" (7-day expiration)
1. Go to Google Cloud Console → OAuth consent screen
2. Click "PUBLISH APP" to make it production
3. Or add yourself as a test user and keep it in testing

### Cron job not running
```bash
# Check if cron service is running
sudo launchctl list | grep cron

# Check system logs
log show --predicate 'process == "cron"' --last 1h
```

### LaunchAgent not running
```bash
# Check if loaded
launchctl list | grep meet-clockify-sync

# Check logs
tail -f ~/Library/Logs/meet-clockify-sync/error.log
```

## Best Practices

1. ✅ Run sync at least once per month to keep refresh token active
2. ✅ Monitor logs regularly to catch failures
3. ✅ Set `SYNC_DAYS=7` for daily syncs (no need to sync old data every time)
4. ✅ Keep `DRY_RUN=false` for automated runs
5. ✅ Backup your `token.json` file securely
6. ✅ Publish your OAuth app or keep it in testing with yourself as a test user

## Security Notes

⚠️ **Important:**
- Never commit `token.json` to git (already in `.gitignore`)
- Never commit `.env` to git (already in `.gitignore`)
- Keep your `CLOCKIFY_API_TOKEN` secure
- Regularly review app permissions in Google Account settings
