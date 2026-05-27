import { json, error } from '@sveltejs/kit';
import { db } from '$db/client.js';
import { users } from '$db/schema.js';
import { lucia } from '$lib/auth.js';
import { bunPassword } from '$lib/password.js';
import { eq } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { checkRateLimit } from '$lib/rateLimit.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	if (!checkRateLimit(getClientAddress(), 10)) return error(429, 'too many requests');
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
	if (!user || user.authProvider !== 'email') return error(401, 'invalid credentials');

	const stored = user.authProviderId ?? '';
	let valid = false;

	if (stored.startsWith('$argon2')) {
		valid = await bunPassword.verify(body.password, stored);
	} else {
		const sha = encodeHexLowerCase(sha256(new TextEncoder().encode(body.password)));
		if (sha === stored) {
			valid = true;
			const newHash = await bunPassword.hash(body.password);
			await db.update(users).set({ authProviderId: newHash }).where(eq(users.id, user.id));
			console.warn(`[auth] legacy SHA256 login migrated: userId=${user.id}`);
		}
	}

	if (!valid) return error(401, 'invalid credentials');

	const session = await lucia.createSession(user.id, {});
	const cookie = lucia.createSessionCookie(session.id);
	cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

	return json({ userId: user.id });
};
