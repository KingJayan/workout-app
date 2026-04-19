import { db } from '$db/client.js';
import { prescriptions, gearProfiles, users } from '$db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { GearProfile, PrescriptionExercise, PrescriptionPayload, RewriteThresholds } from '$db/schema.js';

export type RecoverySnapshot = {
	sleepHours: number | null;
	subjectiveReadiness: number | null; // 1–10
};

export type UpcomingEvent = {
	startsAt: string; // ISO datetime
	intensityRating: number | null; // 1–10
	sport: string;
};

export type RewriteContext = {
	userId: string;
	prescriptionId: number;
	recovery: RecoverySnapshot;
	upcomingEvents: UpcomingEvent[];
};

export type RewriteResult = {
	rewritten: boolean;
	reason: string | null;
	setsDropped: number;
	exercisesSwapped: number;
	noAlternativeFound: boolean;
};

// compound barbell movements that get swapped under fatigue
const COMPOUND_BARBELL: ReadonlySet<string> = new Set([
	'squat',
	'back squat',
	'front squat',
	'deadlift',
	'romanian deadlift',
	'rdl',
	'bench press',
	'overhead press',
	'ohp',
	'barbell row',
	'power clean',
	'hang clean',
	'snatch'
]);

// fallback isolated alternatives by muscle-group keyword, keyed to gear availability
type AlternativeMap = {
	requires: keyof GearProfile;
	name: string;
};

const COMPOUND_ALTERNATIVES: Record<string, AlternativeMap[]> = {
	squat: [
		{ requires: 'hasMachines', name: 'Leg Press' },
		{ requires: 'hasDumbbells', name: 'Goblet Squat' }
	],
	'back squat': [
		{ requires: 'hasMachines', name: 'Leg Press' },
		{ requires: 'hasDumbbells', name: 'Goblet Squat' }
	],
	'front squat': [
		{ requires: 'hasMachines', name: 'Leg Press' },
		{ requires: 'hasDumbbells', name: 'Goblet Squat' }
	],
	deadlift: [
		{ requires: 'hasMachines', name: 'Leg Curl' },
		{ requires: 'hasDumbbells', name: 'Dumbbell RDL' }
	],
	'romanian deadlift': [
		{ requires: 'hasMachines', name: 'Leg Curl' },
		{ requires: 'hasDumbbells', name: 'Dumbbell RDL' }
	],
	rdl: [
		{ requires: 'hasMachines', name: 'Leg Curl' },
		{ requires: 'hasDumbbells', name: 'Dumbbell RDL' }
	],
	'bench press': [
		{ requires: 'hasMachines', name: 'Chest Press Machine' },
		{ requires: 'hasDumbbells', name: 'Dumbbell Fly' },
		{ requires: 'hasCable', name: 'Cable Fly' }
	],
	'overhead press': [
		{ requires: 'hasDumbbells', name: 'Dumbbell Lateral Raise' },
		{ requires: 'hasCable', name: 'Cable Lateral Raise' }
	],
	ohp: [
		{ requires: 'hasDumbbells', name: 'Dumbbell Lateral Raise' },
		{ requires: 'hasCable', name: 'Cable Lateral Raise' }
	],
	'barbell row': [
		{ requires: 'hasCable', name: 'Seated Cable Row' },
		{ requires: 'hasDumbbells', name: 'Dumbbell Row' },
		{ requires: 'hasMachines', name: 'Machine Row' }
	],
	'power clean': [
		{ requires: 'hasDumbbells', name: 'Dumbbell Shrug' },
		{ requires: 'hasCable', name: 'Cable Pull-Through' }
	],
	'hang clean': [
		{ requires: 'hasDumbbells', name: 'Dumbbell Shrug' },
		{ requires: 'hasCable', name: 'Cable Pull-Through' }
	],
	snatch: [
		{ requires: 'hasDumbbells', name: 'Dumbbell Shrug' },
		{ requires: 'hasCable', name: 'Cable Pull-Through' }
	]
};

type FatigueTrigger = {
	triggered: boolean;
	setDropPct: number; // 0–1 fraction of working sets to drop
	swapCompounds: boolean;
	reason: string | null;
};

