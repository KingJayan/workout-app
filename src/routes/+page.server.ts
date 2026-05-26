import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$db/client.js';
import { users } from '$db/schema.js';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const user = await db.select({ parserTemplate: users.parserTemplate, preferences: users.preferences })
		.from(users).where(eq(users.id, locals.user.id)).get();

	const timezone = user?.preferences?.timezone;
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? 'UTC' }).format(new Date());

	return {
		today,
		userId: locals.user.id,
		parserTemplate: user?.parserTemplate ?? '[sets]x[reps] [weight] @[rpe]'
	};
};
