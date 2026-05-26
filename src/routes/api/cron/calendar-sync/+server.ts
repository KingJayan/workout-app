import { json, error } from '@sveltejs/kit';
import { db } from '$db/client.js';
import { googleAccounts } from '$db/schema.js';
import { syncCalendarForUser } from '$lib/google/sync.js';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const auth = request.headers.get('authorization');
	if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
		return error(401, 'unauthorized');
	}

	const accounts = await db.select({ userId: googleAccounts.userId }).from(googleAccounts).all();

	const results: Record<string, unknown> = {};
	for (const { userId } of accounts) {
		try {
			results[userId] = await syncCalendarForUser(userId);
		} catch (e) {
			results[userId] = { error: e instanceof Error ? e.message : String(e) };
		}
	}

	return json(results);
};
