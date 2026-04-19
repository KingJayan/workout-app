// @vitest-environment happy-dom
// require a browser-like env

import { describe, it, expect, beforeEach } from 'vitest';

import { localDb, getUnsyncedWorkouts, getUnsyncedSets, markWorkoutsSynced, markSetsSynced } from '$lib/db/local.js';
import { writeWorkout, writeSet, writeSets, deleteWorkout, deleteSet, getWorkout, getSetsForWorkout } from '$lib/db/write.js';
import type { LocalWorkout, LocalSet } from '$lib/db/local.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function uid() {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function workout(overrides: Partial<LocalWorkout> = {}): LocalWorkout {
	return {
		id: `w-${uid()}`,
		userId: 'u-test',
		prescriptionId: null,
		gearProfileId: null,
		startedAt: new Date().toISOString(),
		endedAt: null,
		notes: null,
		rawInput: null,
		synced: false,
		createdAt: Date.now(),
		...overrides
	};
}

function set(workoutId: string, idx = 0, overrides: Partial<LocalSet> = {}): LocalSet {
	return {
		id: `s-${uid()}`,
		workoutId,
		userId: 'u-test',
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
		createdAt: Date.now(),
		...overrides
	};
}

beforeEach(async () => {
	await localDb.workouts.clear();
	await localDb.sets.clear();
});

// ---------------------------------------------------------------------------
// writeWorkout / getWorkout
// ---------------------------------------------------------------------------

describe('writeWorkout / getWorkout', () => {
	it('stores and retrieves a workout by id', async () => {
		const w = workout();
		await writeWorkout(w);
		const retrieved = await getWorkout(w.id);
		expect(retrieved).toBeDefined();
		expect(retrieved?.id).toBe(w.id);
		expect(retrieved?.userId).toBe('u-test');
	});

	it('returns undefined for a non-existent id', async () => {
		const result = await getWorkout('does-not-exist');
		expect(result).toBeUndefined();
	});

	it('overwrites an existing workout on put (upsert semantics)', async () => {
		const w = workout();
		await writeWorkout(w);
		await writeWorkout({ ...w, notes: 'updated notes' });
		const result = await getWorkout(w.id);
		expect(result?.notes).toBe('updated notes');
	});
});

// ---------------------------------------------------------------------------
// writeSet / getSetsForWorkout
// ---------------------------------------------------------------------------

