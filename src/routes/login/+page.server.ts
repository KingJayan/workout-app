import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$db/client.js';
import { users } from '$db/schema.js';
import { lucia } from '$lib/auth.js';
import { eq } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';

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
		if (!user) return fail(401, { error: 'Invalid credentials.' });

		const hash = encodeHexLowerCase(sha256(new TextEncoder().encode(password)));
		if (user.authProvider !== 'email' || user.authProviderId !== hash) {
			return fail(401, { error: 'Invalid credentials.' });
		}

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
		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters.' });
		}

		const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
		if (existing) return fail(409, { error: 'An account with that email already exists.' });

		const hash = encodeHexLowerCase(sha256(new TextEncoder().encode(password)));
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
