import { redirect, error } from '@sveltejs/kit';
import { createGoogleOAuth } from '$lib/google/auth.js';
import { db } from '$db/client.js';
import { googleAccounts } from '$db/schema.js';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	if (!locals.user) return error(401, 'not authenticated');

	const state = url.searchParams.get('state');
	const code = url.searchParams.get('code');
	const storedState = cookies.get('google_oauth_state');
	const codeVerifier = cookies.get('google_code_verifier');

	cookies.delete('google_oauth_state', { path: '/' });
	cookies.delete('google_code_verifier', { path: '/' });

	if (!state || !code || !storedState || !codeVerifier || state !== storedState) {
		return error(400, 'invalid oauth state');
	}

	const google = createGoogleOAuth();
	const tokens = await google.validateAuthorizationCode(code, codeVerifier);

	const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
		headers: { Authorization: `Bearer ${tokens.accessToken()}` }
	});
	if (!userinfoRes.ok) return error(502, 'failed to fetch google user info');

	const userinfo = (await userinfoRes.json()) as { sub: string; email: string };

	const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : null;

	const existing = await db
		.select()
		.from(googleAccounts)
		.where(eq(googleAccounts.userId, locals.user.id))
		.get();

	if (existing) {
		await db
			.update(googleAccounts)
			.set({
				googleUserId: userinfo.sub,
				email: userinfo.email,
				accessToken: tokens.accessToken(),
				...(refreshToken ? { refreshToken } : {}),
				tokenExpiresAt: tokens.accessTokenExpiresAt(),
				scopes: 'https://www.googleapis.com/auth/calendar.readonly',
				updatedAt: new Date()
			})
			.where(eq(googleAccounts.id, existing.id));
	} else {
		if (!refreshToken) return error(400, 'no refresh token returned; revoke app access and retry');
		await db.insert(googleAccounts).values({
			userId: locals.user.id,
			googleUserId: userinfo.sub,
			email: userinfo.email,
			accessToken: tokens.accessToken(),
			refreshToken,
			tokenExpiresAt: tokens.accessTokenExpiresAt(),
			scopes: 'https://www.googleapis.com/auth/calendar.readonly'
		});
	}

	redirect(302, '/settings?google=connected');
};
