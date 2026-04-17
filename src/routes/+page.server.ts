import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	return {
		today: new Date().toISOString().slice(0, 10),
		parserTemplate: '[sets]x[reps] [weight] @[rpe]'
	};
};
