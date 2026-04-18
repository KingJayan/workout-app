import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { lucia } from '$lib/auth.js';

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		if (locals.session) {
			await lucia.invalidateSession(locals.session.id);
			const blank = lucia.createBlankSessionCookie();
			cookies.set(blank.name, blank.value, { path: '/', ...blank.attributes });
		}
		redirect(302, '/login');
	}
};
