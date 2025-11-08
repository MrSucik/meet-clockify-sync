import * as readline from 'node:readline';
import { validateEnvironment } from '../config/env';
import { createClockifyService } from '../services/clockify-service';

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
 * Delete a time entry from Clockify
 */
async function deleteTimeEntry(
  workspaceId: string,
  entryId: string,
  apiToken: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${env.CLOCKIFY_API_BASE}/v1/workspaces/${workspaceId}/time-entries/${entryId}`,
      {
        method: 'DELETE',
        headers: {
          'X-Api-Key': apiToken,
        },
      },
    );

    return response.ok;
  } catch (error) {
    console.error(`Failed to delete entry ${entryId}:`, error);
    return false;
  }
}

async function cleanupGoogleMeetEntries() {
  console.log('🧹 Google Meet Entries Cleanup Script\n');
  console.log('⚠️  WARNING: This will delete time entries from Clockify!\n');
  console.log('This script will ONLY delete entries that:');
  console.log('  1. Belong to the "Google Meet" project');
  console.log('  2. Have descriptions containing "[Meet:" tag\n');

  const clockifyService = createClockifyService(env.CLOCKIFY_API_TOKEN);
  await clockifyService.initialize();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - env.SYNC_DAYS);

  console.log(
    `\n📅 Scanning date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n`,
  );

  const allEntries = await clockifyService.getTimeEntriesForDateRange(
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0],
  );

  const meetEntries = allEntries.filter((entry) => entry.description.includes('[Meet:'));

  console.log(`📊 Total time entries in date range: ${allEntries.length}`);
  console.log(`📊 Google Meet entries found: ${meetEntries.length}`);
  console.log(`📊 Other entries (SAFE): ${allEntries.length - meetEntries.length}\n`);

  if (meetEntries.length === 0) {
    console.log('✅ No Google Meet entries found. Nothing to delete.');
    return;
  }

  console.log('🎥 Google Meet entries that will be deleted:\n');

  // Show preview of entries to be deleted
  for (let i = 0; i < Math.min(10, meetEntries.length); i++) {
    const entry = meetEntries[i];
    const start = new Date(entry.timeInterval.start);
    const end = entry.timeInterval.end ? new Date(entry.timeInterval.end) : null;
    const duration = end ? Math.round((end.getTime() - start.getTime()) / 1000 / 60) : 'ongoing';
    console.log(`  ${i + 1}. ${start.toLocaleDateString()} ${start.toLocaleTimeString()}`);
    console.log(`     Duration: ${duration} minutes`);
    console.log(`     Description: ${entry.description.substring(0, 80)}...`);
    console.log('');
  }

  if (meetEntries.length > 10) {
    console.log(`  ... and ${meetEntries.length - 10} more entries\n`);
  }

  console.log('⚠️  CONFIRMATION REQUIRED\n');
  console.log(`You are about to delete ${meetEntries.length} Google Meet entries.`);
  console.log(
    `Your other ${allEntries.length - meetEntries.length} entries will NOT be touched.\n`,
  );

  const confirmation1 = await promptUser(
    `Type the number of entries to delete (${meetEntries.length}) to continue: `,
  );

  if (confirmation1 !== meetEntries.length.toString()) {
    console.log('\n❌ Confirmation failed. Aborting cleanup.');
    return;
  }

  const confirmation2 = await promptUser('\nType "DELETE GOOGLE MEET ENTRIES" to proceed: ');

  if (confirmation2 !== 'DELETE GOOGLE MEET ENTRIES') {
    console.log('\n❌ Confirmation failed. Aborting cleanup.');
    return;
  }

  console.log('\n🗑️  Starting deletion process...\n');

  let deletedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < meetEntries.length; i++) {
    const entry = meetEntries[i];
    const success = await deleteTimeEntry(entry.workspaceId, entry.id, env.CLOCKIFY_API_TOKEN);

    if (success) {
      deletedCount++;
      process.stdout.write(`\r✅ Deleted: ${deletedCount}/${meetEntries.length}`);
    } else {
      failedCount++;
      console.log(`\n❌ Failed to delete entry: ${entry.id}`);
    }

    // Add delay to avoid rate limiting
    if (i < meetEntries.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, env.CLOCKIFY_API_DELAY));
    }
  }

  console.log('\n\n✅ Cleanup complete!');
  console.log(`   - Successfully deleted: ${deletedCount}`);
  console.log(`   - Failed: ${failedCount}`);
  console.log(`   - Remaining entries: ${allEntries.length - deletedCount}`);

  // Verify cleanup
  console.log('\n🔍 Verifying cleanup...');
  const verifyEntries = await clockifyService.getTimeEntriesForDateRange(
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0],
  );

  const remainingMeetEntries = verifyEntries.filter((entry) =>
    entry.description.includes('[Meet:'),
  );

  if (remainingMeetEntries.length === 0) {
    console.log('✅ All Google Meet entries have been removed!');
  } else {
    console.log(`⚠️  ${remainingMeetEntries.length} Google Meet entries still remain.`);
  }

  console.log(
    `✅ Your other ${verifyEntries.length - remainingMeetEntries.length} entries are intact.\n`,
  );
}

cleanupGoogleMeetEntries().catch((error) => {
  console.error('\n❌ Cleanup failed:', error);
  process.exit(1);
});
