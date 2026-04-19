// create real rows and clean them up after each suite.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '$db/client.js';
import { users, sessions } from '$db/schema.js';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:5173';

function uid() {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function testEmail() {
	return `test-${uid()}@integration.test`;
}

async function post(path: string, body: unknown, cookie?: string) {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (cookie) headers['Cookie'] = cookie;
	return fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function cleanupUser(email: string) {
	const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
	if (user) {
		await db.delete(sessions).where(eq(sessions.userId, user.id));
		await db.delete(users).where(eq(users.id, user.id));
	}
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe('POST /api/auth/register', () => {
	const email = testEmail();
	afterAll(() => cleanupUser(email));

	it('creates a new user and returns 201 with userId', async () => {
		const res = await post('/api/auth/register', { email, password: 'hunter2!!' });
		expect(res.status).toBe(201);
		const body = await res.json() as { userId: string };
		expect(typeof body.userId).toBe('string');
		expect(body.userId.length).toBeGreaterThan(0);
	});

	it('returns 409 when email is already registered', async () => {
		const res = await post('/api/auth/register', { email, password: 'another-pass' });
		expect(res.status).toBe(409);
	});

	it('returns 400 when password is under 8 chars', async () => {
		const res = await post('/api/auth/register', { email: testEmail(), password: 'short' });
		expect(res.status).toBe(400);
	});

	it('returns 400 when email is missing', async () => {
		const res = await post('/api/auth/register', { password: 'validpass123' });
		expect(res.status).toBe(400);
	});

	it('returns 400 when body is not JSON', async () => {
		const res = await fetch(`${BASE_URL}/api/auth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not-json'
		});
		expect(res.status).toBe(400);
	});

	it('sets a session cookie on success', async () => {
		const e = testEmail();
		const res = await post('/api/auth/register', { email: e, password: 'validpass123' });
		afterAll(() => cleanupUser(e));
		expect(res.status).toBe(201);
		const setCookie = res.headers.get('set-cookie');
		expect(setCookie).toBeTruthy();
	});

	it('accepts optional displayName', async () => {
		const e = testEmail();
		const res = await post('/api/auth/register', { email: e, password: 'validpass123', displayName: 'Test User' });
		afterAll(() => cleanupUser(e));
		expect(res.status).toBe(201);
		const user = await db.select().from(users).where(eq(users.email, e)).get();
		expect(user?.displayName).toBe('Test User');
	});
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
	const email = testEmail();
	const password = 'correcthorsebatterystaple';

	beforeAll(async () => {
		await post('/api/auth/register', { email, password });
	});
	afterAll(() => cleanupUser(email));

	it('returns 200 with userId on valid credentials', async () => {
		const res = await post('/api/auth/login', { email, password });
		expect(res.status).toBe(200);
		const body = await res.json() as { userId: string };
		expect(typeof body.userId).toBe('string');
	});

	it('sets a session cookie on valid login', async () => {
		const res = await post('/api/auth/login', { email, password });
		expect(res.status).toBe(200);
		expect(res.headers.get('set-cookie')).toBeTruthy();
	});

	it('returns 401 for wrong password', async () => {
		const res = await post('/api/auth/login', { email, password: 'wrongpassword' });
		expect(res.status).toBe(401);
	});

	it('returns 401 for unknown email', async () => {
		const res = await post('/api/auth/login', { email: testEmail(), password });
		expect(res.status).toBe(401);
	});

	it('returns 400 when body is missing password field', async () => {
		const res = await post('/api/auth/login', { email });
		expect(res.status).toBe(400);
	});

	it('returns 400 for malformed JSON', async () => {
		const res = await fetch(`${BASE_URL}/api/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{'
		});
		expect(res.status).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
	const email = testEmail();
	const password = 'logouttest1234';
	let sessionCookie = '';

	beforeAll(async () => {
		const res = await post('/api/auth/register', { email, password });
		const raw = res.headers.get('set-cookie') ?? '';
		// extract the raw name=value pair (everything before first semicolon)
		sessionCookie = raw.split(';')[0];
	});
	afterAll(() => cleanupUser(email));

	it('returns 200 and clears the session cookie', async () => {
		const res = await post('/api/auth/logout', {}, sessionCookie);
		expect(res.status).toBe(200);
		const body = await res.json() as { ok: boolean };
		expect(body.ok).toBe(true);
		const setCookie = res.headers.get('set-cookie') ?? '';
		expect(setCookie).toContain('Max-Age=0');
	});

	it('returns 401 when not authenticated', async () => {
		const res = await post('/api/auth/logout', {});
		expect(res.status).toBe(401);
	});

	it('session is invalid after logout', async () => {
		// re-register a fresh user for this sub-test
		const e2 = testEmail();
		const r1 = await post('/api/auth/register', { email: e2, password: 'freshtest123' });
		const raw = r1.headers.get('set-cookie') ?? '';
		const cookie = raw.split(';')[0];
		afterAll(() => cleanupUser(e2));

		await post('/api/auth/logout', {}, cookie);

		// using the old cookie on a guarded endpoint should return 401
		const res = await post('/api/sync', { workouts: [], sets: [] }, cookie);
		expect(res.status).toBe(401);
	});
});
