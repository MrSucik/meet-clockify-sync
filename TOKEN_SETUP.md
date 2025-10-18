# Production Token Setup Guide

This guide explains how to handle `token.json` in production (Coolify) since it's not committed to git and requires OAuth authentication.

## The Problem

- `token.json` is generated locally via OAuth flow (requires browser)
- It's in `.gitignore` (never committed)
- Production (Coolify) needs this file to authenticate with Google
- You can't run interactive OAuth in production

## Solutions

### Option 1: Persistent Volume (Recommended) ⭐

Mount `token.json` as a persistent volume in Coolify.

**Steps:**

1. **Generate token locally:**
   ```bash
   npm start
   # Follow OAuth prompts in browser
   # token.json will be created
   ```

2. **In Coolify Dashboard:**
   - Go to your service → **Storage**
   - Click **"Add Volume"**
   - **Type:** File
   - **Source (on host):** Create/upload your `token.json`
   - **Destination (in container):** `/app/token.json`
   - **Read Only:** No (needs write access for token refresh)

3. **Alternative - Manual file creation:**
   ```bash
   # On Coolify host machine
   mkdir -p /data/meet-clockify-sync
   # Copy your local token.json to:
   cp token.json /data/meet-clockify-sync/token.json
   ```

   Then in Coolify:
   - **Source:** `/data/meet-clockify-sync/token.json`
   - **Destination:** `/app/token.json`

**Pros:**
- ✅ Simple and straightforward
- ✅ Token persists across deployments
- ✅ Automatic token refresh works (file is writable)
- ✅ No code changes needed

**Cons:**
- ⚠️ Manual file upload required
- ⚠️ Need access to Coolify host filesystem

---

### Option 2: Environment Variable (Base64 Encoded)

Store `token.json` content as an environment variable.

**Steps:**

1. **Encode token locally:**
   ```bash
   cat token.json | base64
   # Copy the output
   ```

2. **In Coolify:**
   - Add environment variable: `GOOGLE_TOKEN_BASE64`
   - Paste the base64 string

3. **Update code to decode on startup:**

   Create `src/utils/token-loader.ts`:
   ```typescript
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';

   export async function loadTokenFromEnv(): Promise<void> {
     const tokenBase64 = process.env.GOOGLE_TOKEN_BASE64;

     if (tokenBase64) {
       const tokenJson = Buffer.from(tokenBase64, 'base64').toString('utf-8');
       const tokenPath = path.join(process.cwd(), 'token.json');
       await fs.writeFile(tokenPath, tokenJson);
       console.log('✅ Token loaded from environment variable');
     }
   }
   ```

4. **Update `src/server.ts`:**
   ```typescript
   import { loadTokenFromEnv } from './utils/token-loader';

   // Add at the top, before serve()
   await loadTokenFromEnv();

   serve({ fetch: app.fetch, port });
   ```

**Pros:**
- ✅ No volume management needed
- ✅ Easy to update via Coolify UI
- ✅ Works with any Coolify setup

**Cons:**
- ⚠️ Token updates (from refresh) won't persist
- ⚠️ Requires code changes
- ⚠️ Less secure (env vars can be logged)

---

### Option 3: Build Token into Docker Image

Include `token.json` in the Docker image (not recommended for security).

**Steps:**

1. **Create `.dockerignore.prod`:**
   ```
   node_modules
   npm-debug.log
   .env
   .env.example
   *.md
   .git
   .gitignore
   *.log
   dist
   coverage
   .DS_Store
   # DON'T ignore token.json for production build
   ```

2. **Build locally with token:**
   ```bash
   docker build -t meet-clockify-sync:latest .
   docker push your-registry/meet-clockify-sync:latest
   ```

3. **In Coolify:**
   - Use your custom image instead of building from git

**Pros:**
- ✅ No manual file management

**Cons:**
- ❌ Token in Docker image (security risk)
- ❌ Manual rebuild when token expires
- ❌ Token updates won't persist
- ❌ Not recommended

---

### Option 4: Remote Token Storage (Advanced)

Store token in a secret management service.

