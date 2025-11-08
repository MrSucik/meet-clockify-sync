import { type Job, Worker } from 'bullmq';
import { validateEnvironment } from '../config/env';
import { getRedisConnection } from '../config/redis';
import { SYNC_QUEUE_NAME, type SyncJobData } from '../queues/sync-queue';
import { createClockifyService } from '../services/clockify-service';
import { createGoogleMeetService } from '../services/google-meet-service';
import { formatDuration, getErrorMessage, sleep } from '../utils/common';

let worker: Worker<SyncJobData> | null = null;

/**
 * Process a sync job
 */
async function processSyncJob(job: Job<SyncJobData>) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎥 Starting sync job ${job.id}`);
  console.log(`   Triggered by: ${job.data.triggeredBy}`);
  console.log(`   Timestamp: ${job.data.timestamp}`);
  console.log(`${'='.repeat(60)}\n`);

  const env = validateEnvironment(true); // Skip dotenv since it's already loaded

  const meetService = createGoogleMeetService();
  const clockifyService = createClockifyService(env.CLOCKIFY_API_TOKEN);

  // Initialize services
  await meetService.initialize();
  await clockifyService.initialize();

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - env.SYNC_DAYS);

  console.log(
    `📅 Fetching meetings from last ${env.SYNC_DAYS} days (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})...`,
  );

  // Get meetings from Google Meet API
  const meetings = await meetService.getConferenceRecords(startDate, endDate);

  console.log(`✅ Found ${meetings.length} meeting sessions in Google Meet history`);

  if (meetings.length === 0) {
    console.log('ℹ️  No meetings found to sync');
    return {
      status: 'success',
      message: 'No meetings found',
      stats: {
        meetings_found: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
      },
    };
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
  console.log(`   - ${existingMeetEntries.length} are Google Meet entries`);

  // Sync each meeting session
  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const meeting of meetings) {
    // Check if already synced
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

    // Create description
    const meetingDisplay = meeting.meetingCode
      ? `Meet: ${meeting.meetingCode}`
      : `Google Meet (${meeting.startTime.toLocaleTimeString()})`;
    const description = `🎥 ${meetingDisplay} | ${duration.hours}h ${duration.minutes}m ${meetingIdentifier}`;

    try {
      if (env.DRY_RUN) {
        console.log(`[DRY RUN] Would sync: ${description}`);
        syncedCount++;
      } else {
        await clockifyService.createTimeEntry({
          start: meeting.startTime.toISOString(),
          end: meeting.endTime.toISOString(),
          billable: false,
          description: description,
        });

        console.log(`✅ Synced: ${description}`);
        syncedCount++;
        await sleep(env.CLOCKIFY_API_DELAY);
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      failedCount++;
      console.error(`❌ Failed to sync meeting ${meeting.meetingCode}:`, errorMessage);

      if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
        console.log('⏳ Rate limit hit, waiting 200ms...');
        await sleep(200);
      }
    }
  }

  const result = {
    status: 'success' as const,
    message: 'Sync completed',
    stats: {
      meetings_found: meetings.length,
      synced: syncedCount,
      skipped: skippedCount,
      failed: failedCount,
      total_in_clockify: existingMeetEntries.length + syncedCount,
    },
    dry_run: env.DRY_RUN,
  };

  console.log('\n✅ Sync complete:');
  console.log(`   Meetings found: ${result.stats.meetings_found}`);
  console.log(`   Synced: ${result.stats.synced}`);
  console.log(`   Skipped: ${result.stats.skipped}`);
  console.log(`   Failed: ${result.stats.failed}`);
  console.log(`   Total in Clockify: ${result.stats.total_in_clockify}`);
  if (result.dry_run) {
    console.log('   🔍 DRY RUN MODE - No actual changes made');
  }
  console.log('');

  return result;
}

/**
 * Creates the sync worker
 */
export function createSyncWorker(): Worker<SyncJobData> {
  if (worker) {
    return worker;
  }

  const connection = getRedisConnection();

  worker = new Worker<SyncJobData>(
    SYNC_QUEUE_NAME,
    async (job: Job<SyncJobData>) => await processSyncJob(job),
    {
      connection,
      concurrency: 1, // Process one job at a time
    },
  );

  worker.on('completed', (job: Job<SyncJobData>) => {
    console.log(`✅ Worker: Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job: Job<SyncJobData> | undefined, error: Error) => {
    console.error(`❌ Worker: Job ${job?.id} failed:`, error.message);
  });

  worker.on('error', (error: Error) => {
    console.error('❌ Worker error:', error);
  });

  console.log('✅ Sync worker initialized');

  return worker;
}

/**
 * Closes the sync worker
 */
export async function closeSyncWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('✅ Sync worker closed');
  }
}
