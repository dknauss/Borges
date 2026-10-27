/**
 * Shared helpers for the markup-value scripts: a static server for the
 * rendered pages, the corpus and manifest, value normalization, and Zotero's
 * OpenURL reader.
 */

/* global globalThis */

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(TOOL_DIR, 'out');
export const BUILD_DIR = join(TOOL_DIR, '..', '..', 'build');
export const VARIANTS = ['plain', 'borges-default', 'borges-full'];

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.json': 'application/json',
};

/**
 * Serves out/ at the root, and the plugin's build/ at /assets/, the way a
 * WordPress site serves the block's front-end CSS and view script.
 *
 * @return {Promise<{url: string, close: Function}>} Base URL and a closer.
 */
export async function serve() {
	const server = createServer(async (req, res) => {
		const path = normalize(
			decodeURIComponent(new URL(req.url, 'http://x').pathname)
		);
		const file = path.startsWith('/assets/')
			? join(BUILD_DIR, path.slice(8))
			: join(OUT_DIR, path);

		try {
			const body = await readFile(file);
			res.writeHead(200, {
				'content-type':
					TYPES[extname(file)] || 'application/octet-stream',
			});
			res.end(body);
		} catch {
			res.writeHead(404);
			res.end('Not found');
		}
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

	return {
		url: `http://127.0.0.1:${server.address().port}/`,
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}

export async function readJson(path) {
	return JSON.parse(await readFile(path, 'utf8'));
}

export const corpus = () => readJson(join(TOOL_DIR, 'corpus.json'));
export const manifest = () => readJson(join(OUT_DIR, 'manifest.json'));

/**
 * Normalizes a value for comparison: Unicode NFKC, lowercase, dashes as
 * hyphens, curly quotes straightened, whitespace collapsed, and edge
 * punctuation trimmed.
 *
 * @param {*} value Any value.
 * @return {string} Normalized string, '' for empty values.
 */
export function norm(value) {
	if (value === undefined || value === null) {
		return '';
	}

	return String(value)
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[‐-―−]/g, '-')
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/\s+/g, ' ')
		.replace(/^[\s.,;:"']+|[\s.,;:"']+$/g, '');
}

/**
 * ISBN digits only, so hyphenation differences do not count.
 *
 * @param {*} value Raw ISBN, with or without hyphens.
 */
export const isbnDigits = (value) =>
	String(value || '')
		.replace(/[^0-9X]/gi, '')
		.toUpperCase();

/**
 * Approximate LLM tokens: the common four-characters-per-token rule of thumb.
 *
 * @param {string} text Any text.
 */
export const approxTokens = (text) => Math.round(text.length / 4);

/*
 * Zotero's own OpenURL reader, which its browser connector uses for COinS,
 * from github.com/zotero/utilities at a fixed commit. It is AGPL-licensed, so
 * it is downloaded when first needed rather than kept in this repository,
 * the way measure.mjs fetches the schema.org vocabulary. It goes in this
 * folder's node_modules/.cache, where neither git nor the linters look.
 */
const ZOTERO_COMMIT = '4051881d59c6c12d34417d4c226f37218051be90';
const ZOTERO_FILES = ['utilities.js', 'openurl.js', 'xregexp-all.js'];
const ZOTERO_DIR = join(
	TOOL_DIR,
	'node_modules',
	'.cache',
	`zotero-utilities-${ZOTERO_COMMIT}`
);

/**
 * Loads Zotero's OpenURL reader, downloading it on first use.
 *
 * @return {Promise<{parseContextObject: Function}>} Zotero.OpenURL.
 */
export async function zoteroOpenUrl() {
	await mkdir(ZOTERO_DIR, { recursive: true });

	for (const file of ZOTERO_FILES) {
		const path = join(ZOTERO_DIR, file);
		if (!existsSync(path)) {
			const url = `https://raw.githubusercontent.com/zotero/utilities/${ZOTERO_COMMIT}/${file}`;
			const res = await fetch(url);
			if (!res.ok) {
				throw new Error(`Could not download ${url} (${res.status})`);
			}
			await writeFile(path, await res.text());
		}
	}

	// This folder's package.json makes .js files ES modules; Zotero's are CommonJS.
	await writeFile(join(ZOTERO_DIR, 'package.json'), '{"type":"commonjs"}\n');

	const require = createRequire(import.meta.url);
	globalThis.Zotero = globalThis.Zotero || { isNode: true, debug() {} };
	globalThis.Zotero.Utilities = require(join(ZOTERO_DIR, 'utilities.js'));

	return require(join(ZOTERO_DIR, 'openurl.js'));
}

/**
 * The authors Zotero's OpenURL reader imports from one COinS span, in order.
 *
 * @param {{parseContextObject: Function}} openUrl Zotero.OpenURL.
 * @param {string}                         title   The span's title (a KEV string).
 * @return {string[]|null} "Last, First" or "Last", or null when the reader throws.
 */
export function zoteroAuthors(openUrl, title) {
	try {
		return openUrl
			.parseContextObject(title)
			.creators.map((creator) =>
				[creator.lastName, creator.firstName].filter(Boolean).join(', ')
			);
	} catch (error) {
		return null;
	}
}
