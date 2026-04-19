import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/integration/**/*.test.ts'],
		environment: 'node',
		environmentMatchGlobs: [
			['src/integration/dexie.test.ts', 'happy-dom']
		],
		testTimeout: 15000
	}
});
