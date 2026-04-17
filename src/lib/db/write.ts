import { localDb, type LocalSet, type LocalWorkout } from './local.js';

export async function writeWorkout(workout: LocalWorkout): Promise<void> {
	await localDb.workouts.put(workout);
}

export async function writeSet(set: LocalSet): Promise<void> {
	await localDb.sets.put(set);
}

export async function writeSets(sets: LocalSet[]): Promise<void> {
	await localDb.sets.bulkPut(sets);
}

export async function deleteWorkout(id: string): Promise<void> {
	await localDb.transaction('rw', [localDb.workouts, localDb.sets], async () => {
		await localDb.sets.where('workoutId').equals(id).delete();
		await localDb.workouts.delete(id);
	});
}

export async function deleteSet(id: string): Promise<void> {
	await localDb.sets.delete(id);
}

export async function getWorkout(id: string): Promise<LocalWorkout | undefined> {
	return localDb.workouts.get(id);
}

export async function getSetsForWorkout(workoutId: string): Promise<LocalSet[]> {
	return localDb.sets.where('workoutId').equals(workoutId).sortBy('setIndex');
}
