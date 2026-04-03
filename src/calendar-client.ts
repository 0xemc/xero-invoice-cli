/**
 * Google Calendar Client
 */

import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs/promises';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = path.join(process.cwd(), 'gcal-token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'gcal-credentials.json');

async function loadSavedCredentials(): Promise<OAuth2Client | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf-8');
    const credentials = JSON.parse(content);
    const client = google.auth.fromJSON(credentials);
    return client as any as OAuth2Client;
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client: OAuth2Client): Promise<void> {
  const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;

  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });

  await fs.writeFile(TOKEN_PATH, payload);
}

async function createOAuth2Client(): Promise<OAuth2Client> {
  const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;

  const client = new google.auth.OAuth2(
    key.client_id,
    key.client_secret,
    key.redirect_uris[0]
  );

  return client as any as OAuth2Client;
}

export async function generateAuthUrl(): Promise<string> {
  const client = await createOAuth2Client();

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  return authUrl;
}

export async function authorizeWithCode(code: string): Promise<OAuth2Client> {
  const client = await createOAuth2Client();

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const requireReauth = process.env.REQUIRE_GCAL_REAUTH === 'true';
  if (!requireReauth) {
    await saveCredentials(client);
  }

  return client;
}

export async function authorize(): Promise<OAuth2Client> {
  const requireReauth = process.env.REQUIRE_GCAL_REAUTH === 'true';
  const isHeadless = process.env.GCAL_HEADLESS === 'true';
  const authCode = process.env.GCAL_AUTH_CODE;

  let client: OAuth2Client | null = null;

  if (authCode) {
    console.log('Using provided authorization code...');
    client = await authorizeWithCode(authCode);
    if (!requireReauth) {
      await saveCredentials(client);
    } else {
      console.log('✓ Single-use authentication - token will not be saved');
    }
    return client;
  }

  if (!requireReauth) {
    client = await loadSavedCredentials();
    if (client) {
      return client;
    }
  }

  if (isHeadless || (requireReauth && !authCode)) {
    const authUrl = await generateAuthUrl();
    console.log('\n📋 Single-Use Authorization Required');
    console.log('─'.repeat(80));
    console.log('\nPlease visit this URL to authorize this request:');
    console.log('\n' + authUrl + '\n');
    console.log('After authorizing, you will receive an authorization code.');

    if (isHeadless || requireReauth) {
      console.log('Run your command again with the code:\n');
      console.log('  GCAL_AUTH_CODE=<your-code> npm run dev calendar --today\n');
      if (requireReauth) {
        console.log('Note: With REQUIRE_GCAL_REAUTH=true, this token will only be used');
        console.log('for this single request and then discarded.\n');
      }
    }

    throw new Error('GCAL_AUTH_CODE environment variable not set. Please authorize first.');
  }

  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  if (client.credentials && !requireReauth) {
    await saveCredentials(client);
  }

  return client;
}

export async function listCalendars(): Promise<any[]> {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth: auth as any });

  const response = await calendar.calendarList.list();
  return response.data.items || [];
}

export async function findCalendarByName(name: string): Promise<string | null> {
  const calendars = await listCalendars();
  const lowerName = name.toLowerCase();

  const match = calendars.find(cal =>
    cal.summary?.toLowerCase().includes(lowerName)
  );

  return match?.id || null;
}

export async function listEvents(
  startDate: string,
  endDate: string,
  maxResults: number = 100,
  searchQuery?: string,
  calendarId: string = 'primary'
): Promise<any[]> {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth: auth as any });

  let actualCalendarId = calendarId;
  if (calendarId !== 'primary' && !calendarId.includes('@')) {
    const foundId = await findCalendarByName(calendarId);
    if (!foundId) {
      throw new Error(`Calendar "${calendarId}" not found. Use --list-calendars to see available calendars.`);
    }
    actualCalendarId = foundId;
  }

  const response = await calendar.events.list({
    calendarId: actualCalendarId,
    timeMin: new Date(`${startDate}T00:00:00+10:00`).toISOString(),
    timeMax: new Date(`${endDate}T23:59:59+10:00`).toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
    q: searchQuery,
  });

  return response.data.items || [];
}

export function formatEvent(event: any): string {
  const start = event.start.dateTime || event.start.date;
  const startDate = new Date(start);
  const timeStr = event.start.dateTime
    ? startDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    : 'All day';

  return `${startDate.toLocaleDateString('en-AU')} ${timeStr} - ${event.summary}`;
}
