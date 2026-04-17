import { db } from '$db/client.js';
import { prescriptions, recoveryMetrics, workouts, sets } from '$db/schema.js';
import { eq, and, desc, gte } from 'drizzle-orm';
import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const userId = locals.user.id;
	const today = new Date().toISOString().slice(0, 10);

	const [todayPrescriptions, todayRecovery, recentSets] = await Promise.all([
		db
			.select()
			.from(prescriptions)
			.where(and(eq(prescriptions.userId, userId), eq(prescriptions.date, today)))
			.all(),

		db
			.select()
			.from(recoveryMetrics)
			.where(and(eq(recoveryMetrics.userId, userId), eq(recoveryMetrics.date, today)))
			.get(),

		db
			.select({
				id: sets.id,
				exerciseName: sets.exerciseName,
				setIndex: sets.setIndex,
				reps: sets.reps,
				loadKg: sets.loadKg,
				rpe: sets.rpe,
				setType: sets.setType,
				rawInput: sets.rawInput,
				loggedAt: sets.loggedAt,
				workoutId: sets.workoutId
			})
			.from(sets)
			.innerJoin(workouts, eq(sets.workoutId, workouts.id))
			.where(and(eq(sets.userId, userId), gte(workouts.startedAt, today)))
			.orderBy(desc(sets.loggedAt))
			.limit(50)
			.all()
	]);

	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
	const weekSets = await db
		.select({ loadKg: sets.loadKg, reps: sets.reps, workoutId: sets.workoutId })
		.from(sets)
		.innerJoin(workouts, eq(sets.workoutId, workouts.id))
		.where(and(eq(sets.userId, userId), gte(workouts.startedAt, weekAgo)))
		.all();

	const weekVolumeLoad = weekSets.reduce((acc, s) => acc + (s.loadKg ?? 0) * (s.reps ?? 0), 0);
	const weekSessionCount = new Set(weekSets.map((s) => s.workoutId)).size;

	return json({
		prescriptions: todayPrescriptions,
		recovery: todayRecovery ?? null,
		recentSets,
		stats: {
			volumeLoad: weekVolumeLoad,
			sessionCount: weekSessionCount,
			readiness: todayRecovery?.subjectiveReadiness ?? null,
			sleepHours: todayRecovery?.sleepHours ?? null
		},
		today
	});
};
