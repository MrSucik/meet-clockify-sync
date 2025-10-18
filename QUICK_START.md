# Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites

- ✅ Google Workspace Business Plus or higher
- ✅ Clockify account
- ✅ Node.js 18+ installed
- ✅ npm installed

## 1. Get Google OAuth Credentials (3 minutes)

1. **Go to**: https://console.cloud.google.com/
2. **Create project** or select existing
3. **Enable API**:
   - APIs & Services → Library → Search "Google Meet API" → Enable
4. **Create credentials**:
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Type: Web application
   - Add redirect URI: `http://localhost:3000/oauth2callback`
   - **Copy**: Client ID and Client Secret

## 2. Get Clockify API Token (30 seconds)

1. **Go to**: https://app.clockify.me/user/settings
2. **Scroll to**: API section
3. **Click**: Generate
4. **Copy**: API token

## 3. Configure Environment (1 minute)

```bash
cd /Users/xxx/p/meet-clockify-sync
cp .env.example .env
```

Edit `.env` and replace these values:

```env
GOOGLE_CLIENT_ID=paste_your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=paste_your_client_secret_here
GOOGLE_USER_EMAIL=your.email@company.com
CLOCKIFY_API_TOKEN=paste_your_clockify_token_here
```

**Leave these unchanged:**
```env
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
NODE_ENV=development
SYNC_DAYS=30
CLOCKIFY_API_BASE=https://api.clockify.me/api
CLOCKIFY_API_DELAY=50
MEET_PROJECT_NAME=Google Meet
```

## 4. Install & Authenticate (1 minute)

```bash
npm install
npm start
```

**Follow the authentication prompts:**

1. Terminal will show: `Visit this URL to authenticate: https://accounts.google.com/...`
2. Copy the URL and open in browser
3. Sign in with your Google Workspace account
4. Grant permissions
5. You'll be redirected to `http://localhost:3000/oauth2callback?code=...`
6. **Browser will show error (that's OK!)** - the page won't load
7. Copy the **entire URL** from browser address bar
8. Paste it back in the terminal when prompted

Credentials will be saved to `token.json` for future use.

## 5. Run Sync

```bash
npm start
```

That's it! Your Google Meet attendance will sync to Clockify.

---

## What Happens?

1. ✅ Fetches your Meet sessions from last 30 days
2. ✅ Gets your actual join/leave times
3. ✅ Creates time entries in Clockify
4. ✅ Skips duplicates automatically
5. ✅ Shows progress bar and summary

## Example Output

```
🎥 Google Meet → Clockify Sync

✅ Environment validation successful
   Environment: development
   Sync Days: 30

🎥 Starting Google Meet to Clockify sync...
✅ Google Meet API initialized
📋 Clockify User: John Doe (john@company.com)
📁 Using Clockify Workspace: Company Workspace
📂 Using existing project: Google Meet

📅 Fetching meetings from last 30 days (2025-09-18 to 2025-10-18)...
✅ Found 45 meeting sessions in Google Meet history

📊 Found 120 existing time entries in Clockify
   - 32 are Google Meet entries

📊 Processing meetings...
⏳ Progress |████████████████████| 100% | 45/45 Sessions

🎉 Sync complete!
   - Google Meet sessions found: 45
   - Newly synced: 13
   - Already existed: 32
   - Failed: 0
   - Total in Clockify now: 45 meeting entries
```

---

## Common Adjustments

### Sync More History

Edit `.env`:
```env
SYNC_DAYS=90  # Last 3 months
```

### Change Project Name

Edit `.env`:
```env
MEET_PROJECT_NAME=Client Meetings
```

### Slower API Calls (if hitting rate limits)

Edit `.env`:
```env
CLOCKIFY_API_DELAY=100
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "API not enabled" | Enable Google Meet API in Cloud Console |
| "Insufficient permissions" | Need Google Workspace Business Plus or higher |
| "redirect_uri_mismatch" | Verify redirect URI matches in both `.env` and Google Console |
| "No saved credentials" | Delete `token.json` and re-authenticate |
| Rate limit errors | Increase `CLOCKIFY_API_DELAY` in `.env` |

---

## Need More Help?

- 📖 **Full documentation**: See `README.md`
- 🔧 **Detailed setup**: See `SETUP.md`
- 🔐 **Environment guide**: See `ENV_SETUP_GUIDE.md`

---

## Development Commands

```bash
npm start       # Run sync
npm dev         # Watch mode
npm typecheck   # Type checking
npm check       # Lint code
npm check:fix   # Auto-fix issues
```
