import {
	getUnsyncedWorkouts,
	getUnsyncedSets,
	markWorkoutsSynced,
	markSetsSynced
} from '$db/local.js';

export type SyncResult = {
	workoutsSynced: number;
	setsSynced: number;
	errors: string[];
};

let syncInFlight = false;

export async function syncNow(): Promise<SyncResult> {
	if (syncInFlight) return { workoutsSynced: 0, setsSynced: 0, errors: [] };
	syncInFlight = true;

	const result: SyncResult = { workoutsSynced: 0, setsSynced: 0, errors: [] };

	try {
		const [workouts, sets] = await Promise.all([getUnsyncedWorkouts(), getUnsyncedSets()]);

		if (workouts.length === 0 && sets.length === 0) return result;

		const res = await fetch('/api/sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ workouts, sets })
		});

		if (!res.ok) {
			const text = await res.text().catch(() => res.statusText);
			result.errors.push(`sync failed: ${res.status} ${text}`);
			return result;
		}

		const { syncedWorkoutIds, syncedSetIds } = (await res.json()) as {
			syncedWorkoutIds: string[];
			syncedSetIds: string[];
		};

		await Promise.all([markWorkoutsSynced(syncedWorkoutIds), markSetsSynced(syncedSetIds)]);

		result.workoutsSynced = syncedWorkoutIds.length;
		result.setsSynced = syncedSetIds.length;
	} catch (err) {
		result.errors.push(err instanceof Error ? err.message : String(err));
	} finally {
		syncInFlight = false;
	}

	return result;
}

// registers an online listener that triggers sync whenever the browser reconnects
export function registerOnlineSync(): () => void {
	const handler = () => { syncNow(); };
	window.addEventListener('online', handler);
	// attempt sync immediately in case we're already online with pending records
	if (navigator.onLine) syncNow();
	return () => window.removeEventListener('online', handler);
}