describe('writeSet / getSetsForWorkout', () => {
	it('stores a set and retrieves it by workoutId', async () => {
		const w = workout();
		await writeWorkout(w);
		const s = set(w.id, 0);
		await writeSet(s);
		const results = await getSetsForWorkout(w.id);
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe(s.id);
	});

	it('returns sets sorted by setIndex', async () => {
		const w = workout();
		await writeWorkout(w);
		const s2 = set(w.id, 2);
		const s0 = set(w.id, 0);
		const s1 = set(w.id, 1);
		await writeSet(s2);
		await writeSet(s0);
		await writeSet(s1);
		const results = await getSetsForWorkout(w.id);
		expect(results.map((s) => s.setIndex)).toEqual([0, 1, 2]);
	});

	it('returns empty array for a workout with no sets', async () => {
		const w = workout();
		await writeWorkout(w);
		const results = await getSetsForWorkout(w.id);
		expect(results).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// writeSets (bulk)
// ---------------------------------------------------------------------------

describe('writeSets — bulk put', () => {
	it('writes multiple sets in one call', async () => {
		const w = workout();
		await writeWorkout(w);
		const s0 = set(w.id, 0);
		const s1 = set(w.id, 1);
		const s2 = set(w.id, 2);
		await writeSets([s0, s1, s2]);
		const results = await getSetsForWorkout(w.id);
		expect(results).toHaveLength(3);
	});

	it('is idempotent — calling twice does not duplicate', async () => {
		const w = workout();
		await writeWorkout(w);
		const s = set(w.id, 0);
		await writeSets([s]);
		await writeSets([s]);
		const results = await getSetsForWorkout(w.id);
		expect(results).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// deleteWorkout — cascades to sets
// ---------------------------------------------------------------------------

describe('deleteWorkout', () => {
	it('removes the workout', async () => {
		const w = workout();
		await writeWorkout(w);
		await deleteWorkout(w.id);
		expect(await getWorkout(w.id)).toBeUndefined();
	});

	it('cascades and removes all child sets', async () => {
		const w = workout();
		await writeWorkout(w);
		await writeSets([set(w.id, 0), set(w.id, 1), set(w.id, 2)]);
		await deleteWorkout(w.id);
		const remaining = await getSetsForWorkout(w.id);
		expect(remaining).toHaveLength(0);
	});

	it('does not affect sets belonging to other workouts', async () => {
		const w1 = workout();
		const w2 = workout();
		await writeWorkout(w1);
		await writeWorkout(w2);
		await writeSet(set(w1.id, 0));
		await writeSet(set(w2.id, 0));

		await deleteWorkout(w1.id);
		const w2Sets = await getSetsForWorkout(w2.id);
		expect(w2Sets).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// deleteSet
// ---------------------------------------------------------------------------

describe('deleteSet', () => {
	it('removes only the targeted set', async () => {
		const w = workout();
		await writeWorkout(w);
		const s0 = set(w.id, 0);
		const s1 = set(w.id, 1);
		await writeSets([s0, s1]);
		await deleteSet(s0.id);
		const remaining = await getSetsForWorkout(w.id);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe(s1.id);
	});
});

// ---------------------------------------------------------------------------
// getUnsyncedWorkouts / getUnsyncedSets
// ---------------------------------------------------------------------------

describe('getUnsyncedWorkouts', () => {
	it('returns only workouts where synced is false', async () => {
		const unsynced = workout({ synced: false });
		const synced = workout({ synced: true });
		await writeWorkout(unsynced);
		await writeWorkout(synced);
		const results = await getUnsyncedWorkouts();
		const ids = results.map((w) => w.id);
		expect(ids).toContain(unsynced.id);
		expect(ids).not.toContain(synced.id);
	});

	it('returns empty array when all workouts are synced', async () => {
		await writeWorkout(workout({ synced: true }));
		const results = await getUnsyncedWorkouts();
		expect(results).toHaveLength(0);
	});
});

describe('getUnsyncedSets', () => {
	it('returns only sets where synced is false', async () => {
		const w = workout();
		await writeWorkout(w);
		const unsynced = set(w.id, 0, { synced: false });
		const synced = set(w.id, 1, { synced: true });
		await writeSets([unsynced, synced]);
		const results = await getUnsyncedSets();
		const ids = results.map((s) => s.id);
		expect(ids).toContain(unsynced.id);
		expect(ids).not.toContain(synced.id);
	});
});

// ---------------------------------------------------------------------------
// markWorkoutsSynced / markSetsSynced
// ---------------------------------------------------------------------------

describe('markWorkoutsSynced', () => {
	it('marks targeted workouts as synced', async () => {
		const w1 = workout({ synced: false });
		const w2 = workout({ synced: false });
		await writeWorkout(w1);
		await writeWorkout(w2);
		await markWorkoutsSynced([w1.id]);
		const unsynced = await getUnsyncedWorkouts();
		const ids = unsynced.map((w) => w.id);
		expect(ids).not.toContain(w1.id);
		expect(ids).toContain(w2.id);
	});

	it('is a no-op for unknown ids', async () => {
		await expect(markWorkoutsSynced(['non-existent-id'])).resolves.not.toThrow();
	});
});

describe('markSetsSynced', () => {
	it('marks targeted sets as synced', async () => {
		const w = workout();
		await writeWorkout(w);
		const s1 = set(w.id, 0, { synced: false });
		const s2 = set(w.id, 1, { synced: false });
		await writeSets([s1, s2]);
		await markSetsSynced([s1.id]);
		const unsynced = await getUnsyncedSets();
		const ids = unsynced.map((s) => s.id);
		expect(ids).not.toContain(s1.id);
		expect(ids).toContain(s2.id);
	});
});
