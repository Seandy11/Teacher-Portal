import { google } from 'googleapis';
import { db } from '../db';
import { googleTokens } from '../../shared/schema';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets',
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

export function getRedirectUri() {
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] 
    || process.env.APP_DOMAIN 
    || `localhost:${process.env.PORT || 5000}`;
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${domain}/api/auth/google/callback`;
}

export function getAuthUrl(state?: string) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  await db.insert(googleTokens)
    .values({
      id: 'singleton',
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token || null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    })
    .onConflictDoUpdate({
      target: googleTokens.id,
      set: {
        accessToken: tokens.access_token || null,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });
  
  return tokens;
}

async function getAuthenticatedClient() {
  const oauth2Client = getOAuth2Client();
  
  const rows = await db.select().from(googleTokens).limit(1);
  if (!rows.length || !rows[0].refreshToken) {
    throw new Error('Google account not connected. An admin must connect Google first.');
  }
  
  const tokenRow = rows[0];
  oauth2Client.setCredentials({
    access_token: tokenRow.accessToken,
    refresh_token: tokenRow.refreshToken,
    expiry_date: tokenRow.expiresAt ? tokenRow.expiresAt.getTime() : undefined,
  });
  
  const isExpired = tokenRow.expiresAt && tokenRow.expiresAt.getTime() < Date.now();
  if (isExpired || !tokenRow.accessToken) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await db.insert(googleTokens)
      .values({
        id: 'singleton',
        accessToken: credentials.access_token || null,
        refreshToken: credentials.refresh_token || tokenRow.refreshToken,
        expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      })
      .onConflictDoUpdate({
        target: googleTokens.id,
        set: {
          accessToken: credentials.access_token || null,
          refreshToken: credentials.refresh_token || tokenRow.refreshToken,
          expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        },
      });
  }
  
  return oauth2Client;
}

export async function getGoogleCalendarClient() {
  const auth = await getAuthenticatedClient();
  return google.calendar({ version: 'v3', auth });
}

export async function getGoogleSheetsClient() {
  const auth = await getAuthenticatedClient();
  return google.sheets({ version: 'v4', auth });
}

export async function isGoogleConnected(): Promise<boolean> {
  const rows = await db.select().from(googleTokens).limit(1);
  return rows.length > 0 && !!rows[0].refreshToken;
}
