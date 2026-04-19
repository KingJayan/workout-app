// creates real prescriptions, calls /api/prescriptions/rewrite, asserts DB state, then cleans up.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '$db/client.js';
import { users, sessions, prescriptions, gearProfiles } from '$db/schema.js';
import { eq } from 'drizzle-orm';
import type { PrescriptionPayload } from '$db/schema.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:5173';

function uid() {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function testEmail() {
	return `rewrite-test-${uid()}@integration.test`;
}

async function register(email: string) {
	const res = await fetch(`${BASE_URL}/api/auth/register`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password: 'rewritetest123' })
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

async function insertPrescription(userId: string, payload: PrescriptionPayload, gearProfileId?: number) {
	const result = await db.insert(prescriptions).values({
		userId,
		date: new Date().toISOString().slice(0, 10),
		payload,
		gearProfileId: gearProfileId ?? null,
		status: 'pending'
	}).returning({ id: prescriptions.id });
	return result[0].id;
}

async function insertGearProfile(userId: string, overrides: Partial<typeof gearProfiles.$inferInsert> = {}) {
	const result = await db.insert(gearProfiles).values({
		userId,
		name: 'Test Gym',
		hasBarbell: true,
		hasCable: true,
		hasMachines: true,
		hasDumbbells: true,
		hasKettlebells: false,
		hasPullupBar: false,
		hasBands: false,
		isDefault: false,
		...overrides
	}).returning({ id: gearProfiles.id });
	return result[0].id;
}

const STRENGTH_PAYLOAD: PrescriptionPayload = {
	sessionType: 'strength',
	targetVolumeLoad: 12000,
	exercises: [
		{ exerciseId: 'e-squat', name: 'Squat', sets: 4, repsTarget: 5, loadKg: 120, rpe: 8 },
		{ exerciseId: 'e-bench', name: 'Bench Press', sets: 4, repsTarget: 8, loadKg: 80, rpe: 7 },
		{ exerciseId: 'e-curl', name: 'Dumbbell Curl', sets: 3, repsTarget: 12, loadKg: 20, rpe: 7 }
	]
};

async function cleanupUser(email: string) {
	const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
	if (!user) return;
	const uid = user.id;
	await db.delete(prescriptions).where(eq(prescriptions.userId, uid));
	await db.delete(gearProfiles).where(eq(gearProfiles.userId, uid));
	await db.delete(sessions).where(eq(sessions.userId, uid));
	await db.delete(users).where(eq(users.id, uid));
}

// ---------------------------------------------------------------------------
// auth guard
// ---------------------------------------------------------------------------

describe('POST /api/prescriptions/rewrite — auth guard', () => {
	it('returns 401 with no session', async () => {
		const res = await fetch(`${BASE_URL}/api/prescriptions/rewrite`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prescriptionId: 1 })
		});
		expect(res.status).toBe(401);
	});

	it('returns 400 when prescriptionId is missing', async () => {
		const email = testEmail();
		const { cookie } = await register(email);
		afterAll(() => cleanupUser(email));

		const res = await post('/api/prescriptions/rewrite', {}, cookie);
		expect(res.status).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// no trigger — identity path
// ---------------------------------------------------------------------------

describe('rewrite — no fatigue triggers', () => {
	const email = testEmail();
	let cookie = '';
	let userId = '';
	let prescriptionId: number;

	beforeAll(async () => {
		({ userId, cookie } = await register(email));
		prescriptionId = await insertPrescription(userId, STRENGTH_PAYLOAD);
	});
	afterAll(() => cleanupUser(email));

	it('returns rewritten: false when sleep and readiness are fine', async () => {
		const res = await post('/api/prescriptions/rewrite', {
			prescriptionId,
			recovery: { sleepHours: 8, subjectiveReadiness: 7 },
			upcomingEvents: []
		}, cookie);
		expect(res.status).toBe(200);
		const body = await res.json() as { rewritten: boolean; reason: null };
		expect(body.rewritten).toBe(false);
		expect(body.reason).toBeNull();
	});

	it('does not update prescription status when no trigger', async () => {
		const row = await db.select().from(prescriptions).where(eq(prescriptions.id, prescriptionId)).get();
		expect(row?.status).toBe('pending');
	});
});

// ---------------------------------------------------------------------------
// sleep trigger — sets dropped
// ---------------------------------------------------------------------------

describe('rewrite — sleep trigger drops sets', () => {
	const email = testEmail();
	let cookie = '';
	let userId = '';
	let prescriptionId: number;

	beforeAll(async () => {
		({ userId, cookie } = await register(email));
		prescriptionId = await insertPrescription(userId, STRENGTH_PAYLOAD);
	});
	afterAll(() => cleanupUser(email));

	it('returns rewritten: true with reason mentioning sleep', async () => {
		const res = await post('/api/prescriptions/rewrite', {
			prescriptionId,
			recovery: { sleepHours: 4, subjectiveReadiness: null },
			upcomingEvents: []
		}, cookie);
		expect(res.status).toBe(200);
		const body = await res.json() as { rewritten: boolean; reason: string; setsDropped: number };
		expect(body.rewritten).toBe(true);
		expect(body.reason).toContain('sleep');
	});

	it('updates prescription status to modified in the DB', async () => {
		const row = await db.select().from(prescriptions).where(eq(prescriptions.id, prescriptionId)).get();
		expect(row?.status).toBe('modified');
	});

	it('persists the reduced set counts in payload', async () => {
		const row = await db.select().from(prescriptions).where(eq(prescriptions.id, prescriptionId)).get();
		const totalSets = row!.payload.exercises.reduce((a, e) => a + e.sets, 0);
		const originalTotal = STRENGTH_PAYLOAD.exercises.reduce((a, e) => a + e.sets, 0);
		expect(totalSets).toBeLessThanOrEqual(originalTotal);
	});

	it('sets algorithmVersion to 1.1', async () => {
		const row = await db.select().from(prescriptions).where(eq(prescriptions.id, prescriptionId)).get();
		expect(row?.algorithmVersion).toBe('1.1');
	});
});

// ---------------------------------------------------------------------------
// readiness trigger ≤ 3 — swaps compounds
// ---------------------------------------------------------------------------

describe('rewrite — readiness trigger swaps compounds', () => {
	const email = testEmail();
	let cookie = '';
	let userId = '';
	let prescriptionId: number;

	beforeAll(async () => {
		({ userId, cookie } = await register(email));
		const gearId = await insertGearProfile(userId, { hasMachines: true, hasDumbbells: true });
		prescriptionId = await insertPrescription(userId, STRENGTH_PAYLOAD, gearId);
	});
	afterAll(() => cleanupUser(email));

	it('swaps compound exercises to isolated alternatives', async () => {
		const res = await post('/api/prescriptions/rewrite', {
			prescriptionId,
			recovery: { sleepHours: null, subjectiveReadiness: 2 },
			upcomingEvents: []
		}, cookie);
		const body = await res.json() as { rewritten: boolean; exercisesSwapped: number };
		expect(body.rewritten).toBe(true);
		expect(body.exercisesSwapped).toBeGreaterThan(0);
	});

	it('persists the swapped exercise names in the DB', async () => {
		const row = await db.select().from(prescriptions).where(eq(prescriptions.id, prescriptionId)).get();
		const names = row!.payload.exercises.map((e) => e.name.toLowerCase());
		// Squat and Bench Press should be replaced — neither original name should appear
		expect(names).not.toContain('squat');
		expect(names).not.toContain('bench press');
		// isolated Dumbbell Curl should be untouched
		expect(names).toContain('dumbbell curl');
	});
});

// ---------------------------------------------------------------------------
// skipped prescription — no rewrite
// ---------------------------------------------------------------------------

describe('rewrite — skipped prescription is not modified', () => {
	const email = testEmail();
	let cookie = '';
	let userId = '';
	let prescriptionId: number;

	beforeAll(async () => {
		({ userId, cookie } = await register(email));
		prescriptionId = await insertPrescription(userId, STRENGTH_PAYLOAD);
		await db.update(prescriptions).set({ status: 'skipped' }).where(eq(prescriptions.id, prescriptionId));
	});
	afterAll(() => cleanupUser(email));

	it('returns rewritten: false for skipped prescriptions', async () => {
		const res = await post('/api/prescriptions/rewrite', {
			prescriptionId,
			recovery: { sleepHours: 2, subjectiveReadiness: 1 },
			upcomingEvents: []
		}, cookie);
		const body = await res.json() as { rewritten: boolean };
		expect(body.rewritten).toBe(false);
	});

	it('status remains skipped in the DB', async () => {
		const row = await db.select().from(prescriptions).where(eq(prescriptions.id, prescriptionId)).get();
		expect(row?.status).toBe('skipped');
	});
});

// ---------------------------------------------------------------------------
// ownership — cannot rewrite another user's prescription
// ---------------------------------------------------------------------------

describe('rewrite — user cannot rewrite another user\'s prescription', () => {
	const emailA = testEmail();
	const emailB = testEmail();
	let cookieB = '';
	let prescriptionIdA: number;

	beforeAll(async () => {
		const a = await register(emailA);
		prescriptionIdA = await insertPrescription(a.userId, STRENGTH_PAYLOAD);
		({ cookie: cookieB } = await register(emailB));
	});
	afterAll(async () => {
		await cleanupUser(emailA);
		await cleanupUser(emailB);
	});

	it('returns rewritten: false when prescriptionId belongs to a different user', async () => {
		const res = await post('/api/prescriptions/rewrite', {
			prescriptionId: prescriptionIdA,
			recovery: { sleepHours: 2, subjectiveReadiness: 1 },
			upcomingEvents: []
		}, cookieB);
		expect(res.status).toBe(200);
		const body = await res.json() as { rewritten: boolean };
		expect(body.rewritten).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// upcoming event trigger
// ---------------------------------------------------------------------------

describe('rewrite — upcoming event trigger', () => {
	const email = testEmail();
	let cookie = '';
	let userId = '';

	beforeAll(async () => {
		({ userId, cookie } = await register(email));
	});
	afterAll(() => cleanupUser(email));

	function hoursFromNow(h: number) {
		return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
	}

	it('triggers for high-intensity event within 48h', async () => {
		const prescriptionId = await insertPrescription(userId, STRENGTH_PAYLOAD);
		const res = await post('/api/prescriptions/rewrite', {
			prescriptionId,
			recovery: { sleepHours: null, subjectiveReadiness: null },
			upcomingEvents: [{ startsAt: hoursFromNow(12), intensityRating: 9, sport: 'marathon' }]
		}, cookie);
		const body = await res.json() as { rewritten: boolean; reason: string };
		expect(body.rewritten).toBe(true);
		expect(body.reason).toContain('marathon');
	});

	it('does not trigger for low-intensity event within 48h', async () => {
		const prescriptionId = await insertPrescription(userId, STRENGTH_PAYLOAD);
		const res = await post('/api/prescriptions/rewrite', {
			prescriptionId,
			recovery: { sleepHours: null, subjectiveReadiness: null },
			upcomingEvents: [{ startsAt: hoursFromNow(12), intensityRating: 4, sport: 'yoga' }]
		}, cookie);
		const body = await res.json() as { rewritten: boolean };
		expect(body.rewritten).toBe(false);
	});

	it('does not trigger for event beyond 48h', async () => {
		const prescriptionId = await insertPrescription(userId, STRENGTH_PAYLOAD);
		const res = await post('/api/prescriptions/rewrite', {
			prescriptionId,
			recovery: { sleepHours: null, subjectiveReadiness: null },
			upcomingEvents: [{ startsAt: hoursFromNow(72), intensityRating: 10, sport: 'triathlon' }]
		}, cookie);
		const body = await res.json() as { rewritten: boolean };
		expect(body.rewritten).toBe(false);
	});
});
