import { json, error } from '@sveltejs/kit';
import { db } from '$db/client.js';
import { googleAccounts } from '$db/schema.js';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return error(401, 'not authenticated');

	await db.delete(googleAccounts).where(eq(googleAccounts.userId, locals.user.id));

	return json({ ok: true });
};
