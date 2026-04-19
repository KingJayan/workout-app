// covers /api/sync http behaviour and the syncNow() client helper (via fetch mock)

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '$db/client.js';
import { users, sessions, workouts, sets } from '$db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import type { LocalWorkout, LocalSet } from '$lib/db/local.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:5173';

function uid() {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function testEmail() {
	return `sync-test-${uid()}@integration.test`;
}

async function register(email: string, password = 'synctest1234') {
	const res = await fetch(`${BASE_URL}/api/auth/register`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
	const body = await res.json() as { userId: string };
	return { userId: body.userId, cookie };
}

async function post(path: string, body: unknown, cookie: string) {
	return fetch(`${BASE_URL}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: cookie },
		body: JSON.stringify(body)
	});
}

function makeWorkout(userId: string, id = `w-${uid()}`): LocalWorkout {
	return {
		id,
		userId,
		prescriptionId: null,
		gearProfileId: null,
		startedAt: new Date().toISOString(),
		endedAt: null,
		notes: null,
		rawInput: null,
		synced: false,
		createdAt: Date.now()
	};
}

function makeSet(userId: string, workoutId: string, idx = 0): LocalSet {
	return {
		id: `s-${uid()}`,
		workoutId,
		userId,
		exerciseId: 'ex-squat',
		exerciseName: 'Squat',
		setIndex: idx,
		reps: 5,
		loadKg: 100,
		durationSeconds: null,
		distanceMeters: null,
		rpe: 8,
		setType: 'working',
		rawInput: null,
		loggedAt: new Date().toISOString(),
		synced: false,
		createdAt: Date.now()
	};
}

async function cleanupUser(email: string) {
	const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
	if (!user) return;
	const uid = user.id;
	const ws = await db.select({ id: workouts.id }).from(workouts).where(eq(workouts.userId, uid)).all();
	if (ws.length) {
		await db.delete(sets).where(inArray(sets.workoutId, ws.map((w) => w.id)));
		await db.delete(workouts).where(eq(workouts.userId, uid));
	}
	await db.delete(sessions).where(eq(sessions.userId, uid));
	await db.delete(users).where(eq(users.id, uid));
}

// ---------------------------------------------------------------------------
// /api/sync — auth
// ---------------------------------------------------------------------------

describe('POST /api/sync — auth guards', () => {
	it('returns 401 with no session cookie', async () => {
		const res = await fetch(`${BASE_URL}/api/sync`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ workouts: [], sets: [] })
		});
		expect(res.status).toBe(401);
	});

	it('returns 400 for malformed JSON', async () => {
		const email = testEmail();
		const { cookie } = await register(email);
		afterAll(() => cleanupUser(email));

		const res = await fetch(`${BASE_URL}/api/sync`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: 'not-json'
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 when workouts is not an array', async () => {
		const email = testEmail();
		const { cookie } = await register(email);
		afterAll(() => cleanupUser(email));

		const res = await post('/api/sync', { workouts: null, sets: [] }, cookie);
		expect(res.status).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// /api/sync — ownership validation
// ---------------------------------------------------------------------------

describe('POST /api/sync — userId ownership', () => {
	const email = testEmail();
	let cookie = '';

	beforeAll(async () => {
		({ cookie } = await register(email));
	});
	afterAll(() => cleanupUser(email));

	it('returns 403 when workout userId does not match authenticated user', async () => {
		const fakeWorkout = makeWorkout('different-user-id');
		const res = await post('/api/sync', { workouts: [fakeWorkout], sets: [] }, cookie);
		expect(res.status).toBe(403);
	});

	it('returns 403 when set userId does not match authenticated user', async () => {
		const email2 = testEmail();
		const { userId: ownUserId } = await register(email2);
		afterAll(() => cleanupUser(email2));

		const w = makeWorkout(ownUserId);
		const s = makeSet('different-user-id', w.id);
		const res = await post('/api/sync', { workouts: [w], sets: [s] }, cookie);
		expect(res.status).toBe(403);
	});
});

// ---------------------------------------------------------------------------
// /api/sync — successful upsert
// ---------------------------------------------------------------------------

describe('POST /api/sync — successful upsert', () => {
	const email = testEmail();
	let userId = '';
	let cookie = '';

	beforeAll(async () => {
		({ userId, cookie } = await register(email));
	});
	afterAll(() => cleanupUser(email));

	it('syncs workouts and sets, returns their IDs', async () => {
		const w = makeWorkout(userId);
		const s = makeSet(userId, w.id, 0);

		const res = await post('/api/sync', { workouts: [w], sets: [s] }, cookie);
		expect(res.status).toBe(200);

		const body = await res.json() as {
			syncedWorkoutIds: string[];
			syncedSetIds: string[];
			errors: string[];
		};
		expect(body.syncedWorkoutIds).toContain(w.id);
		expect(body.syncedSetIds).toContain(s.id);
		expect(body.errors).toHaveLength(0);
	});

	it('persists the workout row in Turso', async () => {
		const w = makeWorkout(userId);
		await post('/api/sync', { workouts: [w], sets: [] }, cookie);

		const row = await db.select().from(workouts).where(eq(workouts.id, w.id)).get();
		expect(row).toBeTruthy();
		expect(row?.userId).toBe(userId);
		expect(row?.synced).toBe(true);
	});

	it('persists the set row in Turso', async () => {
		const w = makeWorkout(userId);
		const s = makeSet(userId, w.id, 0);
		await post('/api/sync', { workouts: [w], sets: [s] }, cookie);

		const row = await db.select().from(sets).where(eq(sets.id, s.id)).get();
		expect(row).toBeTruthy();
		expect(row?.workoutId).toBe(w.id);
		expect(row?.synced).toBe(true);
	});

	it('idempotent — syncing the same record twice does not error', async () => {
		const w = makeWorkout(userId);
		const s = makeSet(userId, w.id, 0);
		const payload = { workouts: [w], sets: [s] };

		const res1 = await post('/api/sync', payload, cookie);
		const res2 = await post('/api/sync', payload, cookie);

		expect(res1.status).toBe(200);
		expect(res2.status).toBe(200);
		const body = await res2.json() as { errors: string[] };
		expect(body.errors).toHaveLength(0);
	});

	it('updates existing workout fields on re-sync (notes, endedAt)', async () => {
		const w = makeWorkout(userId);
		await post('/api/sync', { workouts: [w], sets: [] }, cookie);

		const updated = { ...w, notes: 'felt strong', endedAt: new Date().toISOString() };
		await post('/api/sync', { workouts: [updated], sets: [] }, cookie);

		const row = await db.select().from(workouts).where(eq(workouts.id, w.id)).get();
		expect(row?.notes).toBe('felt strong');
		expect(row?.endedAt).toBeTruthy();
	});

	it('returns empty arrays for empty payload', async () => {
		const res = await post('/api/sync', { workouts: [], sets: [] }, cookie);
		expect(res.status).toBe(200);
		const body = await res.json() as { syncedWorkoutIds: string[]; syncedSetIds: string[] };
		expect(body.syncedWorkoutIds).toHaveLength(0);
		expect(body.syncedSetIds).toHaveLength(0);
	});

	it('syncs multiple workouts and sets in one request', async () => {
		const w1 = makeWorkout(userId);
		const w2 = makeWorkout(userId);
		const s1 = makeSet(userId, w1.id, 0);
		const s2 = makeSet(userId, w1.id, 1);
		const s3 = makeSet(userId, w2.id, 0);

		const res = await post('/api/sync', { workouts: [w1, w2], sets: [s1, s2, s3] }, cookie);
		const body = await res.json() as { syncedWorkoutIds: string[]; syncedSetIds: string[] };
		expect(body.syncedWorkoutIds).toHaveLength(2);
		expect(body.syncedSetIds).toHaveLength(3);
	});
});

describe('syncNow() client logic', () => {

	it('returns zero counts when there is nothing to sync', async () => {
		vi.mock('$db/local.js', () => ({
			getUnsyncedWorkouts: vi.fn().mockResolvedValue([]),
			getUnsyncedSets: vi.fn().mockResolvedValue([]),
			markWorkoutsSynced: vi.fn().mockResolvedValue(undefined),
			markSetsSynced: vi.fn().mockResolvedValue(undefined)
		}));

		const { syncNow } = await import('$lib/sync.js');
		const result = await syncNow();
		expect(result.workoutsSynced).toBe(0);
		expect(result.setsSynced).toBe(0);
		expect(result.errors).toHaveLength(0);

		vi.resetModules();
	});

	it('pushes unsynced records and marks them synced on success', async () => {
		const fakeWorkout = { id: 'w1', userId: 'u1' } as LocalWorkout;
		const fakeSet = { id: 's1', userId: 'u1' } as LocalSet;

		const markWorkoutsSynced = vi.fn().mockResolvedValue(undefined);
		const markSetsSynced = vi.fn().mockResolvedValue(undefined);

		vi.mock('$db/local.js', () => ({
			getUnsyncedWorkouts: vi.fn().mockResolvedValue([fakeWorkout]),
			getUnsyncedSets: vi.fn().mockResolvedValue([fakeSet]),
			markWorkoutsSynced,
			markSetsSynced
		}));

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ syncedWorkoutIds: ['w1'], syncedSetIds: ['s1'] })
		} as Response);

		const { syncNow } = await import('$lib/sync.js');
		const result = await syncNow();

		expect(result.workoutsSynced).toBe(1);
		expect(result.setsSynced).toBe(1);
		expect(result.errors).toHaveLength(0);
		expect(markWorkoutsSynced).toHaveBeenCalledWith(['w1']);
		expect(markSetsSynced).toHaveBeenCalledWith(['s1']);

		vi.resetModules();
	});

	it('records an error when fetch fails with non-ok response', async () => {
		vi.mock('$db/local.js', () => ({
			getUnsyncedWorkouts: vi.fn().mockResolvedValue([{ id: 'w1' } as LocalWorkout]),
			getUnsyncedSets: vi.fn().mockResolvedValue([]),
			markWorkoutsSynced: vi.fn(),
			markSetsSynced: vi.fn()
		}));

		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			text: async () => 'not authenticated'
		} as unknown as Response);

		const { syncNow } = await import('$lib/sync.js');
		const result = await syncNow();

		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toContain('401');

		vi.resetModules();
	});

	it('records an error when fetch throws (network failure)', async () => {
		vi.mock('$db/local.js', () => ({
			getUnsyncedWorkouts: vi.fn().mockResolvedValue([{ id: 'w1' } as LocalWorkout]),
			getUnsyncedSets: vi.fn().mockResolvedValue([]),
			markWorkoutsSynced: vi.fn(),
			markSetsSynced: vi.fn()
		}));

		global.fetch = vi.fn().mockRejectedValue(new Error('network error'));

		const { syncNow } = await import('$lib/sync.js');
		const result = await syncNow();

		expect(result.errors[0]).toContain('network error');

		vi.resetModules();
	});
});
