/**
 * Runs Lighthouse's SEO and Accessibility categories on each rendered page
 * and writes out/lighthouse.json.
 *
 * Lighthouse's SEO score checks page-level basics (title, meta description,
 * crawlable links, status code, robots, hreflang, canonical, link text). It
 * does not score structured data: its "Structured data is valid" audit is a
 * manual check. So identical scores are the expected result here, and they
 * show that Borges costs nothing on the checks Lighthouse does make.
 *
 * Chromium: CHROMIUM_PATH, else Playwright's, else /opt/pw-browsers/chromium.
 */

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { OUT_DIR, VARIANTS, serve } from './lib.mjs';

const require = createRequire(import.meta.url);

function chromiumPath() {
	if (process.env.CHROMIUM_PATH) {
		return process.env.CHROMIUM_PATH;
	}
	try {
		// Playwright comes from the plugin's own devDependencies, which ships the
		// browser build CI uses.
		// eslint-disable-next-line import/no-extraneous-dependencies
		const path = require('@playwright/test').chromium.executablePath();
		if (existsSync(path)) {
			return path;
		}
	} catch {
		// Fall through to the preinstalled browser.
	}
	return '/opt/pw-browsers/chromium';
}

async function main() {
	const server = await serve();
	const chrome = await chromeLauncher.launch({
		chromePath: chromiumPath(),
		chromeFlags: ['--headless=new', '--no-sandbox'],
	});
	const results = { generated: new Date().toISOString(), variants: {} };

	try {
		for (const name of VARIANTS) {
			const { lhr } = await lighthouse(`${server.url}${name}.html`, {
				port: chrome.port,
				output: 'json',
				logLevel: 'error',
				onlyCategories: ['seo', 'accessibility'],
				formFactor: 'desktop',
				screenEmulation: { disabled: true },
			});
			const failed = (category) =>
				lhr.categories[category].auditRefs
					.map((ref) => lhr.audits[ref.id])
					.filter(
						(audit) =>
							audit.scoreDisplayMode === 'binary' &&
							audit.score !== 1
					)
					.map((audit) => audit.id);

			results.variants[name] = {
				seo: Math.round(lhr.categories.seo.score * 100),
				accessibility: Math.round(
					lhr.categories.accessibility.score * 100
				),
				seoFailed: failed('seo'),
				accessibilityFailed: failed('accessibility'),
				lighthouseVersion: lhr.lighthouseVersion,
			};
			process.stdout.write(
				`${name}: SEO ${results.variants[name].seo}, accessibility ${results.variants[name].accessibility}\n`
			);
		}
	} finally {
		await chrome.kill();
		await server.close();
	}

	await writeFile(
		join(OUT_DIR, 'lighthouse.json'),
		JSON.stringify(results, null, '\t') + '\n'
	);
}

main().catch((error) => {
	process.stderr.write(`${error.stack || error}\n`);
	process.exit(1);
});
