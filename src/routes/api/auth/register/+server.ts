import { json, error } from '@sveltejs/kit';
import { db } from '$db/client.js';
import { users } from '$db/schema.js';
import { lucia } from '$lib/auth.js';
import { eq } from 'drizzle-orm';
import { hash as argon2hash } from '@node-rs/argon2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import type { RequestHandler } from './$types';

function generateId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return encodeHexLowerCase(bytes);
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: { email: string; password: string; displayName?: string };

	try {
		body = await request.json();
	} catch {
		return error(400, 'invalid json');
	}

	if (typeof body.email !== 'string' || typeof body.password !== 'string') {
		return error(400, 'email and password required');
	}

	if (body.password.length < 8) return error(400, 'password must be at least 8 characters');

	const existing = await db.select().from(users).where(eq(users.email, body.email)).get();
	if (existing) return error(409, 'email already registered');

	const hash = await argon2hash(body.password, { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 });
	const userId = generateId();

	await db.insert(users).values({
		id: userId,
		authProvider: 'email',
		authProviderId: hash,
		email: body.email,
		displayName: body.displayName ?? null
	});

	const session = await lucia.createSession(userId, {});
	const cookie = lucia.createSessionCookie(session.id);
	cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

	return json({ userId }, { status: 201 });
};
