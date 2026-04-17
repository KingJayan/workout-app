import { Lucia } from 'lucia';
import { db } from '$db/client.js';
import { sessions, users } from '$db/schema.js';
import { eq } from 'drizzle-orm';
import type { Adapter, DatabaseSession, DatabaseUser, RegisteredDatabaseSessionAttributes } from 'lucia';
import type { User } from '$db/schema.js';

const adapter: Adapter = {
	async getSessionAndUser(sessionId) {
		const row = await db
			.select()
			.from(sessions)
			.innerJoin(users, eq(sessions.userId, users.id))
			.where(eq(sessions.id, sessionId))
			.get();
		if (!row) return [null, null];
		const session: DatabaseSession = {
			id: row.sessions.id,
			userId: row.sessions.userId,
			expiresAt: new Date(row.sessions.expiresAt * 1000),
			attributes: {} as RegisteredDatabaseSessionAttributes
		};
		const user: DatabaseUser = {
			id: row.users.id,
			attributes: { email: row.users.email, displayName: row.users.displayName }
		};
		return [session, user];
	},

	async getUserSessions(userId) {
		const rows = await db.select().from(sessions).where(eq(sessions.userId, userId)).all();
		return rows.map((s) => ({
			id: s.id,
			userId: s.userId,
			expiresAt: new Date(s.expiresAt * 1000),
			attributes: {} as RegisteredDatabaseSessionAttributes
		}));
	},

	async setSession(session) {
		await db.insert(sessions).values({
			id: session.id,
			userId: session.userId,
			expiresAt: Math.floor(session.expiresAt.getTime() / 1000)
		});
	},

	async updateSessionExpiration(sessionId, expiresAt) {
		await db
			.update(sessions)
			.set({ expiresAt: Math.floor(expiresAt.getTime() / 1000) })
			.where(eq(sessions.id, sessionId));
	},

	async deleteSession(sessionId) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
	},

	async deleteUserSessions(userId) {
		await db.delete(sessions).where(eq(sessions.userId, userId));
	},

	async deleteExpiredSessions() {
		await db
			.delete(sessions)
			.where(eq(sessions.expiresAt, Math.floor(Date.now() / 1000)));
	}
};

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		attributes: {
			secure: process.env.NODE_ENV === 'production'
		}
	},
	getUserAttributes(attrs) {
		return {
			email: attrs.email,
			displayName: attrs.displayName
		};
	}
});

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: Pick<User, 'email' | 'displayName'>;
	}
}
