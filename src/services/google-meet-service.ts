import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { getEnvironment } from '../config/env';
import type { MeetingSession, ParticipantSession } from '../types/google-meet';
import { sleep } from '../utils/common';

interface GoogleMeetState {
  env: ReturnType<typeof getEnvironment>;
  auth: OAuth2Client | null;
  tokenPath: string;
}

const SCOPES = [
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function createGoogleMeetService() {
  const state: GoogleMeetState = {
    env: getEnvironment(),
    auth: null,
    tokenPath: path.join(process.cwd(), 'token.json'),
  };

  /**
   * Initialize OAuth2 client
   */
  const initializeAuth = async (): Promise<OAuth2Client> => {
    const oauth2Client = new google.auth.OAuth2(
      state.env.GOOGLE_CLIENT_ID,
      state.env.GOOGLE_CLIENT_SECRET,
      state.env.GOOGLE_REDIRECT_URI,
    );

    // Try to load saved credentials
    try {
      const tokenData = await fs.readFile(state.tokenPath, 'utf-8');
      const token = JSON.parse(tokenData);
      oauth2Client.setCredentials(token);
      state.auth = oauth2Client;
      return oauth2Client;
    } catch (_error) {
      throw new Error(
        'No saved credentials found. Please run the authentication flow first. ' +
          'See README for instructions.',
      );
    }
  };

  /**
   * Get authorization URL for OAuth flow
   */
  const getAuthUrl = (): string => {
    const oauth2Client = new google.auth.OAuth2(
      state.env.GOOGLE_CLIENT_ID,
      state.env.GOOGLE_CLIENT_SECRET,
      state.env.GOOGLE_REDIRECT_URI,
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
  };

  /**
   * Save credentials from auth code
   */
  const saveCredentialsFromCode = async (code: string): Promise<void> => {
    const oauth2Client = new google.auth.OAuth2(
      state.env.GOOGLE_CLIENT_ID,
      state.env.GOOGLE_CLIENT_SECRET,
      state.env.GOOGLE_REDIRECT_URI,
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    await fs.writeFile(state.tokenPath, JSON.stringify(tokens));
    state.auth = oauth2Client;
  };

  /**
   * Get conference records within date range
   */
  const getConferenceRecords = async (
    startDate: Date,
    endDate: Date,
  ): Promise<MeetingSession[]> => {
    if (!state.auth) {
      await initializeAuth();
    }

    const meet = google.meet({ version: 'v2', auth: state.auth as OAuth2Client });
    const meetings: MeetingSession[] = [];

    try {
      let pageToken: string | undefined;

      do {
        const response = await meet.conferenceRecords.list({
          pageSize: 100,
          pageToken,
          filter: `end_time>="${startDate.toISOString()}" AND start_time<="${endDate.toISOString()}"`,
        });

        if (response.data.conferenceRecords) {
          for (const record of response.data.conferenceRecords) {
            if (!record.name || !record.startTime) continue;

            // Get participant sessions for this conference
            const sessions = await getParticipantSessionsForConference(record.name);

            // Filter for the user's sessions
            const userSessions = sessions.filter((_session) => {
              // We'll need to match based on the user's email or participant ID
              // This is simplified - you may need to adjust based on actual API response
              return true; // For now, include all sessions
            });

            // Process each user session
            for (const session of userSessions) {
              if (!session.startTime || !session.endTime) continue;

              const sessionStart = new Date(session.startTime);
              const sessionEnd = new Date(session.endTime);
              const duration = Math.floor((sessionEnd.getTime() - sessionStart.getTime()) / 1000);

              // biome-ignore lint/suspicious/noExplicitAny: Google API types are incomplete
              const space = record.space as any;
              meetings.push({
                meetingId: record.name,
                meetingCode: space?.meetingCode || '',
                meetingUri: space?.meetingUri || '',
                startTime: sessionStart,
                endTime: sessionEnd,
                duration,
              });
            }
          }
        }

        pageToken = response.data.nextPageToken || undefined;

        // Small delay to avoid rate limiting
        if (pageToken) {
          await sleep(100);
        }
      } while (pageToken);
      // biome-ignore lint/suspicious/noExplicitAny: Error handling requires any
    } catch (error: any) {
      console.error('Error fetching conference records:', error.message);
      throw error;
    }

    return meetings;
  };

  /**
   * Get participant sessions for a specific conference
   */
  const getParticipantSessionsForConference = async (
    conferenceName: string,
  ): Promise<ParticipantSession[]> => {
    if (!state.auth) {
      await initializeAuth();
    }

    const meet = google.meet({ version: 'v2', auth: state.auth as OAuth2Client });
    const sessions: ParticipantSession[] = [];

    try {
      // First get participants
      const participantsResponse = await meet.conferenceRecords.participants.list({
        parent: conferenceName,
        pageSize: 100,
      });

      if (participantsResponse.data.participants) {
        for (const participant of participantsResponse.data.participants) {
          if (!participant.name) continue;

          // Get sessions for this participant
          const sessionsResponse =
            await meet.conferenceRecords.participants.participantSessions.list({
              parent: participant.name,
              pageSize: 100,
            });

          if (sessionsResponse.data.participantSessions) {
            for (const session of sessionsResponse.data.participantSessions) {
              if (session.name && session.startTime) {
                sessions.push({
                  name: session.name,
                  startTime: session.startTime,
                  endTime: session.endTime || null,
                });
              }
            }
          }

          await sleep(50); // Small delay between requests
        }
      }
      // biome-ignore lint/suspicious/noExplicitAny: Error handling requires any
    } catch (error: any) {
      console.error('Error fetching participant sessions:', error.message);
      throw error;
    }

    return sessions;
  };

  /**
   * Initialize the service
   */
  const initialize = async (): Promise<void> => {
    await initializeAuth();
    console.log('✅ Google Meet API initialized');
  };

  return {
    initialize,
    getAuthUrl,
    saveCredentialsFromCode,
    getConferenceRecords,
  };
}
