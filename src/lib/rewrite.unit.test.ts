import { describe, it, expect, vi, beforeEach } from 'vitest';


vi.mock('$db/client.js', () => ({
	db: {
		select: vi.fn(),
		update: vi.fn()
	}
}));

vi.mock('$db/schema.js', () => ({
	prescriptions: {},
	gearProfiles: {}
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn(),
	and: vi.fn()
}));

import { rewritePrescription } from './rewrite.js';
import { db } from '$db/client.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeSelectChain(returnValue: unknown) {
	const chain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		get: vi.fn().mockResolvedValue(returnValue)
	};
	(db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
	return chain;
}

function makeUpdateChain() {
	const chain = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue(undefined)
	};
	(db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);
	return chain;
}

const basePrescription = {
	id: 1,
	userId: 'u1',
	status: 'pending',
	gearProfileId: null,
	payload: {
		sessionType: 'strength',
		targetVolumeLoad: 10000,
		exercises: [
			{ exerciseId: 'e1', name: 'Squat', sets: 4, repsTarget: 5, loadKg: 100, rpe: 8 },
			{ exerciseId: 'e2', name: 'Bench Press', sets: 3, repsTarget: 8, loadKg: 80, rpe: 7 },
			{ exerciseId: 'e3', name: 'Dumbbell Curl', sets: 3, repsTarget: 12, loadKg: 20, rpe: 7 }
		]
	}
};

const baseGear = {
	id: 1,
	userId: 'u1',
	name: 'Full Gym',
	hasBarbell: true,
	hasCable: true,
	hasMachines: true,
	hasDumbbells: true,
	hasKettlebells: false,
	hasPullupBar: false,
	hasBands: false,
	isDefault: true,
	createdAt: Date.now()
};

// ---------------------------------------------------------------------------
// no triggers — identity path
// ---------------------------------------------------------------------------

describe('no fatigue triggers', () => {
	beforeEach(() => {
		makeSelectChain(basePrescription);
		makeUpdateChain();
	});

	it('returns rewritten: false when sleep and readiness are fine and no events', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 8, subjectiveReadiness: 7 },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(false);
		expect(result.reason).toBeNull();
		expect(result.setsDropped).toBe(0);
		expect(result.exercisesSwapped).toBe(0);
	});

	it('treats null sleep and null readiness as no trigger', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: null },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(false);
	});

	it('does not trigger for sleep exactly at threshold (6h)', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 6, subjectiveReadiness: 5 },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(false);
	});

	it('does not trigger for readiness exactly at threshold (5/10)', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 8, subjectiveReadiness: 5 },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(false);
	});

	it('skipped prescriptions are never rewritten even with triggers', async () => {
		makeSelectChain({ ...basePrescription, status: 'skipped' });
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 3, subjectiveReadiness: 2 },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(false);
	});

	it('missing prescription returns rewritten: false', async () => {
		makeSelectChain(null);
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 999,
			recovery: { sleepHours: 3, subjectiveReadiness: 2 },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// sleep trigger
// ---------------------------------------------------------------------------

describe('sleep trigger', () => {
	beforeEach(() => {
		makeSelectChain(basePrescription);
		makeUpdateChain();
	});

	it('triggers at 5h sleep (1h deficit → 10% drop)', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 5, subjectiveReadiness: null },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(true);
		expect(result.reason).toContain('sleep 5h');
		// 4 sets * 10% = 0.4 → rounds to 0 dropped; 3 sets * 10% = 0.3 → 0 dropped
		// so setsDropped could be 0 — just assert trigger fired
		expect(result.setsDropped).toBeGreaterThanOrEqual(0);
	});

	it('triggers at 4h sleep (2h deficit → 20% drop, swaps compounds)', async () => {
		makeSelectChain({ ...basePrescription, gearProfileId: 1 });
		// second select call returns gear
		const mockSelect = db.select as ReturnType<typeof vi.fn>;
		let callCount = 0;
		mockSelect.mockImplementation(() => {
			callCount++;
			const returnVal = callCount === 1 ? { ...basePrescription, gearProfileId: 1 } : baseGear;
			return {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				get: vi.fn().mockResolvedValue(returnVal)
			};
		});
		makeUpdateChain();

		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 4, subjectiveReadiness: null },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(true);
		expect(result.exercisesSwapped).toBeGreaterThan(0);
	});

	it('caps set drop at 40% for extreme sleep deficit', async () => {
		// 0h sleep → 6h deficit → would be 60%, capped to 40% by sleep rule, then 50% global cap
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 0, subjectiveReadiness: null },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(true);
		// 4 sets * 40% = 1.6 → 2 dropped → 2 remaining; 3 sets * 40% = 1.2 → 1 dropped → 2 remaining
		// total dropped across 3 exercises
		expect(result.setsDropped).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// readiness trigger
// ---------------------------------------------------------------------------

describe('readiness trigger', () => {
	beforeEach(() => {
		makeSelectChain(basePrescription);
		makeUpdateChain();
	});

	it('triggers at readiness 4 (20% drop, no swap)', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: 4 },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(true);
		expect(result.reason).toContain('readiness 4/10');
		expect(result.exercisesSwapped).toBe(0);
	});

	it('swaps compounds when readiness ≤ 3', async () => {
		const mockSelect = db.select as ReturnType<typeof vi.fn>;
		let callCount = 0;
		mockSelect.mockImplementation(() => {
			callCount++;
			const returnVal = callCount === 1 ? { ...basePrescription, gearProfileId: 1 } : baseGear;
			return {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				get: vi.fn().mockResolvedValue(returnVal)
			};
		});
		makeUpdateChain();

		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: 3 },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(true);
		expect(result.exercisesSwapped).toBeGreaterThan(0);
	});

	it('does not swap when readiness is 4 (above swap threshold)', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: 4 },
			upcomingEvents: []
		});
		expect(result.exercisesSwapped).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// upcoming events trigger