**Examples:**
- AWS Secrets Manager
- Google Cloud Secret Manager
- HashiCorp Vault
- Coolify's built-in secrets (if available)

**Too complex for this use case.**

---

## Recommended Solution: Option 1 (Persistent Volume)

Here's the complete workflow:

### Initial Setup

1. **Locally, authenticate once:**
   ```bash
   git clone your-repo
   cd meet-clockify-sync
   npm install
   cp .env.example .env
   # Fill in .env with your credentials
   npm start
   # Complete OAuth flow in browser
   # token.json is now created
   ```

2. **Copy token.json content:**
   ```bash
   cat token.json
   # Copy the entire JSON output
   ```

3. **In Coolify:**

   **Option A - Via Coolify UI:**
   - Navigate to: Service → Storage → Add Volume
   - Create a new file volume
   - Paste the token.json content
   - Mount to: `/app/token.json`

   **Option B - Via SSH to Coolify host:**
   ```bash
   # SSH to your Coolify server
   ssh your-coolify-server

   # Create directory for persistent data
   mkdir -p /data/meet-clockify-sync

   # Create token.json with your content
   nano /data/meet-clockify-sync/token.json
   # Paste your token content, save and exit

   # Set permissions
   chmod 600 /data/meet-clockify-sync/token.json
   ```

   Then in Coolify UI:
   - Add Volume
   - Source: `/data/meet-clockify-sync/token.json`
   - Destination: `/app/token.json`
   - Read Only: ❌ (unchecked - needs write access)

4. **Deploy your service**

5. **Verify it works:**
   ```bash
   curl https://your-app.coolify.domain/health
   curl -X POST https://your-app.coolify.domain/sync
   ```

### Token Refresh

The token will automatically refresh! Here's how:

1. Google access token expires every hour
2. The code automatically uses refresh token to get new access token
3. New tokens are written back to `/app/token.json`
4. Because it's a persistent volume, changes are saved
5. Next restart will use the refreshed token

### When Token Expires (After 6 Months of No Use)

If you don't use the sync for 6 months, refresh token expires:

1. **Re-authenticate locally:**
   ```bash
   rm token.json
   npm start
   # Complete OAuth flow
   ```

2. **Update in Coolify:**
   ```bash
   # SSH to Coolify server
   cat > /data/meet-clockify-sync/token.json << 'EOF'
   {your new token content here}
   EOF
   ```

3. **Restart service in Coolify**

---

## Testing in Production

After setup, test the endpoints:

```bash
# Check health
curl https://your-app.coolify.domain/health

# Test sync (should work without errors)
curl -X POST https://your-app.coolify.domain/sync

# Check logs in Coolify
# Should see: ✅ Google Meet API initialized
```

---

## Troubleshooting

### "No saved credentials found"

**Cause:** `token.json` not mounted or path is wrong

**Fix:**
```bash
# In Coolify, check volume mounting
# Destination should be: /app/token.json

# Or check container logs to see what path it's looking for
```

### "Token refresh failed"

**Cause:** Volume is read-only or no write permissions

**Fix:**
- Ensure volume is NOT read-only
- Check file permissions if using host path

### "Invalid grant" error

**Cause:** Refresh token expired (6 months of no use)

**Fix:** Re-authenticate locally and update token in Coolify

---

## Security Best Practices

1. ✅ Never commit `token.json` to git (already in `.gitignore`)
2. ✅ Use persistent volume (Option 1) instead of env vars
3. ✅ Set restrictive file permissions: `chmod 600`
4. ✅ Regularly backup your token.json
5. ✅ Monitor token expiration (run sync at least every 6 months)
6. ✅ Use Coolify's secrets management if available
7. ✅ Enable HTTPS on your Coolify domain

---

## Quick Reference

```bash
# Generate token locally
npm start

# View token
cat token.json

# Base64 encode (for Option 2)
cat token.json | base64

# Copy to Coolify server (for Option 1)
scp token.json user@coolify-server:/data/meet-clockify-sync/

# Test in production
curl -X POST https://your-app.coolify.domain/sync
```
