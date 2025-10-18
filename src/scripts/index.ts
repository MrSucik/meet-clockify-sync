import * as cliProgress from 'cli-progress';
import { validateEnvironment } from '../config/env';
import { createClockifyService } from '../services/clockify-service';
import { createGoogleMeetService } from '../services/google-meet-service';
import { formatDuration, getErrorMessage, isApiError, sleep } from '../utils/common';

// Validate environment on startup
const env = validateEnvironment();

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
      const meetingIdentifier = `[Meet:${meeting.meetingId}:${meeting.startTime.toISOString()}]`;
      const alreadySynced = existingEntries.some((entry) =>
        entry.description.includes(meetingIdentifier),
      );

      if (alreadySynced) {
        skippedCount++;
        continue;
      }

      // Format meeting duration
      const duration = formatDuration(meeting.duration);

      // Create description
      const meetingCodeDisplay = meeting.meetingCode ? `Code: ${meeting.meetingCode}` : 'Meeting';
      const description = `🎥 ${meetingCodeDisplay} | ${duration.hours}h ${duration.minutes}m ${meetingIdentifier}`;

      try {
        await clockifyService.createTimeEntry({
          start: meeting.startTime.toISOString(),
          end: meeting.endTime.toISOString(),
          billable: false,
          description: description,
        });

        syncedCount++;

        // Add delay to avoid rate limiting
        await sleep(env.CLOCKIFY_API_DELAY);
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

    console.log(`\n🎉 Sync complete!`);
    console.log(`   - Google Meet sessions found: ${meetings.length}`);
    console.log(`   - Newly synced: ${syncedCount}`);
    console.log(`   - Already existed: ${skippedCount}`);
    console.log(`   - Failed: ${failedCount}`);
    console.log(
      `   - Total in Clockify now: ${existingMeetEntries.length + syncedCount} meeting entries`,
    );
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

  await syncMeetToClockify(meetService, clockifyService);
}

// Run the main function
main().catch(console.error);