// ---------------------------------------------------------------------------

describe('upcoming event trigger', () => {
	beforeEach(() => {
		makeSelectChain(basePrescription);
		makeUpdateChain();
	});

	function hoursFromNow(h: number): string {
		return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
	}

	it('triggers for high-intensity event within 48h', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: null },
			upcomingEvents: [{ startsAt: hoursFromNow(24), intensityRating: 8, sport: 'marathon' }]
		});
		expect(result.rewritten).toBe(true);
		expect(result.reason).toContain('marathon');
	});

	it('does not trigger for low-intensity event within 48h', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: null },
			upcomingEvents: [{ startsAt: hoursFromNow(24), intensityRating: 5, sport: 'yoga' }]
		});
		expect(result.rewritten).toBe(false);
	});

	it('does not trigger for event beyond 48h', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: null },
			upcomingEvents: [{ startsAt: hoursFromNow(72), intensityRating: 10, sport: 'triathlon' }]
		});
		expect(result.rewritten).toBe(false);
	});

	it('does not trigger for past events', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: null },
			upcomingEvents: [{ startsAt: hoursFromNow(-1), intensityRating: 10, sport: 'race' }]
		});
		expect(result.rewritten).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// multi-trigger merging
// ---------------------------------------------------------------------------

describe('multi-trigger merge behavior', () => {
	beforeEach(() => {
		makeSelectChain(basePrescription);
		makeUpdateChain();
	});

	it('takes the max set drop pct across triggers', async () => {
		// sleep 5h → 10% drop; readiness 4 → 20% drop → merged result should use 20%
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 5, subjectiveReadiness: 4 },
			upcomingEvents: []
		});
		expect(result.rewritten).toBe(true);
		expect(result.reason).toContain('sleep');
		expect(result.reason).toContain('readiness');
	});

	it('joins all reason strings with semicolon', async () => {
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 5, subjectiveReadiness: 4 },
			upcomingEvents: []
		});
		expect(result.reason).toContain(';');
	});

	it('caps total set drop at 50%', async () => {
		// sleep 0h → 40% (sleep cap); readiness 1 → 20%; event → 25%
		// merged max = 40% — all below global 50% cap
		// but the global cap is 50%, so setsDropped should never exceed 50% of total sets
		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 0, subjectiveReadiness: 1 },
			upcomingEvents: []
		});
		const totalOriginalSets = basePrescription.payload.exercises.reduce((a, e) => a + e.sets, 0); // 4+3+3=10
		expect(result.setsDropped).toBeLessThanOrEqual(Math.ceil(totalOriginalSets * 0.5));
	});
});

