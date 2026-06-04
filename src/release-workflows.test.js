const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

describe('release workflows', () => {
	test('tag release workflow dispatches the WordPress.org deploy workflow', () => {
		const releaseWorkflow = fs.readFileSync(
			path.join(rootDir, '.github/workflows/release.yml'),
			'utf8'
		);

		expect(releaseWorkflow).toMatch(/actions:\s+write/u);
		expect(releaseWorkflow).toContain(
			'gh workflow run wp-deploy.yml --ref "$GITHUB_REF_NAME"'
		);
	});

	test('WordPress.org deploy workflow remains manually dispatchable', () => {
		const deployWorkflow = fs.readFileSync(
			path.join(rootDir, '.github/workflows/wp-deploy.yml'),
			'utf8'
		);

		expect(deployWorkflow).toContain('workflow_dispatch:');
		expect(deployWorkflow).toContain(
			'10up/action-wordpress-plugin-deploy@stable'
		);
	});
});
