import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$db/client.js';
import { eventsCalendar } from '$db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const events = await db
		.select()
		.from(eventsCalendar)
		.where(eq(eventsCalendar.userId, locals.user.id))
		.orderBy(desc(eventsCalendar.startsAt))
		.limit(60)
		.all();

	return { events };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const startsAt = data.get('startsAt');
		const durationMinutes = data.get('durationMinutes');
		const sport = data.get('sport');
		const intensityRating = data.get('intensityRating');
		const label = data.get('label');
		const notes = data.get('notes');

		if (typeof startsAt !== 'string' || !startsAt)
			return fail(400, { error: 'Start date/time is required.' });
		if (typeof sport !== 'string' || !sport)
			return fail(400, { error: 'Sport is required.' });

		const duration = durationMinutes ? parseInt(durationMinutes as string, 10) : 60;
		const intensity = intensityRating ? parseInt(intensityRating as string, 10) : null;

		if (isNaN(duration) || duration < 1) return fail(400, { error: 'Duration must be at least 1 minute.' });
		if (intensity !== null && (isNaN(intensity) || intensity < 1 || intensity > 10)) {
			return fail(400, { error: 'Intensity must be between 1 and 10.' });
		}

		await db.insert(eventsCalendar).values({
			userId: locals.user.id,
			startsAt,
			durationMinutes: duration,
			sport,
			intensityRating: intensity,
			label: typeof label === 'string' && label ? label : null,
			notes: typeof notes === 'string' && notes ? notes : null
		});

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const id = data.get('id');
		if (typeof id !== 'string') return fail(400, { error: 'Missing id.' });

		await db
			.delete(eventsCalendar)
			.where(eq(eventsCalendar.id, parseInt(id, 10)));

		return { success: true };
	}
};