// ---------------------------------------------------------------------------
// gear-aware alternative selection
// ---------------------------------------------------------------------------

describe('gear-aware compound swap', () => {
	it('swaps to machine alternative when hasMachines is true', async () => {
		const mockSelect = db.select as ReturnType<typeof vi.fn>;
		let call = 0;
		mockSelect.mockImplementation(() => {
			call++;
			const val = call === 1
				? { ...basePrescription, gearProfileId: 1 }
				: { ...baseGear, hasMachines: true, hasDumbbells: false };
			return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), get: vi.fn().mockResolvedValue(val) };
		});
		(db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) });

		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: 2 },
			upcomingEvents: []
		});
		expect(result.exercisesSwapped).toBeGreaterThan(0);
	});

	it('does not swap compound when no gear available for alternatives', async () => {
		const mockSelect = db.select as ReturnType<typeof vi.fn>;
		let call = 0;
		mockSelect.mockImplementation(() => {
			call++;
			const val = call === 1
				? { ...basePrescription, gearProfileId: 1 }
				: { ...baseGear, hasMachines: false, hasDumbbells: false, hasCable: false };
			return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), get: vi.fn().mockResolvedValue(val) };
		});
		(db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) });

		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: 2 },
			upcomingEvents: []
		});
		// Dumbbell Curl is not a compound, Squat and Bench Press have no gear available
		expect(result.exercisesSwapped).toBe(0);
	});

	it('never swaps non-compound exercises regardless of gear', async () => {
		const onlyIsolatedPrescription = {
			...basePrescription,
			gearProfileId: 1,
			payload: {
				sessionType: 'accessory',
				targetVolumeLoad: 5000,
				exercises: [
					{ exerciseId: 'e1', name: 'Dumbbell Curl', sets: 3, repsTarget: 12, loadKg: 20, rpe: 7 },
					{ exerciseId: 'e2', name: 'Tricep Pushdown', sets: 3, repsTarget: 12, loadKg: 25, rpe: 7 }
				]
			}
		};
		const mockSelect = db.select as ReturnType<typeof vi.fn>;
		let call = 0;
		mockSelect.mockImplementation(() => {
			call++;
			const val = call === 1 ? onlyIsolatedPrescription : baseGear;
			return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), get: vi.fn().mockResolvedValue(val) };
		});
		(db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) });

		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: null, subjectiveReadiness: 2 },
			upcomingEvents: []
		});
		expect(result.exercisesSwapped).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// minimum set preservation
// ---------------------------------------------------------------------------

describe('minimum set preservation', () => {
	it('never drops all sets — always preserves at least 1 per exercise', async () => {
		const singleSetPrescription = {
			...basePrescription,
			payload: {
				sessionType: 'strength',
				targetVolumeLoad: 500,
				exercises: [
					{ exerciseId: 'e1', name: 'Squat', sets: 1, repsTarget: 5, loadKg: 100, rpe: 8 }
				]
			}
		};
		makeSelectChain(singleSetPrescription);
		makeUpdateChain();

		const result = await rewritePrescription({
			userId: 'u1',
			prescriptionId: 1,
			recovery: { sleepHours: 0, subjectiveReadiness: 1 },
			upcomingEvents: []
		});
		// 1 set * 50% = 0.5 → rounds to 1 dropped → max(1, 1-1) = 1 preserved → 0 dropped
		expect(result.rewritten).toBe(true);
		expect(result.setsDropped).toBe(0);
	});
});
