const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
	testDir: './tests/e2e',
	timeout: 30_000,
	workers: 1,
	// Retry in CI so a single transient Playground hiccup (e.g. a slow
	// wp-admin boot on a loaded runner) self-heals instead of failing the
	// whole smoke job. Runs against an ephemeral WordPress, so retries are safe.
	retries: process.env.CI ? 2 : 0,
	expect: {
		timeout: 30_000,
	},
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8881',
		headless: true,
	},
});
