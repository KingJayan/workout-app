import { db } from '$db/client.js';
import { sets, workouts } from '$db/schema.js';
import { eq, and, gte } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const userId = locals.user.id;
	const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	const rows = await db
		.select({
			date: workouts.startedAt,
			loadKg: sets.loadKg,
			reps: sets.reps,
			workoutId: sets.workoutId
		})
		.from(sets)
		.innerJoin(workouts, eq(sets.workoutId, workouts.id))
		.where(and(eq(sets.userId, userId), gte(workouts.startedAt, since)))
		.all();

	const byDate: Record<string, { volumeLoad: number; sets: number; sessions: Set<string> }> = {};
	for (const r of rows) {
		const date = r.date.slice(0, 10);
		if (!byDate[date]) byDate[date] = { volumeLoad: 0, sets: 0, sessions: new Set() };
		byDate[date].volumeLoad += (r.loadKg ?? 0) * (r.reps ?? 0);
		byDate[date].sets++;
		byDate[date].sessions.add(r.workoutId);
	}

	const days = Object.entries(byDate)
		.map(([date, v]) => ({ date, volumeLoad: Math.round(v.volumeLoad), sets: v.sets, sessions: v.sessions.size }))
		.sort((a, b) => a.date.localeCompare(b.date));

	const totalVolume = days.reduce((acc, d) => acc + d.volumeLoad, 0);
	const totalSets = days.reduce((acc, d) => acc + d.sets, 0);

	return { days, totalVolume, totalSets, sessionCount: days.length };
};
