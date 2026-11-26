import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// src/dev/corpus-check.ts is a node-only developer harness: it reads a
		// vault from disk and prints a report. It is never reachable from
		// src/main.ts, so it never ships in main.js. This override has to come
		// after the recommended config, which is what turns those rules on.
		files: ['src/dev/corpus-check.ts'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
			'import/no-extraneous-dependencies': 'off',
			'obsidianmd/rule-custom-message': 'off',
			'obsidianmd/hardcoded-config-path': 'off',
		},
	},
);
