import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
	{
		ignores: ['node_modules/**', '.svelte-kit/**', 'build/**', 'dist/**', 'drizzle/**']
	},
	{
		files: ['**/*.ts'],
		plugins: { '@typescript-eslint': ts },
		languageOptions: { parser: tsParser, parserOptions: { project: './tsconfig.json' } },
		rules: {
			...ts.configs['recommended'].rules,
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn'
		}
	},
	{
		files: ['**/*.svelte'],
		plugins: { svelte, '@typescript-eslint': ts },
		languageOptions: {
			parser: svelteParser,
			parserOptions: { parser: tsParser, project: './tsconfig.json', extraFileExtensions: ['.svelte'] }
		},
		rules: {
			...svelte.configs.recommended.rules
		}
	}
];
