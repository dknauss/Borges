/**
 * Real reference-manager exports, run through the real citation-js parser.
 *
 * Unlike the hand-authored files beside it (see
 * `reference-manager-exports.test.js`), every file under `public/` and
 * `contributed/` was written by the exporting application itself. Each one is
 * listed in `manifest.json` with its source, license, and what Borges should
 * make of it: how many entries, how many errors, whether the paste cap cut it
 * short, and the input format the entries report.
 *
 * The suite also snapshots the CSL-JSON each file yields, so a citation-js
 * upgrade or a parser change that alters any field of any record shows up as
 * a snapshot diff to review. To add a file, see the corpus README.
 */
import fs from 'fs';
import path from 'path';

import { parsePastedInput } from './parser';

jest.mock('@wordpress/api-fetch', () => jest.fn());

const CORPUS_DIR = path.join(
	__dirname,
	'__fixtures__',
	'reference-manager-exports'
);
const EXPORT_DIRS = ['public', 'contributed'];
// Notices, docs, and the sample library imported before exporting, which no
// manager wrote and so is not an export.
const NON_EXPORT_FILES = new Set([
	'LICENSE',
	'README.md',
	'.gitkeep',
	'borges-sample.ris',
]);

// A file Borges does not read as BibTeX, RIS, or CSL-JSON can still hold DOIs,
// which the parser looks up online. The corpus pins what Borges makes of
// the file itself, so lookups fail here instead of reaching CrossRef.
const offlineFetch = () =>
	Promise.reject(new Error('No network in the reference-manager corpus'));

const manifest = JSON.parse(
	fs.readFileSync(path.join(CORPUS_DIR, 'manifest.json'), 'utf8')
);

/**
 * List every export file under the corpus directories, relative to the corpus.
 *
 * @param {string} dir Directory relative to the corpus root.
 * @return {string[]} Relative paths, `/`-separated.
 */
function listExportFiles(dir) {
	const absolute = path.join(CORPUS_DIR, dir);

	if (!fs.existsSync(absolute)) {
		return [];
	}

	return fs
		.readdirSync(absolute, { withFileTypes: true })
		.flatMap((dirent) => {
			const relative = `${dir}/${dirent.name}`;

			if (dirent.isDirectory()) {
				return listExportFiles(relative);
			}

			return NON_EXPORT_FILES.has(dirent.name) ? [] : [relative];
		});
}

describe('reference-manager corpus manifest', () => {
	const listed = manifest.files.map((file) => file.path);

	it('lists every export file, and only files that exist', () => {
		const onDisk = EXPORT_DIRS.flatMap(listExportFiles).sort();

		expect([...listed].sort()).toEqual(onDisk);
	});

	it.each(manifest.files)(
		'$path names its source and license',
		({ source, license, licenseFile, manager }) => {
			expect(manager).toEqual(expect.any(String));
			expect(source).toEqual(expect.any(String));
			expect(license).toEqual(expect.any(String));

			// A contributed file falls under the project license, so only a
			// file taken from elsewhere needs its own notice beside it.
			expect(
				!licenseFile ||
					fs.existsSync(path.join(CORPUS_DIR, licenseFile))
			).toBe(true);
		}
	);
});

describe('reference-manager corpus (real citation-js)', () => {
	it.each(manifest.files)('$path', async ({ path: file, expect: want }) => {
		const result = await parsePastedInput(
			fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8'),
			undefined,
			{ fetchFn: offlineFetch }
		);

		expect(result.entries).toHaveLength(want.entries);
		expect(result.errors).toHaveLength(want.errors);
		expect(result.truncated).toBe(want.truncated);
		result.entries.forEach((entry) => {
			expect(entry.inputFormat).toBe(want.inputFormat);
		});
		expect(result.entries.map((entry) => entry.csl)).toMatchSnapshot();
	});
});
