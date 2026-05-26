import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$db/client.js';
import { gearProfiles, users, googleAccounts } from '$db/schema.js';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const [gear, user, googleAccount] = await Promise.all([
		db.select().from(gearProfiles).where(eq(gearProfiles.userId, locals.user.id)).all(),
		db.select().from(users).where(eq(users.id, locals.user.id)).get(),
		db.select({ id: googleAccounts.id, email: googleAccounts.email, lastSyncedAt: googleAccounts.lastSyncedAt, syncError: googleAccounts.syncError })
			.from(googleAccounts).where(eq(googleAccounts.userId, locals.user.id)).get()
	]);

	return { gear, user: user ?? null, googleAccount: googleAccount ?? null };
};

export const actions: Actions = {
	addGear: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const name = data.get('name');
		if (typeof name !== 'string' || !name) return fail(400, { gearError: 'Profile name is required.' });

		const bool = (key: string) => data.get(key) === 'on';

		await db.insert(gearProfiles).values({
			userId: locals.user.id,
			name,
			hasBarbell: bool('hasBarbell'),
			hasCable: bool('hasCable'),
			hasMachines: bool('hasMachines'),
			hasDumbbells: bool('hasDumbbells'),
			hasKettlebells: bool('hasKettlebells'),
			hasPullupBar: bool('hasPullupBar'),
			hasBands: bool('hasBands'),
			isDefault: false
		});

		return { gearSuccess: true };
	},

	deleteGear: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const id = data.get('id');
		if (typeof id !== 'string') return fail(400, { gearError: 'Missing id.' });

		await db
			.delete(gearProfiles)
			.where(and(eq(gearProfiles.id, parseInt(id, 10)), eq(gearProfiles.userId, locals.user.id)));

		return { gearSuccess: true };
	},

	setDefaultGear: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);
		if (isNaN(id)) return fail(400, { gearError: 'Invalid id.' });

		const allGear = await db.select({ id: gearProfiles.id }).from(gearProfiles)
			.where(eq(gearProfiles.userId, locals.user.id)).all();

		await Promise.all(
			allGear.map((g) =>
				db.update(gearProfiles)
					.set({ isDefault: g.id === id })
					.where(eq(gearProfiles.id, g.id))
			)
		);

		return { gearSuccess: true };
	},

	savePrefs: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const units = data.get('units');
		const timezone = data.get('timezone');
		const displayName = data.get('displayName');
		const parserTemplate = data.get('parserTemplate');

		const prefs: Record<string, unknown> = {};
		if (units === 'metric' || units === 'imperial') prefs.units = units;
		if (typeof timezone === 'string' && timezone) prefs.timezone = timezone;

		await db.update(users)
			.set({
				displayName: typeof displayName === 'string' && displayName ? displayName : undefined,
				parserTemplate: typeof parserTemplate === 'string' && parserTemplate ? parserTemplate : undefined,
				preferences: prefs as import('$db/schema.js').UserPreferences
			})
			.where(eq(users.id, locals.user.id));

		return { prefsSuccess: true };
	}
};
