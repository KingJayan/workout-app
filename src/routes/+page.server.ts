import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$db/client.js';
import { users } from '$db/schema.js';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const user = await db.select({ parserTemplate: users.parserTemplate })
		.from(users).where(eq(users.id, locals.user.id)).get();

	return {
		today: new Date().toISOString().slice(0, 10),
		parserTemplate: user?.parserTemplate ?? '[sets]x[reps] [weight] @[rpe]'
	};
};
