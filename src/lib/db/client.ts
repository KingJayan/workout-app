import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

function createDb() {
	const url = process.env.TURSO_DATABASE_URL ?? import.meta.env.TURSO_DATABASE_URL;
	const authToken = process.env.TURSO_AUTH_TOKEN ?? import.meta.env.TURSO_AUTH_TOKEN;

	if (!url) {
		throw new Error('TURSO_DATABASE_URL is not set');
	}

	const client = createClient({ url, authToken });

	return drizzle(client, { schema });
}

let _db: ReturnType<typeof createDb> | undefined;

export const db = new Proxy({} as ReturnType<typeof createDb>, {
	get(_, prop) {
		if (!_db) _db = createDb();
		return (_db as unknown as Record<string | symbol, unknown>)[prop];
	}
});

export type DB = ReturnType<typeof createDb>;
