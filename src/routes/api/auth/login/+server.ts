import { json, error } from '@sveltejs/kit';
import { db } from '$db/client.js';
import { users } from '$db/schema.js';
import { lucia } from '$lib/auth.js';
import { eq } from 'drizzle-orm';
import { hash as argon2hash, verify as argon2verify } from '@node-rs/argon2';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import type { RequestHandler } from './$types';

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 } as const;

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
	if (!user || user.authProvider !== 'email') return error(401, 'invalid credentials');

	const stored = user.authProviderId ?? '';
	let valid = false;

	if (stored.startsWith('$argon2')) {
		valid = await argon2verify(stored, body.password, ARGON2_OPTIONS);
	} else {
		// legacy SHA256 path — verify then rehash to argon2id
		const sha = encodeHexLowerCase(sha256(new TextEncoder().encode(body.password)));
		if (sha === stored) {
			valid = true;
			const newHash = await argon2hash(body.password, ARGON2_OPTIONS);
			await db.update(users).set({ authProviderId: newHash }).where(eq(users.id, user.id));
		}
	}

	if (!valid) return error(401, 'invalid credentials');

	const session = await lucia.createSession(user.id, {});
	const cookie = lucia.createSessionCookie(session.id);
	cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

	return json({ userId: user.id });
};
