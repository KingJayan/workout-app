const store = new Map<string, { count: number; resetAt: number }>();
const WINDOW = 15 * 60 * 1000;

export function checkRateLimit(ip: string, max: number): boolean {
	const now = Date.now();
	const entry = store.get(ip);
	if (!entry || now > entry.resetAt) {
		store.set(ip, { count: 1, resetAt: now + WINDOW });
		return true;
	}
	if (entry.count >= max) return false;
	entry.count++;
	return true;
}
