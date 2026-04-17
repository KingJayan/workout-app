import { json, error } from '@sveltejs/kit';
import { rewritePrescription } from '$lib/rewrite.js';
import type { RequestHandler } from './$types';
import type { RewriteContext } from '$lib/rewrite.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return error(401, 'not authenticated');

	let body: Omit<RewriteContext, 'userId'>;

	try {
		body = await request.json();
	} catch {
		return error(400, 'invalid json');
	}

	if (typeof body.prescriptionId !== 'number') {
		return error(400, 'prescriptionId required');
	}

	const result = await rewritePrescription({
		userId: locals.user.id,
		prescriptionId: body.prescriptionId,
		recovery: body.recovery ?? { sleepHours: null, subjectiveReadiness: null },
		upcomingEvents: body.upcomingEvents ?? []
	});

	return json(result);
};
