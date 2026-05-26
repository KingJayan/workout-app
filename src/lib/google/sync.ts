import { db } from '$db/client.js';
import { googleAccounts, googleCalendars, eventsCalendar } from '$db/schema.js';
import type { NewEventCalendar } from '$db/schema.js';
import { eq, and } from 'drizzle-orm';
import { ensureFreshToken } from './auth.js';
import { listCalendars, listEvents } from './calendar.js';
import type { GoogleEvent } from './calendar.js';

function mapEvent(ev: GoogleEvent, calId: string, userId: string): NewEventCalendar {
	const startDt = ev.start.dateTime ?? `${ev.start.date}T00:00:00`;
	const endDt = ev.end?.dateTime ?? `${ev.end?.date}T00:00:00`;
	const durationMs = new Date(endDt).getTime() - new Date(startDt).getTime();
	const durationMinutes = ev.start.date && !ev.start.dateTime ? 1440 : Math.max(1, Math.round(durationMs / 60000));

	return {
		userId,
		startsAt: startDt,
		durationMinutes,
		sport: ev.summary ?? 'event',
		label: ev.summary ?? null,
		source: 'google',
		externalId: ev.id,
		googleCalendarId: calId,
		googleUpdatedAt: ev.updated,
		syncStatus: 'synced',
		affectsTraining: false
	};
}

export type SyncResult = { imported: number; updated: number; errors: string[] };

export async function syncCalendarForUser(userId: string): Promise<SyncResult> {
	let imported = 0;
	let updated = 0;
	const errors: string[] = [];

	const account = await db
		.select()
		.from(googleAccounts)
		.where(eq(googleAccounts.userId, userId))
		.get();

	if (!account) return { imported: 0, updated: 0, errors: ['no google account'] };

	let accessToken: string;
	try {
		accessToken = await ensureFreshToken(account.id);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await db.update(googleAccounts).set({ syncError: msg, syncErrorAt: new Date() }).where(eq(googleAccounts.id, account.id));
		return { imported: 0, updated: 0, errors: [msg] };
	}

	const savedCals = await db
		.select()
		.from(googleCalendars)
		.where(and(eq(googleCalendars.userId, userId), eq(googleCalendars.enabled, true)))
		.all();

	if (savedCals.length === 0) {
		const remoteCals = await listCalendars(accessToken).catch(() => []);
		for (const rc of remoteCals) {
			const exists = await db
				.select({ id: googleCalendars.id })
				.from(googleCalendars)
				.where(and(eq(googleCalendars.userId, userId), eq(googleCalendars.calendarId, rc.id)))
				.get();
			if (!exists) {
				await db.insert(googleCalendars).values({
					userId,
					googleAccountId: account.id,
					calendarId: rc.id,
					summary: rc.summary,
					enabled: true
				});
			}
		}
		savedCals.push(
			...(await db
				.select()
				.from(googleCalendars)
				.where(and(eq(googleCalendars.userId, userId), eq(googleCalendars.enabled, true)))
				.all())
		);
	}

	for (const cal of savedCals) {
		try {
			let result: Awaited<ReturnType<typeof listEvents>>;
			try {
				result = await listEvents(accessToken, cal.calendarId, {
					syncToken: cal.syncToken,
					timeMin: cal.syncToken ? undefined : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
				});
			} catch (e) {
				if ((e as { code?: number }).code === 410) {
					await db.update(googleCalendars).set({ syncToken: null }).where(eq(googleCalendars.id, cal.id));
					result = await listEvents(accessToken, cal.calendarId, {
						timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
					});
				} else throw e;
			}

			for (const ev of result.items) {
				const existing = await db
					.select({ id: eventsCalendar.id })
					.from(eventsCalendar)
					.where(and(eq(eventsCalendar.userId, userId), eq(eventsCalendar.externalId, ev.id)))
					.get();

				if (ev.status === 'cancelled') {
					if (existing) {
						await db.delete(eventsCalendar).where(eq(eventsCalendar.id, existing.id));
					}
					continue;
				}

				const row = mapEvent(ev, cal.calendarId, userId);
				if (existing) {
					await db.update(eventsCalendar).set(row).where(eq(eventsCalendar.id, existing.id));
					updated++;
				} else {
					await db.insert(eventsCalendar).values(row);
					imported++;
				}
			}

			if (result.nextSyncToken) {
				await db.update(googleCalendars).set({ syncToken: result.nextSyncToken }).where(eq(googleCalendars.id, cal.id));
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			errors.push(`calendar ${cal.calendarId}: ${msg}`);
		}
	}

	await db
		.update(googleAccounts)
		.set({ lastSyncedAt: new Date(), syncError: null, syncErrorAt: null, updatedAt: new Date() })
		.where(eq(googleAccounts.id, account.id));

	return { imported, updated, errors };
}
