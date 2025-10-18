# Google Meet to Clockify Sync

Automatically sync your Google Meet attendance history to Clockify as time entries.

## Features

- Syncs your actual Google Meet attendance times (when you joined/left meetings)
- Uses Google Meet REST API to get precise participant session data
- Automatically tracks multiple join/rejoin sessions per meeting
- Prevents duplicate entries in Clockify
- Configurable date range for syncing
- Progress tracking with visual progress bar

## Prerequisites

- **Google Workspace Business Plus or higher** (Google Meet API is not available on free accounts)
- Node.js 18 or higher
- npm (or npm/yarn)
- Clockify account
- Google Cloud Console project with Meet API enabled

## Setup

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Meet REST API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Meet API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URIs: `http://localhost:3000/oauth2callback`
   - Save your Client ID and Client Secret

### 2. Clockify Setup

1. Go to [Clockify Settings](https://app.clockify.me/user/settings)
2. Generate an API key
3. Copy the API key

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Fill in your credentials:

```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_USER_EMAIL=your.email@gmail.com
CLOCKIFY_API_TOKEN=your_clockify_token
```

### 5. Authenticate with Google

On first run, you'll need to authenticate:

1. Run the sync:
   ```bash
   npm start
   ```

2. The app will display an authorization URL
3. Open the URL in your browser
4. Grant permissions
5. Copy the authorization code from the redirect URL
6. Paste it into the terminal

The credentials will be saved to `token.json` for future use.

## Usage

### Basic Sync

Sync meetings from the last 30 days (default):

```bash
npm start
```

### Custom Date Range

Edit `SYNC_DAYS` in `.env`:

```env
SYNC_DAYS=90  # Last 90 days
```

## How It Works

1. **Fetches Conference Records**: Queries Google Meet API for meetings within the date range
2. **Gets Participant Sessions**: For each meeting, retrieves your specific join/leave sessions
3. **Calculates Duration**: Computes actual time spent in each meeting
4. **Syncs to Clockify**: Creates time entries with meeting details
5. **Avoids Duplicates**: Checks existing entries to prevent re-syncing

## Data Synced

Each time entry in Clockify includes:

- **Start Time**: When you joined the meeting
- **End Time**: When you left the meeting
- **Duration**: Actual time spent in the meeting
- **Description**: Meeting code and duration
- **Project**: "Google Meet" (auto-created)

Example entry:
```
🎥 Code: abc-defg-hij | 1h 30m [Meet:conferenceRecords/xxx:2025-10-18T10:00:00Z]
```

## API Limits

### Google Meet API

- **Quota**: 500 queries per day per project (default)
- **Rate Limit**: 10 queries per second
- The sync script includes automatic rate limiting and pagination

### Clockify API

- **Rate Limit**: Varies by plan
- The script includes configurable delays (`CLOCKIFY_API_DELAY` in ms)

## Limitations

- **Google Workspace Required**: Google Meet API requires Business Plus or higher
- **Past Data**: Can only access meetings that occurred after API was enabled
- **Participant Data**: Only shows your own attendance (not other participants)
- **Meeting Names**: API doesn't provide custom meeting names, only meeting codes

## Troubleshooting

### "No saved credentials found"

Run the authentication flow by starting the app and following the OAuth prompts.

### "API not enabled"

Make sure you've enabled the Google Meet API in Google Cloud Console.

### "Insufficient permissions"

Ensure you have Google Workspace Business Plus or higher.

### "Rate limit exceeded"

Increase `CLOCKIFY_API_DELAY` in `.env` or reduce `SYNC_DAYS`.

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

## Project Structure

```
meet-clockify-sync/
├── src/
│   ├── config/
│   │   └── env.ts              # Environment validation
│   ├── services/
│   │   ├── clockify-service.ts # Clockify API client
│   │   └── google-meet-service.ts # Google Meet API client
│   ├── scripts/
│   │   └── index.ts            # Main sync script
│   ├── types/
│   │   ├── clockify.ts         # Clockify types
│   │   └── google-meet.ts      # Google Meet types
│   └── utils/
│       └── common.ts           # Utility functions
├── .env.example
├── package.json
└── README.md
```

## License

ISC
