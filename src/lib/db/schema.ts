import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
	'users',
	{
		id: text('id').primaryKey(),
		authProvider: text('auth_provider').notNull().default('email'),
		authProviderId: text('auth_provider_id').notNull(),
		email: text('email').notNull(),
		displayName: text('display_name'),
		preferences: text('preferences', { mode: 'json' }).$type<UserPreferences>().default({}),
		parserTemplate: text('parser_template'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(t) => [uniqueIndex('users_email_uidx').on(t.email)]
);

export type RewriteThresholds = {
	minSleepHours?: number;       // default 6
	eventWindowHours?: number;    // default 48
	eventIntensityMin?: number;   // default 7
};

export type UserPreferences = {
	timezone?: string;
	units?: 'metric' | 'imperial';
	weekStartsOn?: 0 | 1;
	theme?: 'light' | 'dark' | 'system';
	rewriteThresholds?: RewriteThresholds;
};

export const recoveryMetrics = sqliteTable(
	'recovery_metrics',
	{
		id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// yyyy-mm-dd
		date: text('date').notNull(),
		sleepHours: real('sleep_hours'),
		// 1–10
		subjectiveReadiness: integer('subjective_readiness'),
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(t) => [uniqueIndex('recovery_metrics_user_date_uidx').on(t.userId, t.date)]
);

export const gearProfiles = sqliteTable('gear_profiles', {
	id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	hasBarbell: integer('has_barbell', { mode: 'boolean' }).notNull().default(false),
	hasCable: integer('has_cable', { mode: 'boolean' }).notNull().default(false),
	hasMachines: integer('has_machines', { mode: 'boolean' }).notNull().default(false),
	hasDumbbells: integer('has_dumbbells', { mode: 'boolean' }).notNull().default(false),
	hasKettlebells: integer('has_kettlebells', { mode: 'boolean' }).notNull().default(false),
	hasPullupBar: integer('has_pullup_bar', { mode: 'boolean' }).notNull().default(false),
	hasBands: integer('has_bands', { mode: 'boolean' }).notNull().default(false),
	isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
});

export const googleAccounts = sqliteTable(
	'google_accounts',
	{
		id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		googleUserId: text('google_user_id').notNull(),
		email: text('email').notNull(),
		accessToken: text('access_token').notNull(),
		refreshToken: text('refresh_token').notNull(),
		tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp_ms' }).notNull(),
		scopes: text('scopes').notNull(),
		lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
		syncError: text('sync_error'),
		syncErrorAt: integer('sync_error_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(t) => [uniqueIndex('google_accounts_user_uidx').on(t.userId)]
);

export const googleCalendars = sqliteTable(
	'google_calendars',
	{
		id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		googleAccountId: integer('google_account_id')
			.notNull()
			.references(() => googleAccounts.id, { onDelete: 'cascade' }),
		calendarId: text('calendar_id').notNull(),
		summary: text('summary'),
		syncToken: text('sync_token'),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(t) => [uniqueIndex('google_calendars_user_cal_uidx').on(t.userId, t.calendarId)]
);

export const eventsCalendar = sqliteTable('events_calendar', {
	id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	startsAt: text('starts_at').notNull(),
	durationMinutes: integer('duration_minutes').notNull(),
	sport: text('sport').notNull(),
	intensityRating: integer('intensity_rating'),
	label: text('label'),
	notes: text('notes'),
	source: text('source', { enum: ['local', 'google'] }).notNull().default('local'),
	externalId: text('external_id'),
	googleCalendarId: text('google_calendar_id'),
	googleUpdatedAt: text('google_updated_at'),
	syncStatus: text('sync_status', { enum: ['synced', 'pending', 'conflict'] }),
	affectsTraining: integer('affects_training', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
});

export const prescriptions = sqliteTable('prescriptions', {
	id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	date: text('date').notNull(),
	gearProfileId: integer('gear_profile_id').references(() => gearProfiles.id, {
		onDelete: 'set null'
	}),
	algorithmVersion: text('algorithm_version').notNull().default('1.0'),
	payload: text('payload', { mode: 'json' }).$type<PrescriptionPayload>().notNull(),
	status: text('status', { enum: ['pending', 'accepted', 'modified', 'skipped'] })
		.notNull()
		.default('pending'),
	generatedAt: integer('generated_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
},
	(t) => [index('prescriptions_user_date_idx').on(t.userId, t.date)]
);

export type PrescriptionExercise = {
	exerciseId: string;
	name: string;
	sets: number;
	repsTarget: number | [number, number]; // exact or [min, max] range
	loadKg: number | null;
	rpe?: number;
	notes?: string;
};

export type PrescriptionPayload = {
	sessionType: string;
	targetVolumeLoad: number;
	exercises: PrescriptionExercise[];
};

export const workouts = sqliteTable('workouts', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	prescriptionId: integer('prescription_id').references(() => prescriptions.id, {
		onDelete: 'set null'
	}),
	gearProfileId: integer('gear_profile_id').references(() => gearProfiles.id, {
		onDelete: 'set null'
	}),
	startedAt: text('started_at').notNull(),
	endedAt: text('ended_at'),
	notes: text('notes'),
	rawInput: text('raw_input'),
	synced: integer('synced', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
});

export const sets = sqliteTable('sets', {
	id: text('id').primaryKey(),
	workoutId: text('workout_id')
		.notNull()
		.references(() => workouts.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	exerciseId: text('exercise_id').notNull(),
	exerciseName: text('exercise_name').notNull(),
	setIndex: integer('set_index').notNull(),
	reps: integer('reps'),
	loadKg: real('load_kg'),
	durationSeconds: integer('duration_seconds'),
	distanceMeters: real('distance_meters'),
	rpe: real('rpe'),
	setType: text('set_type', { enum: ['working', 'warmup', 'dropset', 'failure', 'amrap'] })
		.notNull()
		.default('working'),
	rawInput: text('raw_input'),
	loggedAt: text('logged_at').notNull(),
	synced: integer('synced', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'number' }).notNull()
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RecoveryMetric = typeof recoveryMetrics.$inferSelect;
export type NewRecoveryMetric = typeof recoveryMetrics.$inferInsert;
export type GearProfile = typeof gearProfiles.$inferSelect;
export type NewGearProfile = typeof gearProfiles.$inferInsert;
export type EventCalendar = typeof eventsCalendar.$inferSelect;
export type NewEventCalendar = typeof eventsCalendar.$inferInsert;
export type GoogleAccount = typeof googleAccounts.$inferSelect;
export type NewGoogleAccount = typeof googleAccounts.$inferInsert;
export type GoogleCalendar = typeof googleCalendars.$inferSelect;
export type NewGoogleCalendar = typeof googleCalendars.$inferInsert;
export type Prescription = typeof prescriptions.$inferSelect;
export type NewPrescription = typeof prescriptions.$inferInsert;
export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type Set = typeof sets.$inferSelect;
export type NewSet = typeof sets.$inferInsert;
