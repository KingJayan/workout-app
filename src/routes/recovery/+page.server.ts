import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$db/client.js';
import { recoveryMetrics, users } from '$db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const userId = locals.user.id;
	const user = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).get();
	const timezone = user?.preferences?.timezone;
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? 'UTC' }).format(new Date());

	const [todayMetric, recent] = await Promise.all([
		db
			.select()
			.from(recoveryMetrics)
			.where(and(eq(recoveryMetrics.userId, userId), eq(recoveryMetrics.date, today)))
			.get(),
		db
			.select()
			.from(recoveryMetrics)
			.where(eq(recoveryMetrics.userId, userId))
			.orderBy(desc(recoveryMetrics.date))
			.limit(14)
			.all()
	]);

	return { today, todayMetric: todayMetric ?? null, recent };
};

export const actions: Actions = {
	log: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const sleepRaw = data.get('sleepHours');
		const readinessRaw = data.get('subjectiveReadiness');
		const notes = data.get('notes');

		const userId = locals.user.id;
		const user = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).get();
		const timezone = user?.preferences?.timezone;
		const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? 'UTC' }).format(new Date());

		const sleepHours = sleepRaw ? parseFloat(sleepRaw as string) : null;
		const subjectiveReadiness = readinessRaw ? parseInt(readinessRaw as string, 10) : null;

		if (sleepHours !== null && (isNaN(sleepHours) || sleepHours < 0 || sleepHours > 24)) {
			return fail(400, { error: 'Sleep hours must be between 0 and 24.' });
		}
		if (subjectiveReadiness !== null && (isNaN(subjectiveReadiness) || subjectiveReadiness < 1 || subjectiveReadiness > 10)) {
			return fail(400, { error: 'Readiness must be between 1 and 10.' });
		}

		await db
			.insert(recoveryMetrics)
			.values({
				userId: locals.user.id,
				date,
				sleepHours,
				subjectiveReadiness,
				notes: typeof notes === 'string' && notes ? notes : null
			})
			.onConflictDoUpdate({
				target: [recoveryMetrics.userId, recoveryMetrics.date],
				set: { sleepHours, subjectiveReadiness, notes: typeof notes === 'string' && notes ? notes : null }
			});

		return { success: true };
	},

	deleteEntry: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const data = await request.formData();
		const date = data.get('date') as string;
		if (!date) return fail(400, { error: 'Missing date.' });
		await db
			.delete(recoveryMetrics)
			.where(and(eq(recoveryMetrics.userId, locals.user.id), eq(recoveryMetrics.date, date)));
		return { success: true };
	}
};
