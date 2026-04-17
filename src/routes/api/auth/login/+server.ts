import { json, error } from '@sveltejs/kit';
import { db } from '$db/client.js';
import { users } from '$db/schema.js';
import { lucia } from '$lib/auth.js';
import { eq } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: { email: string; password: string };

	try {
		body = await request.json();
	} catch {
		return error(400, 'invalid json');
	}

	if (typeof body.email !== 'string' || typeof body.password !== 'string') {
		return error(400, 'email and password required');
	}

	const user = await db.select().from(users).where(eq(users.email, body.email)).get();
	if (!user) return error(401, 'invalid credentials');

	// password stored as hex-encoded sha256 in authProviderId when authProvider='email'
	const hash = encodeHexLowerCase(sha256(new TextEncoder().encode(body.password)));
	if (user.authProvider !== 'email' || user.authProviderId !== hash) {
		return error(401, 'invalid credentials');
	}

	const session = await lucia.createSession(user.id, {});
	const cookie = lucia.createSessionCookie(session.id);
	cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

	return json({ userId: user.id });
};
