# Environment Variables Setup Guide

This guide will walk you through obtaining all the required credentials and setting up your `.env` file.

## Step-by-Step Setup

### 1. Google Cloud Console - OAuth Credentials

#### A. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click "New Project"
4. Enter project name: `meet-clockify-sync` (or your preferred name)
5. Click "Create"
6. Wait for project creation and select it from the dropdown

#### B. Enable Google Meet API

1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google Meet API"**
3. Click on "Google Meet API" in the results
4. Click **"Enable"** button
5. Wait for the API to be enabled

#### C. Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"Internal"** (if you have Google Workspace) or **"External"**
3. Click **"Create"**
4. Fill in required fields:
   - **App name**: `Meet Clockify Sync`
   - **User support email**: Your email
   - **Developer contact email**: Your email
5. Click **"Save and Continue"**
6. On **Scopes** page, click **"Add or Remove Scopes"**
7. Add these scopes:
   - `https://www.googleapis.com/auth/meetings.space.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
8. Click **"Update"** then **"Save and Continue"**
9. Click **"Save and Continue"** on Test users page (add your email if External)
10. Click **"Back to Dashboard"**

#### D. Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. If prompted to configure OAuth consent screen, complete that first
4. Choose **"Web application"** as Application type
5. Give it a name: `Meet Clockify Sync Client`
6. Under **"Authorized redirect URIs"**, click **"Add URI"**
7. Add: `http://localhost:3000/oauth2callback`
8. Click **"Create"**
9. A dialog will appear with your credentials:
   - **Client ID**: Copy this (looks like: `xxxxx.apps.googleusercontent.com`)
   - **Client Secret**: Copy this
10. Click **"OK"**

**Note**: You can always view these credentials later by clicking on the OAuth client name in the Credentials page.

#### E. Get Your Google Email

This is simply your Google Workspace email address (e.g., `john.doe@company.com`)

---

### 2. Clockify - API Token

#### A. Get Clockify API Token

