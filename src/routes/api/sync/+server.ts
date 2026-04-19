import { json, error } from '@sveltejs/kit';
import { db } from '$db/client.js';
import { workouts, sets } from '$db/schema.js';
import type { RequestHandler } from './$types';
import type { LocalWorkout, LocalSet } from '$db/local.js';

type SyncPayload = {
	workouts: LocalWorkout[];
	sets: LocalSet[];
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return error(401, 'not authenticated');

	let payload: SyncPayload;

	try {
		payload = (await request.json()) as SyncPayload;
	} catch {
		return error(400, 'invalid json');
	}

	if (!Array.isArray(payload.workouts) || !Array.isArray(payload.sets)) {
		return error(400, 'workouts and sets must be arrays');
	}

	// reject any record that doesn't belong to the authenticated user
	const uid = locals.user.id;
	if (payload.workouts.some((w) => w.userId !== uid) || payload.sets.some((s) => s.userId !== uid)) {
		return error(403, 'userId mismatch');
	}

	const syncedWorkoutIds: string[] = [];
	const syncedSetIds: string[] = [];
	const errors: string[] = [];

	await db.transaction(async (tx) => {
		// upsert workouts first so FK constraints on sets pass
		for (const w of payload.workouts) {
			try {
				await tx
					.insert(workouts)
					.values({
						id: w.id,
						userId: w.userId,
						prescriptionId: w.prescriptionId,
						gearProfileId: w.gearProfileId,
						startedAt: w.startedAt,
						endedAt: w.endedAt ?? null,
						notes: w.notes ?? null,
						rawInput: w.rawInput ?? null,
						synced: true
					})
					.onConflictDoUpdate({
						target: workouts.id,
						set: {
							endedAt: w.endedAt ?? null,
							notes: w.notes ?? null,
							rawInput: w.rawInput ?? null,
							synced: true
						}
					});
				syncedWorkoutIds.push(w.id);
			} catch (err) {
				errors.push(`workout ${w.id}: ${err instanceof Error ? err.message : String(err)}`);
				tx.rollback();
				return;
			}
		}

		for (const s of payload.sets) {
			try {
				await tx
					.insert(sets)
					.values({
						id: s.id,
						workoutId: s.workoutId,
						userId: s.userId,
						exerciseId: s.exerciseId,
						exerciseName: s.exerciseName,
						setIndex: s.setIndex,
						reps: s.reps ?? null,
						loadKg: s.loadKg ?? null,
						durationSeconds: s.durationSeconds ?? null,
						distanceMeters: s.distanceMeters ?? null,
						rpe: s.rpe ?? null,
						setType: s.setType,
						rawInput: s.rawInput ?? null,
						loggedAt: s.loggedAt,
						synced: true
					})
					.onConflictDoUpdate({
						target: sets.id,
						set: {
							reps: s.reps ?? null,
							loadKg: s.loadKg ?? null,
							durationSeconds: s.durationSeconds ?? null,
							distanceMeters: s.distanceMeters ?? null,
							rpe: s.rpe ?? null,
							setType: s.setType,
							rawInput: s.rawInput ?? null,
							synced: true
						}
					});
				syncedSetIds.push(s.id);
			} catch (err) {
				errors.push(`set ${s.id}: ${err instanceof Error ? err.message : String(err)}`);
				tx.rollback();
				return;
			}
		}
	});

	return json({ syncedWorkoutIds, syncedSetIds, errors });
};