// rules engine — add new rules here without touching the mutation logic below
function evaluateTriggers(
	recovery: RecoverySnapshot,
	upcomingEvents: UpcomingEvent[],
	nowMs: number,
	thresholds: RewriteThresholds = {}
): FatigueTrigger {
	const minSleep = thresholds.minSleepHours ?? 6;
	const eventWindow = (thresholds.eventWindowHours ?? 48) * 60 * 60 * 1000;
	const eventIntensityMin = thresholds.eventIntensityMin ?? 7;
	const triggers: FatigueTrigger[] = [];

	// rule: poor sleep
	if (recovery.sleepHours !== null && recovery.sleepHours < minSleep) {
		const deficit = minSleep - recovery.sleepHours;
		// scale drop: 10% per hour under 6, capped at 40%
		triggers.push({
			triggered: true,
			setDropPct: Math.min(deficit * 0.1, 0.4),
			swapCompounds: deficit >= 2,
			reason: `sleep ${recovery.sleepHours}h (under ${minSleep}h threshold)`
		});
	}

	// rule: low subjective readiness
	if (recovery.subjectiveReadiness !== null && recovery.subjectiveReadiness <= 4) {
		triggers.push({
			triggered: true,
			setDropPct: 0.2,
			swapCompounds: recovery.subjectiveReadiness <= 3,
			reason: `readiness ${recovery.subjectiveReadiness}/10`
		});
	}

	// rule: high-exertion event within configured window
	const windowEnd = nowMs + eventWindow;
	for (const ev of upcomingEvents) {
		const evMs = new Date(ev.startsAt).getTime();
		if (evMs > nowMs && evMs <= windowEnd && (ev.intensityRating ?? 0) >= eventIntensityMin) {
			triggers.push({
				triggered: true,
				setDropPct: 0.25,
				swapCompounds: true,
				reason: `${ev.sport} event (intensity ${ev.intensityRating}/10) within 48h`
			});
		}
	}

	if (triggers.length === 0) {
		return { triggered: false, setDropPct: 0, swapCompounds: false, reason: null };
	}

	// merge: take max set drop, OR swap flags, join reasons
	const setDropPct = Math.min(Math.max(...triggers.map((t) => t.setDropPct)), 0.5);
	const swapCompounds = triggers.some((t) => t.swapCompounds);
	const reason = triggers.map((t) => t.reason).join('; ');

	return { triggered: true, setDropPct, swapCompounds, reason };
}

function pickAlternative(
	exerciseName: string,
	gear: GearProfile
): string | null {
	const key = exerciseName.toLowerCase().trim();
	const alts = COMPOUND_ALTERNATIVES[key];
	if (!alts) return null;
	const available = alts.find((a) => gear[a.requires] === true);
	return available?.name ?? null;
}

function applyRewrite(
	payload: PrescriptionPayload,
	trigger: FatigueTrigger,
	gear: GearProfile | null
): { payload: PrescriptionPayload; setsDropped: number; exercisesSwapped: number; noAlternativeFound: boolean } {
	let setsDropped = 0;
	let exercisesSwapped = 0;
	let noAlternativeFound = false;

	const exercises: PrescriptionExercise[] = payload.exercises.map((ex) => {
		let { sets, name } = ex;
		const isCompound = COMPOUND_BARBELL.has(name.toLowerCase().trim());

		// drop working sets proportionally (minimum 1 set preserved)
		const drop = Math.round(sets * trigger.setDropPct);
		const newSets = Math.max(1, sets - drop);
		setsDropped += sets - newSets;

		// swap compound → isolated if gear permits
		let newName = name;
		if (trigger.swapCompounds && isCompound) {
			if (gear) {
				const alt = pickAlternative(name, gear);
				if (alt) {
					newName = alt;
					exercisesSwapped++;
				} else {
					noAlternativeFound = true;
				}
			} else {
				noAlternativeFound = true;
			}
		}

		return { ...ex, sets: newSets, name: newName };
	});

	const newVolumeLoad = exercises.reduce((acc, ex) => {
		const reps = Array.isArray(ex.repsTarget)
			? (ex.repsTarget[0] + ex.repsTarget[1]) / 2
			: ex.repsTarget;
		return acc + ex.sets * reps * (ex.loadKg ?? 0);
	}, 0);

	return {
		payload: { ...payload, exercises, targetVolumeLoad: newVolumeLoad },
		setsDropped,
		exercisesSwapped,
		noAlternativeFound
	};
}

export async function rewritePrescription(ctx: RewriteContext): Promise<RewriteResult> {
	const nowMs = Date.now();

	const userRow = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, ctx.userId)).get();
	const thresholds = userRow?.preferences?.rewriteThresholds ?? {};

	const trigger = evaluateTriggers(ctx.recovery, ctx.upcomingEvents, nowMs, thresholds);
	if (!trigger.triggered) {
		return { rewritten: false, reason: null, setsDropped: 0, exercisesSwapped: 0, noAlternativeFound: false };
	}

	const prescription = await db
		.select()
		.from(prescriptions)
		.where(and(eq(prescriptions.id, ctx.prescriptionId), eq(prescriptions.userId, ctx.userId)))
		.get();

	if (!prescription || prescription.status === 'skipped') {
		return { rewritten: false, reason: null, setsDropped: 0, exercisesSwapped: 0, noAlternativeFound: false };
	}

	let gear: GearProfile | null = null;
	if (prescription.gearProfileId) {
		gear = await db
			.select()
			.from(gearProfiles)
			.where(eq(gearProfiles.id, prescription.gearProfileId))
			.get() ?? null;
	}

	const { payload, setsDropped, exercisesSwapped, noAlternativeFound } = applyRewrite(
		prescription.payload,
		trigger,
		gear
	);

	await db
		.update(prescriptions)
		.set({ payload, status: 'modified', algorithmVersion: '1.1' })
		.where(eq(prescriptions.id, ctx.prescriptionId));

	return { rewritten: true, reason: trigger.reason, setsDropped, exercisesSwapped, noAlternativeFound };
}
