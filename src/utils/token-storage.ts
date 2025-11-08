import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { tokens } from '../db/schema';

export type TokenData = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope?: string;
};

/**
 * Saves or updates Google OAuth tokens in the database
 */
export async function saveTokens(tokenData: TokenData): Promise<void> {
  const db = getDb();

  await db
    .insert(tokens)
    .values({
      provider: 'google',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_at,
      tokenType: tokenData.token_type,
      scope: tokenData.scope || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tokens.provider,
      set: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        tokenType: tokenData.token_type,
        scope: tokenData.scope || null,
        updatedAt: new Date(),
      },
    });

  console.log('✅ Tokens saved to database');
}

/**
 * Loads Google OAuth tokens from the database
 */
export async function loadTokens(): Promise<TokenData | null> {
  const db = getDb();

  const result = await db.select().from(tokens).where(eq(tokens.provider, 'google')).limit(1);

  if (result.length === 0) {
    return null;
  }

  const token = result[0];

  return {
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expires_at: token.expiresAt,
    token_type: token.tokenType,
    scope: token.scope || undefined,
  };
}

/**
 * Deletes Google OAuth tokens from the database
 */
export async function deleteTokens(): Promise<void> {
  const db = getDb();

  await db.delete(tokens).where(eq(tokens.provider, 'google'));

  console.log('✅ Tokens deleted from database');
}
