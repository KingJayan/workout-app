export type GoogleCalendarListItem = {
	id: string;
	summary: string;
	accessRole: string;
};

export type GoogleEvent = {
	id: string;
	status: string;
	summary?: string;
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
	updated: string;
};

export type ListEventsResult = {
	items: GoogleEvent[];
	nextSyncToken: string | null;
};

const BASE = 'https://www.googleapis.com/calendar/v3';

export async function listCalendars(accessToken: string): Promise<GoogleCalendarListItem[]> {
	const res = await fetch(`${BASE}/users/me/calendarList`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error(`calendarList failed: ${res.status}`);
	const data = await res.json() as { items: GoogleCalendarListItem[] };
	return data.items ?? [];
}

export async function listEvents(
	accessToken: string,
	calendarId: string,
	opts: { syncToken?: string | null; timeMin?: string; maxResults?: number }
): Promise<ListEventsResult> {
	const items: GoogleEvent[] = [];
	let pageToken: string | undefined;
	let nextSyncToken: string | null = null;

	do {
		const params = new URLSearchParams({ maxResults: String(opts.maxResults ?? 250) });
		if (opts.syncToken) params.set('syncToken', opts.syncToken);
		else if (opts.timeMin) params.set('timeMin', opts.timeMin);
		if (pageToken) params.set('pageToken', pageToken);

		const res = await fetch(
			`${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
			{ headers: { Authorization: `Bearer ${accessToken}` } }
		);

		if (res.status === 410) throw Object.assign(new Error('sync token expired'), { code: 410 });
		if (!res.ok) throw new Error(`listEvents failed: ${res.status}`);

		const data = await res.json() as { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string };
		items.push(...(data.items ?? []));
		pageToken = data.nextPageToken;
		if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
	} while (pageToken);

	return { items, nextSyncToken };
}
