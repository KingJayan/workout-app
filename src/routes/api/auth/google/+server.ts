import { redirect, error } from '@sveltejs/kit';
import { generateState, generateCodeVerifier } from 'arctic';
import { createGoogleOAuth } from '$lib/google/auth.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.user) return error(401, 'not authenticated');

	const google = createGoogleOAuth();
	const state = generateState();
	const codeVerifier = generateCodeVerifier();

	const url = google.createAuthorizationURL(state, codeVerifier, [
		'https://www.googleapis.com/auth/calendar.readonly',
		'openid',
		'email'
	]);
	url.searchParams.set('access_type', 'offline');
	url.searchParams.set('prompt', 'consent');

	cookies.set('google_oauth_state', state, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600
	});
	cookies.set('google_code_verifier', codeVerifier, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600
	});

	redirect(302, url.toString());
};
