import Dexie, { type EntityTable } from 'dexie';
import type { PrescriptionPayload } from '$lib/db/schema.js';

export type LocalWorkout = {
	id: string;
	userId: string;
	prescriptionId: number | null;
	gearProfileId: number | null;
	startedAt: string;
	endedAt: string | null;
	notes: string | null;
	rawInput: string | null;
	synced: boolean;
	createdAt: number;
};

export type LocalSet = {
	id: string;
	workoutId: string;
	userId: string;
	exerciseId: string;
	exerciseName: string;
	setIndex: number;
	reps: number | null;
	loadKg: number | null;
	durationSeconds: number | null;
	distanceMeters: number | null;
	rpe: number | null;
	setType: 'working' | 'warmup' | 'dropset' | 'failure' | 'amrap';
	rawInput: string | null;
	loggedAt: string;
	synced: boolean;
	createdAt: number;
};

export type LocalPrescription = {
	id: number;
	userId: string;
	date: string;
	gearProfileId: number | null;
	algorithmVersion: string;
	payload: PrescriptionPayload;
	status: 'pending' | 'accepted' | 'modified' | 'skipped';
	generatedAt: number;
};

export type LocalRecovery = {
	id: number;
	userId: string;
	date: string;
	sleepHours: number | null;
	subjectiveReadiness: number | null;
	notes: string | null;
};

class WorkoutDB extends Dexie {
	workouts!: EntityTable<LocalWorkout, 'id'>;
	sets!: EntityTable<LocalSet, 'id'>;
	prescriptions!: EntityTable<LocalPrescription, 'id'>;
	recovery!: EntityTable<LocalRecovery, 'id'>;

	constructor() {
		super('workout-app-v1');

		this.version(1).stores({
			// only indexed fields listed; dexie stores the full object
			workouts: 'id, userId, startedAt, synced',
			sets: 'id, workoutId, userId, exerciseId, loggedAt, synced, [workoutId+setIndex]'
		});

		this.version(2).stores({
			workouts: 'id, userId, startedAt, synced',
			sets: 'id, workoutId, userId, exerciseId, loggedAt, synced, [workoutId+setIndex]',
			prescriptions: 'id, userId, date',
			recovery: 'id, userId, date'
		});
	}
}

export const localDb = new WorkoutDB();

export async function getUnsyncedWorkouts(): Promise<LocalWorkout[]> {
	return localDb.workouts.where('synced').equals(0).toArray();
}

export async function getUnsyncedSets(): Promise<LocalSet[]> {
	return localDb.sets.where('synced').equals(0).toArray();
}

export async function markWorkoutsSynced(ids: string[]): Promise<void> {
	await localDb.workouts.where('id').anyOf(ids).modify({ synced: true });
}

export async function markSetsSynced(ids: string[]): Promise<void> {
	await localDb.sets.where('id').anyOf(ids).modify({ synced: true });
}
