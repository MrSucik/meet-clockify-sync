# Quick Setup Guide

## Prerequisites

- Google Workspace Business Plus or higher (required for Meet API)
- Clockify account
- Node.js 18+ and npm installed

## Setup Steps

### 1. Google Cloud Console

1. Go to https://console.cloud.google.com/
2. Create a new project (or use existing)
3. Enable APIs:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Meet API" and click "Enable"
4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Web application"
   - Add redirect URI: `http://localhost:3000/oauth2callback`
   - Save the Client ID and Client Secret

### 2. Clockify API Token

1. Go to https://app.clockify.me/user/settings
2. Scroll to "API" section
3. Click "Generate" to create a new API key
4. Copy the API key

### 3. Project Setup

```bash
cd /Users/xxx/p/meet-clockify-sync
npm install
cp .env.example .env
```

Edit `.env` file with your credentials:

```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_USER_EMAIL=your.email@gmail.com
CLOCKIFY_API_TOKEN=your_clockify_token
```

### 4. First Run (Authentication)

```bash
npm start
```

The app will display an authorization URL. Follow these steps:

1. Open the URL in your browser
2. Sign in with your Google Workspace account
3. Grant permissions
4. You'll be redirected to a localhost URL (it won't load, that's OK)
5. Copy the full redirect URL from your browser's address bar
6. Paste it when prompted in the terminal

The app will save your credentials to `token.json` for future use.

### 5. Subsequent Runs

After initial authentication, just run:

```bash
npm start
```

## Configuration Options

Edit `.env` to customize:

- `SYNC_DAYS`: Number of days to sync (1-365, default: 30)
- `CLOCKIFY_API_DELAY`: Delay between API calls in ms (default: 50)
- `MEET_PROJECT_NAME`: Project name in Clockify (default: "Google Meet")

## Troubleshooting

### "API not enabled"
- Make sure Google Meet API is enabled in your Google Cloud Console project

### "Insufficient permissions"
- Verify you have Google Workspace Business Plus or higher
- Check that you granted all requested permissions during OAuth flow

### "No saved credentials"
- Delete `token.json` and re-run authentication flow

### Rate Limits
- Increase `CLOCKIFY_API_DELAY` if you hit rate limits
- Google Meet API: 500 requests/day (default quota)

## What Gets Synced

The tool syncs:
- Your actual join/leave times for each meeting
- Multiple sessions if you joined the same meeting multiple times
- Meeting code for identification
- Duration calculated from your actual attendance

Each entry in Clockify will look like:
```
🎥 Code: abc-defg-hij | 1h 30m [Meet:conferenceRecords/xxx:2025-10-18T10:00:00Z]
```

## Development

```bash
# Watch mode
npm dev

# Type checking
npm typecheck

# Linting
npm lint

# Formatting
npm format
```
