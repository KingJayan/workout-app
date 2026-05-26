import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$db/client.js';
import { googleAccounts, googleCalendars } from '$db/schema.js';
import { eq, and } from 'drizzle-orm';
import { ensureFreshToken } from '$lib/google/auth.js';
import { listCalendars } from '$lib/google/calendar.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const account = await db
		.select()
		.from(googleAccounts)
		.where(eq(googleAccounts.userId, locals.user.id))
		.get();

	if (!account) redirect(302, '/settings');

	const [savedCals, remoteCals] = await Promise.all([
		db.select().from(googleCalendars).where(eq(googleCalendars.userId, locals.user.id)).all(),
		ensureFreshToken(account.id)
			.then((token) => listCalendars(token))
			.catch(() => [] as Awaited<ReturnType<typeof listCalendars>>)
	]);

	const merged = remoteCals.map((rc) => ({
		...rc,
		enabled: savedCals.find((s) => s.calendarId === rc.id)?.enabled ?? true
	}));

	return { account, calendars: merged };
};

export const actions: Actions = {
	toggleCalendar: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const calendarId = data.get('calendarId') as string;
		const enabled = data.get('enabled') === 'true';

		const account = await db
			.select({ id: googleAccounts.id })
			.from(googleAccounts)
			.where(eq(googleAccounts.userId, locals.user.id))
			.get();

		if (!account) redirect(302, '/settings');

		const existing = await db
			.select({ id: googleCalendars.id })
			.from(googleCalendars)
			.where(and(eq(googleCalendars.userId, locals.user.id), eq(googleCalendars.calendarId, calendarId)))
			.get();

		if (existing) {
			await db.update(googleCalendars).set({ enabled }).where(eq(googleCalendars.id, existing.id));
		} else {
			await db.insert(googleCalendars).values({
				userId: locals.user.id,
				googleAccountId: account.id,
				calendarId,
				enabled
			});
		}

		return { ok: true };
	}
};
