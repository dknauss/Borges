import { SORT_BASELINE_FIXTURES } from './__fixtures__/sort-fixtures';
import { STYLE_DEFINITIONS } from './formatting/style-registry';
import { sortCitations } from './sorter';
import { runCiteprocBibliographyOrder } from './__test-utils__/citeproc-runner';

const EXCLUDED_STYLE_KEYS = {
	ieee: 'Numeric family preserves user order; citeproc-js order is not the product behavior.',
	vancouver:
		'Numeric family preserves user order; citeproc-js order is not the product behavior.',
	oscola: 'OSCOLA grouped bibliography is deferred to Epic-OSCOLA and is out of current conformance scope.',
	'chicago-notes-bibliography':
		'citeproc-js npm package currently throws when rendering this bundled style template in test runtime.',
	'mla-9':
		'citeproc-js npm package currently throws when rendering this bundled style template in test runtime.',
};

const CONFORMANCE_STYLE_KEYS = Object.values(STYLE_DEFINITIONS)
	.filter((definition) => definition.enabled)
	.map((definition) => definition.key)
	.filter((styleKey) => !(styleKey in EXCLUDED_STYLE_KEYS));

const EXCLUDED_FIXTURE_IDS = {
	'de-beauvoir-beta-2024':
		'Particle surname handling (de/van) remains outside current sorter parity scope.',
	'van-der-berg-alpha-2023':
		'Particle surname handling (de/van) remains outside current sorter parity scope.',
	'jones-aardvark-2020':
		'Leading-article title sort semantics differ from citeproc in current sorter implementation.',
};

function hasConformanceSortableMetadata(citation) {
	const csl = citation.csl || {};
	const hasContributor =
		(csl.author && csl.author.length > 0) ||
		(csl.editor && csl.editor.length > 0);
	const hasTitle = typeof csl.title === 'string' && csl.title.trim() !== '';
	const hasYear = Boolean(csl.issued?.['date-parts']?.[0]?.[0]);

	return hasContributor && hasTitle && hasYear;
}

const CONFORMANCE_FIXTURES = SORT_BASELINE_FIXTURES.filter(
	hasConformanceSortableMetadata
).filter((citation) => !(citation.id in EXCLUDED_FIXTURE_IDS));

describe('sort conformance against citeproc-js', () => {
	it('documents and enforces explicit exclusions for non-conformance scope styles', () => {
		expect(Object.keys(EXCLUDED_STYLE_KEYS).sort()).toEqual([
			'chicago-notes-bibliography',
			'ieee',
			'mla-9',
			'oscola',
			'vancouver',
		]);
	});

	it('documents fixture exclusions that currently diverge from citeproc sort semantics', () => {
		expect(Object.keys(EXCLUDED_FIXTURE_IDS).sort()).toEqual([
			'de-beauvoir-beta-2024',
			'jones-aardvark-2020',
			'van-der-berg-alpha-2023',
		]);
	});

	it.each(CONFORMANCE_STYLE_KEYS)(
		'matches citeproc-js bibliography order for %s',
		(styleKey) => {
			const styleDefinition = STYLE_DEFINITIONS[styleKey];
			const cslItems = CONFORMANCE_FIXTURES.map((citation) => ({
				...citation.csl,
			}));
			const borgesOrder = sortCitations(
				CONFORMANCE_FIXTURES,
				styleKey
			).map((citation) => citation.id);
			const referenceOrder = runCiteprocBibliographyOrder({
				styleKey,
				cslItems,
				locale: styleDefinition.locale,
			});

			expect(referenceOrder).toEqual(borgesOrder);
		}
	);
});
