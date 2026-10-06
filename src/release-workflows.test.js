const fs = require('fs');
const path = require('path');

const {
	extractChangelogSection,
} = require('../scripts/extract-changelog-section');

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

	test('tag release workflow publishes the CHANGELOG section as the release body', () => {
		const releaseWorkflow = fs.readFileSync(
			path.join(rootDir, '.github/workflows/release.yml'),
			'utf8'
		);

		expect(releaseWorkflow).toContain(
			'node scripts/extract-changelog-section.js "$GITHUB_REF_NAME" > output/release/release-notes.md'
		);
		expect(releaseWorkflow).toContain(
			'body_path: output/release/release-notes.md'
		);
		// The PR list still follows the CHANGELOG section.
		expect(releaseWorkflow).toContain('generate_release_notes: true');
		// Notes are extracted after packaging (which recreates output/release)
		// and before the release is published.
		const extract = releaseWorkflow.indexOf(
			'Extract release notes from CHANGELOG'
		);
		expect(extract).toBeGreaterThan(
			releaseWorkflow.indexOf('Package release zip')
		);
		expect(extract).toBeLessThan(
			releaseWorkflow.indexOf('Create GitHub Release')
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

	describe('extractChangelogSection', () => {
		const changelog = [
			'# Changelog',
			'',
			'## [Unreleased]',
			'',
			'## [1.2.0] - 2026-01-02',
			'',
			'### Added',
			'',
			'- New thing.',
			'',
			'',
			'',
			'### Fixed',
			'',
			'- Old bug.',
			'',
			'## [1.1.0] - 2025-12-01',
			'',
			'- Earlier.',
			'',
		].join('\n');

		test("returns one version's entries, by version or tag name", () => {
			const expected =
				'### Added\n\n- New thing.\n\n### Fixed\n\n- Old bug.';

			expect(extractChangelogSection(changelog, '1.2.0')).toBe(expected);
			expect(extractChangelogSection(changelog, 'v1.2.0')).toBe(expected);
			expect(extractChangelogSection(changelog, 'v1.1.0')).toBe(
				'- Earlier.'
			);
		});

		test('returns null for a missing or empty section', () => {
			expect(extractChangelogSection(changelog, 'v9.9.9')).toBeNull();
			expect(extractChangelogSection(changelog, 'Unreleased')).toBeNull();
			// "1.2" must not match "1.2.0".
			expect(extractChangelogSection(changelog, '1.2')).toBeNull();
		});

		test('finds the current release in the real CHANGELOG', () => {
			const { version } = require('../package.json');
			const real = fs.readFileSync(
				path.join(rootDir, 'CHANGELOG.md'),
				'utf8'
			);

			expect(extractChangelogSection(real, `v${version}`)).toMatch(
				/^### /
			);
		});
	});
});
