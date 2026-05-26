import { Google } from 'arctic';
import { db } from '$db/client.js';
import { googleAccounts } from '$db/schema.js';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

export function createGoogleOAuth(): Google {
	return new Google(
		env.GOOGLE_CLIENT_ID!,
		env.GOOGLE_CLIENT_SECRET!,
		env.GOOGLE_REDIRECT_URI!
	);
}

export async function ensureFreshToken(googleAccountId: number): Promise<string> {
	const account = await db
		.select()
		.from(googleAccounts)
		.where(eq(googleAccounts.id, googleAccountId))
		.get();

	if (!account) throw new Error('google account not found');

	if (account.tokenExpiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
		return account.accessToken;
	}

	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID!,
			client_secret: env.GOOGLE_CLIENT_SECRET!,
			refresh_token: account.refreshToken,
			grant_type: 'refresh_token'
		})
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		if ((body as { error?: string }).error === 'invalid_grant') {
			await handleInvalidGrant(account.userId);
		}
		throw new Error(`token refresh failed: ${res.status}`);
	}

	const data = (await res.json()) as { access_token: string; expires_in: number };
	const expiresAt = new Date(Date.now() + data.expires_in * 1000);

	await db
		.update(googleAccounts)
		.set({ accessToken: data.access_token, tokenExpiresAt: expiresAt, updatedAt: new Date() })
		.where(eq(googleAccounts.id, googleAccountId));

	return data.access_token;
}

export async function handleInvalidGrant(userId: string): Promise<void> {
	await db.delete(googleAccounts).where(eq(googleAccounts.userId, userId));
}
