/**
 * Deprecation fixture regression test.
 *
 * Borges is a static-save block: its markup is baked into post content, and the
 * editor re-validates that markup against `save()` every time a post is opened.
 * When `save()` changes, previously saved posts only keep working because an
 * entry in `deprecated` still reproduces the old markup byte-for-byte. Break one
 * of those and every affected post shows "Attempt Block Recovery" — the worst
 * regression this plugin can ship, and one no unit test of `save()` in isolation
 * can catch.
 *
 * This test runs the real Gutenberg block registry: it registers the block with
 * its current `save` plus the full `deprecated` chain, then parses committed
 * markup fixtures — one per shipped save() shape — and asserts each still
 * validates.
 *
 * The fixtures are FROZEN ON DISK deliberately. Generating them at test time
 * from the same `deprecated` array under test would be circular: editing a
 * deprecation would rewrite its own expectation and the test would still pass,
 * which is precisely the regression it exists to catch.
 *
 * Adding a deprecation:
 *   1. Add the entry to src/deprecated.js.
 *   2. Regenerate: BORGES_WRITE_DEPRECATION_FIXTURES=1 npm test -- deprecation-fixtures
 *   3. Review the new file, and confirm the pre-existing files are UNCHANGED.
 *      A diff in an existing fixture means you altered history, not added to it.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from 'fs';
import { join } from 'path';
import {
	createBlock,
	getBlockTypes,
	parse,
	registerBlockType,
	serialize,
	unregisterBlockType,
} from '@wordpress/blocks';

import metadata from '../block.json';
import save from './save';
import { deprecated } from './deprecated';

// The real useBlockProps.save() is editor-side; in Node it only contributes the
// generated class name, which is what the saved markup actually carries.
jest.mock(
	'@wordpress/block-editor',
	() => ({
		useBlockProps: {
			save: () => ({
				className: 'wp-block-bibliography-builder-bibliography',
			}),
		},
	}),
	{ virtual: true }
);

const FIXTURE_DIR = join(__dirname, '..', 'tests', 'fixtures', 'deprecations');
const WRITE_MODE = Boolean(process.env.BORGES_WRITE_DEPRECATION_FIXTURES);

/**
 * Attributes exercised by every fixture.
 *
 * Deliberately not the defaults: a heading, two citations that sort differently
 * from their input order (so the `migrate`-bearing deprecations actually do
 * something), and every metadata output enabled so JSON-LD, COinS and CSL-JSON
 * all appear in the markup.
 *
 * One `formattedText` carries a literal URL. `linkVisibleUrls` splits the
 * rendered citation text on URL substrings — it never reads the CSL `URL` field
 * — so without a URL in the text itself the `linkVisibleUrls: true` and `false`
 * deprecations serialize identically on that dimension and the fixtures cannot
 * catch a regression in link rendering.
 *
 * `outputCiteExport` is on for the same reason. `deprecated[0]` exists purely to
 * freeze the shape from before per-entry cite/export panels were added, so with
 * the panels off it and the current `save()` emit identical markup — and
 * breaking or deleting that entry would leave its fixture validating against the
 * current save anyway, silently uncovering the newest compatibility boundary.
 */
const FIXTURE_ATTRIBUTES = {
	citationStyle: 'chicago-notes-bibliography',
	headingText: 'References',
	outputJsonLd: true,
	outputCoins: true,
	outputCslJson: true,
	outputCiteExport: true,
	bibliographyId: 'bib-fixture',
	citations: [
		{
			id: 'zeta2020',
			csl: {
				id: 'zeta2020',
				type: 'article-journal',
				title: 'Zeta: a later work that sorts second',
				'container-title': 'Journal of Block Testing',
				volume: '4',
				issue: '2',
				page: '10-20',
				URL: 'https://example.com/zeta',
				author: [{ family: 'Zeta', given: 'Zoe' }],
				issued: { 'date-parts': [[2020]] },
			},
			formattedText:
				'Zeta, Zoe. "Zeta: a later work that sorts second." Journal of Block Testing 4, no. 2 (2020): 10-20. https://example.com/zeta.',
			displayOverride: null,
		},
		{
			id: 'alpha2018',
			csl: {
				id: 'alpha2018',
				type: 'book',
				title: 'Alpha: an earlier work that sorts first',
				publisher: 'Test University Press',
				'publisher-place': 'Cambridge',
				author: [{ family: 'Alpha', given: 'Ada' }],
				issued: { 'date-parts': [[2018]] },
			},
			formattedText:
				'Alpha, Ada. Alpha: an earlier work that sorts first. Cambridge: Test University Press, 2018.',
			displayOverride: null,
		},
	],
};

/**
 * Register the block under a throwaway name with a specific save implementation,
 * serialize one instance, then unregister. Used only to mint fixtures.
 *
 * @param {Function} saveImplementation The save function to serialize with.
 * @return {string} Serialized block markup.
 */
function serializeWith(saveImplementation) {
	const name = metadata.name;
	if (getBlockTypes().some((type) => type.name === name)) {
		unregisterBlockType(name);
	}
	registerBlockType(name, {
		...metadata,
		save: saveImplementation,
	});
	const markup = serialize(createBlock(name, FIXTURE_ATTRIBUTES));
	unregisterBlockType(name);
	return markup;
}

/**
 * Register the block as it actually ships: current save plus deprecations.
 */
function registerCurrentBlock() {
	const name = metadata.name;
	if (getBlockTypes().some((type) => type.name === name)) {
		unregisterBlockType(name);
	}
	registerBlockType(name, {
		...metadata,
		save,
		deprecated,
	});
}