1. Go to [Clockify](https://app.clockify.me/)
2. Log in to your account
3. Click your profile picture in the top-right corner
4. Select **"Settings"**
5. Scroll down to the **"API"** section
6. Click **"Generate"** button next to "API Key"
7. Copy the generated API key (it's a long string of random characters)

**Important**: Keep this token secure! Anyone with this token can access your Clockify account.

---

### 3. Configure Environment Variables

#### A. Create .env File

1. Navigate to the project directory:
   ```bash
   cd /Users/xxx/p/meet-clockify-sync
   ```

2. Copy the example file:
   ```bash
   cp .env.example .env
   ```

3. Open `.env` in your editor:
   ```bash
   # Using nano
   nano .env

   # Or using vim
   vim .env

   # Or open in VS Code
   code .env
   ```

#### B. Fill in Your Credentials

Replace the placeholder values with your actual credentials:

```env
# Google Meet API Configuration
GOOGLE_CLIENT_ID=your_actual_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_actual_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback

# Google User Configuration
GOOGLE_USER_EMAIL=your.email@company.com

# Clockify API Configuration
CLOCKIFY_API_TOKEN=your_actual_clockify_api_token

# Application Configuration
NODE_ENV=development
SYNC_DAYS=30

# API Endpoints
CLOCKIFY_API_BASE=https://api.clockify.me/api

# Rate Limiting Configuration
CLOCKIFY_API_DELAY=50

# Project Configuration
MEET_PROJECT_NAME=Google Meet
```

#### C. Example with Real Values

Here's what your `.env` should look like (with fake values for illustration):

```env
# Google Meet API Configuration
GOOGLE_CLIENT_ID=123456789-abc123def456.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-AbCdEf123456_XyZ789
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback

# Google User Configuration
GOOGLE_USER_EMAIL=john.doe@company.com

# Clockify API Configuration
CLOCKIFY_API_TOKEN=YjhkZmEwY2QtYmViNy00NjhmLWFlNjItYTcwZTBhNGQ0NDg5

# Application Configuration
NODE_ENV=development
SYNC_DAYS=30

# API Endpoints
CLOCKIFY_API_BASE=https://api.clockify.me/api

# Rate Limiting Configuration
CLOCKIFY_API_DELAY=50

# Project Configuration
MEET_PROJECT_NAME=Google Meet
```

#### D. Save the File

- In nano: Press `Ctrl+O`, then `Enter`, then `Ctrl+X`
- In vim: Press `Esc`, type `:wq`, press `Enter`
- In VS Code: Press `Cmd+S` (Mac) or `Ctrl+S` (Windows/Linux)

---

### 4. Verify Your Configuration

Run the environment validation:

```bash
cd /Users/xxx/p/meet-clockify-sync
npm install
npm typecheck
```

If everything is configured correctly, you should see:
```
✅ Environment validation successful
   Environment: development
   Sync Days: 30
```

---

## Configuration Options Explained

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID from Google Cloud Console | `123456.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret from Google Cloud Console | `GOCSPX-abc123xyz` |
| `GOOGLE_REDIRECT_URI` | OAuth redirect URI (must match Google Console) | `http://localhost:3000/oauth2callback` |
| `GOOGLE_USER_EMAIL` | Your Google Workspace email | `you@company.com` |
| `CLOCKIFY_API_TOKEN` | API token from Clockify settings | `YjhkZmEw...` |
| `CLOCKIFY_API_BASE` | Clockify API base URL | `https://api.clockify.me/api` |
| `NODE_ENV` | Environment mode | `development` or `production` |
| `SYNC_DAYS` | Number of days to sync (1-365) | `30` |
| `CLOCKIFY_API_DELAY` | Delay between API calls (ms) | `50` |
| `MEET_PROJECT_NAME` | Project name in Clockify | `Google Meet` |

### Optional Adjustments

- **SYNC_DAYS**: Increase to sync more history (max 365 days = 1 year)
  ```env
  SYNC_DAYS=90  # Sync last 3 months
  ```

- **CLOCKIFY_API_DELAY**: Increase if you hit rate limits
  ```env
  CLOCKIFY_API_DELAY=100  # Slower, but safer
  ```

- **MEET_PROJECT_NAME**: Change the Clockify project name
  ```env
  MEET_PROJECT_NAME=Meetings  # Or any name you prefer
  ```

---

## Security Best Practices

1. **Never commit `.env` to git**
   - The `.gitignore` file already excludes it
   - Double-check: `cat .gitignore | grep .env`

2. **Keep credentials secure**
   - Don't share your `.env` file
   - Don't post screenshots containing credentials
   - Regenerate tokens if accidentally exposed

3. **Use environment-specific files**
   - `.env.local` for local overrides (also gitignored)
   - `.env.production` for production deployments

---

## Troubleshooting

### "Missing required variables" Error

**Error message:**
```
❌ Environment validation failed:

Missing required variables:
  - GOOGLE_CLIENT_ID: Google Client ID is required
```

**Solution:**
- Check that you copied `.env.example` to `.env`
- Verify all variables are filled in (no `your_xxx_here` placeholders)
- Make sure there are no extra spaces around the `=` sign

### "Invalid variable values" Error

**Error message:**
```
Invalid variable values:
  - GOOGLE_REDIRECT_URI: GOOGLE_REDIRECT_URI must be a valid URL
```

**Solution:**
- Verify the redirect URI is exactly: `http://localhost:3000/oauth2callback`
- Check for typos in URLs
- Ensure email format is valid

### OAuth "Redirect URI Mismatch" Error

**Error during authentication:**
```
Error: redirect_uri_mismatch
```

**Solution:**
1. Go to Google Cloud Console → Credentials
2. Click on your OAuth client
3. Under "Authorized redirect URIs", verify it matches exactly:
   ```
   http://localhost:3000/oauth2callback
   ```
4. If different, update either your `.env` or Google Console to match

### "API not enabled" Error

**Error:**
```
Google Meet API has not been used in project xxx before or it is disabled
```

**Solution:**
1. Go to Google Cloud Console
2. Navigate to "APIs & Services" → "Library"
3. Search for "Google Meet API"
4. Click "Enable"

---

## Next Steps

After configuring your `.env` file:

1. **Run the first sync** (requires OAuth authentication):
   ```bash
   npm start
   ```

2. **Follow the authentication prompts** in the terminal

3. **Future runs** will use saved credentials:
   ```bash
   npm start
   ```

See `README.md` for full usage instructions and `SETUP.md` for detailed setup steps.
