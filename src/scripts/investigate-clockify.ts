import { validateEnvironment } from '../config/env';
import { createClockifyService } from '../services/clockify-service';

const env = validateEnvironment();

async function investigateClockify() {
  console.log('🔍 Investigating Clockify entries from last 7 days...\n');

  const clockifyService = createClockifyService(env.CLOCKIFY_API_TOKEN);
  await clockifyService.initialize();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  console.log(
    `📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n`,
  );

  const entries = await clockifyService.getTimeEntriesForDateRange(
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0],
  );

  const meetEntries = entries.filter((entry) => entry.description.includes('[Meet:'));

  console.log(`📊 Total time entries: ${entries.length}`);
  console.log(`📊 Google Meet entries: ${meetEntries.length}\n`);

  if (meetEntries.length > 0) {
    console.log('🎥 Google Meet entries:\n');

    // Group by meeting identifier
    const groupedByMeeting = new Map<string, typeof meetEntries>();

    for (const entry of meetEntries) {
      const match = entry.description.match(/\[Meet:([^\]]+)\]/);
      if (match) {
        const meetingId = match[1];
        if (!groupedByMeeting.has(meetingId)) {
          groupedByMeeting.set(meetingId, []);
        }
        groupedByMeeting.get(meetingId)?.push(entry);
      }
    }

    console.log(`📊 Unique meetings: ${groupedByMeeting.size}`);
    console.log(`📊 Duplicate entries: ${meetEntries.length - groupedByMeeting.size}\n`);

    if (meetEntries.length - groupedByMeeting.size > 0) {
      console.log('⚠️  DUPLICATES FOUND:\n');
      for (const [meetingId, duplicates] of groupedByMeeting.entries()) {
        if (duplicates.length > 1) {
          console.log(`Meeting ID: ${meetingId} (${duplicates.length} entries)`);
          for (const entry of duplicates) {
            const start = new Date(entry.timeInterval.start);
            const end = entry.timeInterval.end ? new Date(entry.timeInterval.end) : null;
            const duration = end
              ? Math.round((end.getTime() - start.getTime()) / 1000 / 60)
              : 'ongoing';
            console.log(
              `  - ${start.toISOString()} | ${duration}min | ID: ${entry.id.substring(0, 8)}...`,
            );
            console.log(`    Description: ${entry.description}`);
          }
          console.log('');
        }
      }
    }

    console.log('\n📋 All Meet entries:');
    for (const entry of meetEntries) {
      const start = new Date(entry.timeInterval.start);
      const end = entry.timeInterval.end ? new Date(entry.timeInterval.end) : null;
      const duration = end ? Math.round((end.getTime() - start.getTime()) / 1000 / 60) : 'ongoing';
      console.log(`\n  ${start.toLocaleDateString()} ${start.toLocaleTimeString()}`);
      console.log(`  Duration: ${duration} minutes`);
      console.log(`  Description: ${entry.description}`);
      console.log(`  ID: ${entry.id}`);
    }
  } else {
    console.log('No Google Meet entries found in the last 7 days.');
  }
}

investigateClockify().catch(console.error);