/**
 * Run `fn` with the console muted.
 *
 * Walking the deprecation chain is a normal part of parsing older markup:
 * Gutenberg tries the current save first, logs a full validation diff when it
 * does not match, then falls through to the deprecation that does. For a
 * passing run that is tens of kilobytes of expected noise per fixture. Failures
 * still surface through the assertions.
 *
 * @param {Function} fn Function to run.
 * @return {*} Whatever `fn` returns.
 */
/* eslint-disable no-console -- swapping the console methods out is the point. */
function withMutedConsole(fn) {
	const saved = {
		error: console.error,
		warn: console.warn,
		info: console.info,
		log: console.log,
		groupCollapsed: console.groupCollapsed,
		groupEnd: console.groupEnd,
	};
	Object.keys(saved).forEach((method) => {
		console[method] = () => {};
	});
	try {
		return fn();
	} finally {
		Object.assign(console, saved);
	}
}
/* eslint-enable no-console */

function fixtureName(index) {
	// Oldest deprecation first, so the numbering is chronological rather than
	// tied to the array order (which is newest-first by Gutenberg convention).
	const total = deprecated.length;
	return `v${String(total - index).padStart(2, '0')}-deprecated.html`;
}

const CURRENT_FIXTURE = 'v00-current.html';

if (WRITE_MODE) {
	describe('deprecation fixtures (write mode)', () => {
		it('writes a fixture for the current save and every deprecation', () => {
			if (!existsSync(FIXTURE_DIR)) {
				mkdirSync(FIXTURE_DIR, { recursive: true });
			}

			const written = [];

			const currentPath = join(FIXTURE_DIR, CURRENT_FIXTURE);
			writeFileSync(currentPath, `${serializeWith(save).trim()}\n`);
			written.push(CURRENT_FIXTURE);

			deprecated.forEach((entry, index) => {
				const name = fixtureName(index);
				writeFileSync(
					join(FIXTURE_DIR, name),
					`${serializeWith(entry.save).trim()}\n`
				);
				written.push(name);
			});

			// eslint-disable-next-line no-console
			console.log(
				`Wrote ${
					written.length
				} fixtures to tests/fixtures/deprecations:\n  ${written.join(
					'\n  '
				)}`
			);
			expect(written).toHaveLength(deprecated.length + 1);
		});
	});
} else {
	describe('deprecation fixtures', () => {
		beforeEach(() => {
			registerCurrentBlock();
		});

		afterEach(() => {
			const name = metadata.name;
			if (getBlockTypes().some((type) => type.name === name)) {
				unregisterBlockType(name);
			}
		});

		it('has a committed fixture for the current save and every deprecation', () => {
			const expectedCount = deprecated.length + 1;
			const files = existsSync(FIXTURE_DIR)
				? readdirSync(FIXTURE_DIR).filter((file) =>
						file.endsWith('.html')
				  )
				: [];

			expect(files).toHaveLength(expectedCount);
		});

		it('has no two fixtures with identical markup', () => {
			// Structural guard on the fixture data. Two identical fixtures mean
			// their save() shapes do not differ under FIXTURE_ATTRIBUTES, so
			// breaking or deleting one of those deprecations still leaves its
			// fixture validating against another entry and the regression goes
			// unnoticed. Catches the whole class rather than one instance:
			// outputCiteExport: false previously made the current save and
			// deprecated[0] byte-identical.
			const files = readdirSync(FIXTURE_DIR).filter((file) =>
				file.endsWith('.html')
			);
			const byContent = new Map();
			files.forEach((file) => {
				const body = readFileSync(join(FIXTURE_DIR, file), 'utf8');
				byContent.set(body, [...(byContent.get(body) || []), file]);
			});
			const duplicates = [...byContent.values()].filter(
				(group) => group.length > 1
			);

			expect(duplicates).toEqual([]);
		});

		it('covers both sides of the linkVisibleUrls split', () => {
			// Guards the fixture data itself, not the block. If a future edit
			// drops the literal URL from FIXTURE_ATTRIBUTES, the
			// linkVisibleUrls: true and false deprecations start serializing
			// identically on that dimension and the fixtures quietly stop
			// covering link rendering. Assert the two shapes still differ.
			const files = readdirSync(FIXTURE_DIR).filter((file) =>
				file.endsWith('.html')
			);
			const withAnchor = files.filter((file) =>
				readFileSync(join(FIXTURE_DIR, file), 'utf8').includes(
					'<a href'
				)
			);

			expect(withAnchor.length).toBeGreaterThan(0);
			expect(withAnchor.length).toBeLessThan(files.length);
		});

		const cases = [
			{ label: 'current save()', file: CURRENT_FIXTURE },
			...deprecated.map((entry, index) => ({
				label: `deprecation ${
					deprecated.length - index
				} (index ${index})`,
				file: fixtureName(index),
			})),
		];

		it.each(cases)('markup saved by $label still validates', ({ file }) => {
			const path = join(FIXTURE_DIR, file);
			expect(existsSync(path)).toBe(true);

			const markup = readFileSync(path, 'utf8');
			const blocks = withMutedConsole(() => parse(markup));

			expect(blocks).toHaveLength(1);
			const [block] = blocks;

			// An unregistered block parses as core/missing and would report
			// "valid" vacuously, so assert identity before validity.
			expect(block.name).toBe(metadata.name);
			expect(block.isValid).toBe(true);
			expect(block.attributes.citations).toHaveLength(2);
		});
	});
}
