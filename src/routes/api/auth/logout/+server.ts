import { json, error } from '@sveltejs/kit';
import { lucia } from '$lib/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.session) return error(401, 'not authenticated');

	await lucia.invalidateSession(locals.session.id);
	const blank = lucia.createBlankSessionCookie();
	cookies.set(blank.name, blank.value, { path: '/', ...blank.attributes });

	return json({ ok: true });
};
