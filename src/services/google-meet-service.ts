import type { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { getEnvironment } from '../config/env';
import type { MeetingSession, ParticipantSession } from '../types/google-meet';
import { sleep } from '../utils/common';
import { loadTokens, saveTokens, type TokenData } from '../utils/token-storage';

interface GoogleMeetState {
  env: ReturnType<typeof getEnvironment>;
  auth: OAuth2Client | null;
}

const SCOPES = [
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function createGoogleMeetService() {
  const state: GoogleMeetState = {
    env: getEnvironment(),
    auth: null,
  };

  /**
   * Convert token data from database format to OAuth2 format
   */
  const convertTokenData = (tokenData: TokenData): Record<string, unknown> => {
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expires_at,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
    };
  };

  /**
   * Initialize OAuth2 client with automatic token refresh
   */
  const initializeAuth = async (): Promise<OAuth2Client> => {
    const oauth2Client = new google.auth.OAuth2(
      state.env.GOOGLE_CLIENT_ID,
      state.env.GOOGLE_CLIENT_SECRET,
      state.env.GOOGLE_REDIRECT_URI,
    );

    // Try to load saved credentials from database
    try {
      const tokenData = await loadTokens();

      if (!tokenData) {
        throw new Error(
          'No saved credentials found. Please run the authentication flow first. ' +
            'See README for instructions.',
        );
      }

      oauth2Client.setCredentials(convertTokenData(tokenData));

      // Set up automatic token refresh
      oauth2Client.on('tokens', async (tokens) => {
        // Save updated tokens to database
        const updatedTokenData: TokenData = {
          access_token: tokens.access_token || tokenData.access_token,
          refresh_token: tokens.refresh_token || tokenData.refresh_token,
          expires_at: tokens.expiry_date || tokenData.expires_at,
          token_type: tokens.token_type || tokenData.token_type,
          scope: tokens.scope || tokenData.scope,
        };

        await saveTokens(updatedTokenData);
      });

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

    // Save to database instead of file
    const tokenData: TokenData = {
      access_token: tokens.access_token || '',
      refresh_token: tokens.refresh_token || '',
      expires_at: tokens.expiry_date || Date.now() + 3600000,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope,
    };

    await saveTokens(tokenData);
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

            // Get participant sessions for this conference (filtered for current user)
            const userSessions = await getUserParticipantSessions(record.name);

            // Aggregate all user sessions for this meeting into a single entry
            if (userSessions.length > 0) {
              // Find earliest start and latest end time across all sessions (rejoins)
              const sessionTimes = userSessions
                .filter((s) => s.startTime && s.endTime)
                .map((s) => ({
                  start: new Date(s.startTime),
                  end: new Date(s.endTime as string),
                }));

              if (sessionTimes.length > 0) {
                const earliestStart = new Date(
                  Math.min(...sessionTimes.map((t) => t.start.getTime())),
                );
                const latestEnd = new Date(Math.max(...sessionTimes.map((t) => t.end.getTime())));
                const totalDuration = Math.floor(
                  (latestEnd.getTime() - earliestStart.getTime()) / 1000,
                );

                // biome-ignore lint/suspicious/noExplicitAny: Google API types are incomplete
                const space = record.space as any;
                meetings.push({
                  meetingId: record.name,
                  meetingCode: space?.meetingCode || '',
                  meetingUri: space?.meetingUri || '',
                  startTime: earliestStart,
                  endTime: latestEnd,
                  duration: totalDuration,
                });
              }
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
   * Get participant sessions for the current user only
   */
  const getUserParticipantSessions = async (
    conferenceName: string,
  ): Promise<ParticipantSession[]> => {
    if (!state.auth) {
      await initializeAuth();
    }

    const meet = google.meet({ version: 'v2', auth: state.auth as OAuth2Client });
    const userSessions: ParticipantSession[] = [];

    try {
      // Get all participants
      const participantsResponse = await meet.conferenceRecords.participants.list({
        parent: conferenceName,
        pageSize: 100,
      });

      if (participantsResponse.data.participants) {
        for (const participant of participantsResponse.data.participants) {
          if (!participant.name) continue;

          // biome-ignore lint/suspicious/noExplicitAny: Google API types are incomplete
          const signedinUser = (participant as any).signedinUser;

          // Check if this participant matches the current user
          // Match by display name containing the email username (before @)
          const emailUsername = state.env.GOOGLE_USER_EMAIL.split('@')[0].toLowerCase();
          const displayName = (signedinUser?.displayName || '').toLowerCase();

          const isCurrentUser =
            signedinUser?.user?.includes(state.env.GOOGLE_USER_EMAIL) ||
            displayName.includes(emailUsername) ||
            displayName.includes(state.env.GOOGLE_USER_EMAIL.toLowerCase());

          if (!isCurrentUser) continue;

          // Get sessions for this participant
          const sessionsResponse =
            await meet.conferenceRecords.participants.participantSessions.list({
              parent: participant.name,
              pageSize: 100,
            });

          if (sessionsResponse.data.participantSessions) {
            for (const session of sessionsResponse.data.participantSessions) {
              if (session.name && session.startTime) {
                userSessions.push({
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
      console.error('Error fetching user participant sessions:', error.message);
      throw error;
    }

    return userSessions;
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
