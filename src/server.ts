import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { validateEnvironment } from './config/env';
import { createClockifyService } from './services/clockify-service';
import { createGoogleMeetService } from './services/google-meet-service';
import { formatDuration, getErrorMessage, sleep } from './utils/common';

const app = new Hono();

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'meet-clockify-sync',
    version: '1.0.0',
  });
});

// Health endpoint
app.get('/health', (c) => {
  return c.json({ status: 'healthy' });
});

// Sync endpoint for cron
app.post('/sync', async (c) => {
  try {
    const env = validateEnvironment();

    console.log('🎥 Starting sync via HTTP endpoint...');

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
      return c.json({
        status: 'success',
        message: 'No meetings found',
        stats: {
          meetings_found: 0,
          synced: 0,
          skipped: 0,
          failed: 0,
        },
      });
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
          syncedCount++;
        } else {
          await clockifyService.createTimeEntry({
            start: meeting.startTime.toISOString(),
            end: meeting.endTime.toISOString(),
            billable: false,
            description: description,
          });

          syncedCount++;
          await sleep(env.CLOCKIFY_API_DELAY);
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        failedCount++;
        console.error(`Failed to sync meeting ${meeting.meetingCode}:`, errorMessage);

        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
          await sleep(200);
        }
      }
    }

    const result = {
      status: 'success',
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

    console.log('✅ Sync complete:', result);

    return c.json(result);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('❌ Sync failed:', errorMessage);

    return c.json(
      {
        status: 'error',
        message: errorMessage,
      },
      500,
    );
  }
});

const port = Number(process.env.PORT) || 3000;

console.log(`🚀 Server running on http://localhost:${port}`);
console.log(`📍 Endpoints:`);
console.log(`   GET  /         - Service info`);
console.log(`   GET  /health   - Health check`);
console.log(`   POST /sync     - Trigger sync (use this for cron)`);

serve({
  fetch: app.fetch,
  port,
});
