import * as readline from 'node:readline';
import * as cliProgress from 'cli-progress';
import { validateEnvironment } from '../config/env';
import { createClockifyService } from '../services/clockify-service';
import { createGoogleMeetService } from '../services/google-meet-service';
import { formatDuration, getErrorMessage, isApiError, sleep } from '../utils/common';

// Validate environment on startup
const env = validateEnvironment();

/**
 * Prompt user for input
 */
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Handle Google OAuth authentication flow
 */
async function handleAuthentication(
  meetService: ReturnType<typeof createGoogleMeetService>,
): Promise<void> {
  console.log('🔐 First-time authentication required\n');
  console.log('Please follow these steps to authenticate:\n');

  const authUrl = meetService.getAuthUrl();
  console.log('1. Visit this URL to authenticate:');
  console.log(`   ${authUrl}\n`);
  console.log('2. Sign in with your Google Workspace account');
  console.log('3. Grant the requested permissions');
  console.log('4. You will be redirected to: http://localhost:3000/oauth2callback?code=...');
  console.log('   (The page will show an error - that is expected)\n');
  console.log('5. Copy the ENTIRE URL from your browser address bar\n');

  const redirectUrl = await promptUser('Paste the redirect URL here: ');

  // Extract the code from the URL
  const urlMatch = redirectUrl.match(/code=([^&]+)/);
  if (!urlMatch) {
    throw new Error('Invalid redirect URL. Could not find authorization code.');
  }

  const code = urlMatch[1];
  console.log('\n🔑 Saving credentials...');

  await meetService.saveCredentialsFromCode(code);
  console.log('✅ Authentication successful! Credentials saved to token.json\n');
}

/**
 * Sync Google Meet sessions to Clockify
 */
async function syncMeetToClockify(
  meetService: ReturnType<typeof createGoogleMeetService>,
  clockifyService: ReturnType<typeof createClockifyService>,
): Promise<void> {
  try {
    console.log('🎥 Starting Google Meet to Clockify sync...\n');

    // Initialize services
    await meetService.initialize();
    await clockifyService.initialize();

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - env.SYNC_DAYS);

    console.log(
      `📅 Fetching meetings from last ${env.SYNC_DAYS} days (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})...\n`,
    );

    // Get meetings from Google Meet API
    const meetings = await meetService.getConferenceRecords(startDate, endDate);

    console.log(`✅ Found ${meetings.length} meeting sessions in Google Meet history\n`);

    if (meetings.length === 0) {
      console.log('No meetings found. Exiting...');
      return;
    }

    // Get existing Clockify entries
    const existingEntries = await clockifyService.getTimeEntriesForDateRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
    );

    const existingMeetEntries = existingEntries.filter((entry) =>
      entry.description.includes('[Meet:'),
    );

    console.log(`📊 Found ${existingEntries.length} existing time entries in Clockify`);
    console.log(`   - ${existingMeetEntries.length} are Google Meet entries\n`);

    // Check dry run mode
    if (env.DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No entries will be created\n');
    }

    // Sync each meeting session
    let syncedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    console.log('📊 Processing meetings...\n');

    // Create progress bar
    const progressBar = new cliProgress.SingleBar({
      format: '⏳ Progress |{bar}| {percentage}% | {value}/{total} Sessions',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    });

    progressBar.start(meetings.length, 0);

    for (let i = 0; i < meetings.length; i++) {
      const meeting = meetings[i];

      progressBar.update(i + 1);

      // Check if already synced (using meeting ID as unique identifier)
      // Note: We only use meetingId now since we aggregate all sessions per conference
      const meetingIdentifier = `[Meet:${meeting.meetingId}]`;
      const alreadySynced = existingEntries.some((entry) =>
        entry.description.includes(meetingIdentifier),
      );

      if (alreadySynced) {
        skippedCount++;
        continue;
      }

      // Format meeting duration
      const duration = formatDuration(meeting.duration);

      // Create description with meeting code or fallback to meeting time
      const meetingDisplay = meeting.meetingCode
        ? `Meet: ${meeting.meetingCode}`
        : `Google Meet (${meeting.startTime.toLocaleTimeString()})`;
      const description = `🎥 ${meetingDisplay} | ${duration.hours}h ${duration.minutes}m ${meetingIdentifier}`;

      try {
        if (env.DRY_RUN) {
          // In dry run mode, just log what would be created
          syncedCount++;
        } else {
          await clockifyService.createTimeEntry({
            start: meeting.startTime.toISOString(),
            end: meeting.endTime.toISOString(),
            billable: false,
            description: description,
          });

          syncedCount++;

          // Add delay to avoid rate limiting
          await sleep(env.CLOCKIFY_API_DELAY);
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        failedCount++;

        // If we hit rate limit, wait longer
        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
          await sleep(200);
        }
      }
    }

    // Stop progress bar
    progressBar.stop();

    if (env.DRY_RUN) {
      console.log(`\n🔍 DRY RUN Complete - No changes were made!`);
      console.log(`   - Google Meet sessions found: ${meetings.length}`);
      console.log(`   - Would be created: ${syncedCount}`);
      console.log(`   - Already exist: ${skippedCount}`);
      console.log(`   - Would fail: ${failedCount}`);
      console.log(`   - Current total in Clockify: ${existingMeetEntries.length} meeting entries`);
      console.log(`\n💡 Set DRY_RUN=false in .env to actually create entries`);
    } else {
      console.log(`\n🎉 Sync complete!`);
      console.log(`   - Google Meet sessions found: ${meetings.length}`);
      console.log(`   - Newly synced: ${syncedCount}`);
      console.log(`   - Already existed: ${skippedCount}`);
      console.log(`   - Failed: ${failedCount}`);
      console.log(
        `   - Total in Clockify now: ${existingMeetEntries.length + syncedCount} meeting entries`,
      );
    }
  } catch (error: unknown) {
    console.error('\n❌ Sync failed:');

    if (isApiError(error)) {
      console.error('Status:', error.status);
      const errorData = error.data as Record<string, unknown>;
      console.error('Error:', errorData?.detail || error.statusText);
    } else {
      console.error('Error:', getErrorMessage(error));
    }
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🎥 Google Meet → Clockify Sync\n');
  console.log(
    'This tool will sync your Google Meet attendance history to Clockify as time entries.\n',
  );

  const meetService = createGoogleMeetService();
  const clockifyService = createClockifyService(env.CLOCKIFY_API_TOKEN);

  try {
    await syncMeetToClockify(meetService, clockifyService);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);

    // Check if this is an authentication error
    if (errorMessage.includes('No saved credentials found')) {
      try {
        await handleAuthentication(meetService);
        // Retry the sync after authentication
        await syncMeetToClockify(meetService, clockifyService);
      } catch (authError: unknown) {
        console.error('\n❌ Authentication failed:');
        console.error('Error:', getErrorMessage(authError));
        throw authError;
      }
    } else {
      // Re-throw other errors
      throw error;
    }
  }
}

// Run the main function
main().catch(console.error);
