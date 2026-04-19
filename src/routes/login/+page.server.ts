import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$db/client.js';
import { users } from '$db/schema.js';
import { lucia } from '$lib/auth.js';
import { eq } from 'drizzle-orm';
import { hash as argon2hash, verify as argon2verify } from '@node-rs/argon2';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 } as const;

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/');
	return {};
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email');
		const password = data.get('password');

		if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
			return fail(400, { error: 'Email and password are required.' });
		}

		const user = await db.select().from(users).where(eq(users.email, email)).get();
		if (!user || user.authProvider !== 'email') return fail(401, { error: 'Invalid credentials.' });

		const stored = user.authProviderId ?? '';
		let valid = false;

		if (stored.startsWith('$argon2')) {
			valid = await argon2verify(stored, password, ARGON2_OPTIONS);
		} else {
			// legacy SHA256 — verify then rehash to argon2id on next login
			const sha = encodeHexLowerCase(sha256(new TextEncoder().encode(password)));
			if (sha === stored) {
				valid = true;
				const newHash = await argon2hash(password, ARGON2_OPTIONS);
				await db.update(users).set({ authProviderId: newHash }).where(eq(users.id, user.id));
			}
		}

		if (!valid) return fail(401, { error: 'Invalid credentials.' });

		const session = await lucia.createSession(user.id, {});
		const cookie = lucia.createSessionCookie(session.id);
		cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

		redirect(302, '/');
	},

	register: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email');
		const password = data.get('password');
		const displayName = data.get('displayName');

		if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
			return fail(400, { error: 'Email and password are required.' });
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Enter a valid email address.' });
		}
		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters.' });
		}

		const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
		if (existing) return fail(409, { error: 'An account with that email already exists.' });

		const hash = await argon2hash(password, ARGON2_OPTIONS);
		const id = crypto.randomUUID();

		await db.insert(users).values({
			id,
			email,
			authProvider: 'email',
			authProviderId: hash,
			displayName: typeof displayName === 'string' && displayName ? displayName : null
		});

		const session = await lucia.createSession(id, {});
		const cookie = lucia.createSessionCookie(session.id);
		cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

		redirect(302, '/');
	}
};
