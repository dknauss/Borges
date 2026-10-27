/**
 * ESLint flat config.
 *
 * Starts from the `@wordpress/scripts` default and changes only which test
 * rules apply where. The default lints every `*.test.js` and `*.spec.js` file
 * as Vitest, but this repo's unit tests run on Jest. The Playwright specs in
 * `tests/e2e/` keep the Jest rules they were linted with before 37; moving
 * them to `eslint-plugin-playwright` is a separate change. Formatting is still checked by `prettier/prettier`, which
 * runs the repo's own Prettier (see `format:check`).
 */
const globals = require('globals');
const jestPlugin = require('eslint-plugin-jest');
const defaultConfig = require('@wordpress/scripts/config/eslint.config.cjs');

const testFiles = [
	'**/@(test|__tests__|__test-utils__)/**/*.js',
	'**/*.@(test|spec).js',
	'jest.setup.js',
];

/*
 * Drop the default's two Vitest entries: the one that registers the plugin
 * and the one that sets a `vitest/` rule.
 */
const usesVitest = (entry) =>
	Boolean(entry.plugins && entry.plugins.vitest) ||
	Object.keys(entry.rules || {}).some((rule) => rule.startsWith('vitest/'));

const baseConfig = defaultConfig.filter((entry) => !usesVitest(entry));

module.exports = [
	...baseConfig,

	// Jest rules for tests, as `wp-scripts lint-js` applied them before 37.
	{
		...jestPlugin.configs['flat/recommended'],
		files: testFiles,
		languageOptions: {
			globals: {
				...globals.jest,
				...globals.node,
			},
		},
	},
];
