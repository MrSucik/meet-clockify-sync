/**
 * Google Meet API Types
 */

export interface ParticipantSession {
  name: string;
  startTime: string;
  endTime: string | null;
}

export interface Participant {
  name: string;
  earliestStartTime: string;
  latestEndTime: string;
  signedinUser?: {
    user: string;
    displayName: string;
  };
  anonymousUser?: {
    displayName: string;
  };
}

export interface ConferenceRecord {
  name: string;
  startTime: string;
  endTime: string;
  space?: {
    name: string;
    meetingUri: string;
    meetingCode: string;
  };
}

export interface MeetingSession {
  meetingId: string;
  meetingCode: string;
  meetingUri: string;
  startTime: Date;
  endTime: Date;
  duration: number; // in seconds
  title?: string;
}
