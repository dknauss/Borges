/**
 * The Playground demo page (playground/demo-content.json) promises that each
 * sample works and that the example bibliographies open without unsaved
 * changes. These tests hold it to that, and keep the generated blueprints in
 * sync with their source.
 */

import { parsePastedInput, extractEmbeddedIdentifier } from './lib/parser';
import { computeExportStrings } from './hooks/compute-export-strings';

// No network: every resolver fails, so an identifier sample surfaces the error
// of the backend it was routed to. BibTeX and free text parse locally.
jest.mock('@wordpress/api-fetch', () =>
	jest.fn(() => Promise.reject(new Error('offline')))
);
jest.mock('@citation-js/plugin-doi', () => ({}));

const demo = require('../playground/demo-content.json');
const { buildBlueprints } = require('../scripts/build-playground-blueprints');

const offlineFetch = () => Promise.reject(new Error('offline'));

const BACKEND_ERRORS = {
	doi: /DOI/,
	pmid: /PMID/,
	pmcid: /PMCID/,
	arxiv: /arXiv/,
	isbn: /ISBN/,
};

const samples = demo.sampleGroups.flatMap((group) =>
	group.samples.map((sample) => [group.title, sample])
);

describe('Playground demo samples', () => {
	it('covers every supported input format', () => {
		const formats = new Set(samples.map(([, sample]) => sample.format));

		expect([...formats].sort()).toEqual(
			[
				'arxiv',
				'bibtex',
				'doi',
				'freetext',
				'isbn',
				'pmcid',
				'pmid',
			].sort()
		);
	});

	it('fits in a single paste', () => {
		expect(samples.length).toBeLessThanOrEqual(50);
	});

	const LOCAL_FORMATS = ['bibtex', 'freetext'];

	it.each(
		samples.filter(
			([, s]) => !s.embedded && LOCAL_FORMATS.includes(s.format)
		)
	)('%s: %p parses locally', async (group, { format, input }) => {
		const result = await parsePastedInput(input, undefined, {
			fetchFn: offlineFetch,
		});

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].inputFormat).toBe(format);
	});

	it.each(
		samples.filter(
			([, s]) => !s.embedded && !LOCAL_FORMATS.includes(s.format)
		)
	)('%s: %p reaches its resolver', async (group, { format, input }) => {
		const result = await parsePastedInput(input, undefined, {
			fetchFn: offlineFetch,
		});

		expect(result.entries).toEqual([]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatch(BACKEND_ERRORS[format]);
	});

	it.each(samples.filter(([, s]) => s.embedded))(
		'%s: %p is looked up by its embedded identifier',
		async (group, { format, input }) => {
			expect(extractEmbeddedIdentifier(input)).toMatchObject({ format });

			// Offline, the lookup fails and the citation text still parses.
			const result = await parsePastedInput(input, undefined, {
				fetchFn: offlineFetch,
			});
			expect(result.errors).toEqual([]);
			expect(result.entries).toHaveLength(1);
		}
	);
});

describe('Playground demo examples', () => {
	const withCiteExport = demo.examples.filter(
		(example) => example.attributes.outputCiteExport
	);

	it('has an example with Cite / Export', () => {
		expect(withCiteExport.length).toBeGreaterThan(0);
	});

	it.each(withCiteExport.map((example) => [example.title, example]))(
		'%s stores the export strings the editor computes',
		async (title, example) => {
			expect(example.exports).toEqual(
				await computeExportStrings(
					example.citations,
					example.attributes.citationStyle
				)
			);
		}
	);

	it('stores no export strings where Cite / Export is off', () => {
		demo.examples
			.filter((example) => !example.attributes.outputCiteExport)
			.forEach((example) => expect(example.exports).toBeUndefined());
	});
});

describe('Playground demo blueprints', () => {
	it.each(buildBlueprints().map((blueprint) => [blueprint.file, blueprint]))(
		'%s is built from the current demo content (npm run playground:build)',
		(file, { current, expected }) => {
			expect(current).toBe(expected);
		}
	);
});
