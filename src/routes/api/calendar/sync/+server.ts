import { json, error } from '@sveltejs/kit';
import { db } from '$db/client.js';
import { googleAccounts } from '$db/schema.js';
import { eq } from 'drizzle-orm';
import { syncCalendarForUser } from '$lib/google/sync.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return error(401, 'not authenticated');

	const account = await db
		.select({ id: googleAccounts.id, lastSyncedAt: googleAccounts.lastSyncedAt })
		.from(googleAccounts)
		.where(eq(googleAccounts.userId, locals.user.id))
		.get();

	if (!account) return error(400, 'no google account connected');

	if (account.lastSyncedAt && Date.now() - account.lastSyncedAt.getTime() < 60_000) {
		return error(429, 'synced too recently; wait 60 s');
	}

	const result = await syncCalendarForUser(locals.user.id);
	return json(result);
};
