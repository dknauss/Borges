#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Print one version's section of CHANGELOG.md, for the GitHub Release body.
 *
 * Usage: node scripts/extract-changelog-section.js 1.8.0 (a leading "v" is
 * dropped, so the tag name works too). Exits non-zero when CHANGELOG.md has
 * no section for that version or the section is empty, so a tag pushed
 * before the release commit dated its CHANGELOG entry fails before anything
 * is published.
 */

const fs = require('fs');
const path = require('path');

const CHANGELOG = path.resolve(__dirname, '..', 'CHANGELOG.md');

/**
 * The body of the `## [version]` section: everything after its heading up to
 * the next `## ` heading, with runs of blank lines collapsed and the ends
 * trimmed.
 *
 * @param {string} changelog CHANGELOG.md contents.
 * @param {string} version   Version, with or without a leading "v".
 * @return {string|null} Section body, or null when there is none.
 */
function extractChangelogSection(changelog, version) {
	const wanted = version.replace(/^v/, '');
	const lines = changelog.split(/\r?\n/);
	const start = lines.findIndex((line) => {
		const match = line.match(/^## \[([^\]]+)\]/);
		return match && match[1] === wanted;
	});

	if (start === -1) {
		return null;
	}

	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => line.startsWith('## '));
	const body = (end === -1 ? rest : rest.slice(0, end))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return body || null;
}

module.exports = { extractChangelogSection };

if (require.main === module) {
	const version = process.argv[2];

	if (!version) {
		console.error('Usage: extract-changelog-section.js <version>');
		process.exit(2);
	}

	const section = extractChangelogSection(
		fs.readFileSync(CHANGELOG, 'utf8'),
		version
	);

	if (!section) {
		console.error(`CHANGELOG.md has no entries for ${version}.`);
		process.exit(1);
	}

	process.stdout.write(`${section}\n`);
}
