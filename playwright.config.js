const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
	testDir: './tests/e2e',
	timeout: 30_000,
	workers: 1,
	expect: {
		timeout: 30_000,
	},
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8881',
		headless: true,
	},
});
