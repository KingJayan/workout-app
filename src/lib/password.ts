type BunPasswordAPI = {
	hash(password: string): Promise<string>;
	verify(password: string, hash: string): Promise<boolean>;
};

type BunGlobal = {
	password: BunPasswordAPI;
};

export const bunPassword = (globalThis as typeof globalThis & { Bun: BunGlobal }).Bun.password;