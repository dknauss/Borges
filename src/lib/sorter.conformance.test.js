import { SORT_BASELINE_FIXTURES } from './__fixtures__/sort-fixtures';
import { STYLE_DEFINITIONS } from './formatting/style-registry';
import { sortCitations } from './sorter';
import { runCiteprocBibliographyOrder } from './__test-utils__/citeproc-runner';

const EXCLUDED_STYLE_KEYS = {
	ieee: 'Numeric family preserves user order; citeproc-js order is not the product behavior.',
	vancouver:
		'Numeric family preserves user order; citeproc-js order is not the product behavior.',
	oscola: 'OSCOLA lists its tables of cases, legislation, and treaties before the secondary sources (OSCOLA 5 §§1.6–1.7), which CSL cannot express.',
};

const CONFORMANCE_STYLE_KEYS = Object.values( STYLE_DEFINITIONS )
	.filter( ( definition ) => definition.enabled )
	.map( ( definition ) => definition.key )
	.filter( ( styleKey ) => ! ( styleKey in EXCLUDED_STYLE_KEYS ) );

// The bundled CSL styles sort on the raw title, so citeproc-js files "An
// Aardvark Study" under "An" and "A Theory of Sorting" under "A". Borges skips
// a leading A, An, or The, as APA, Chicago, and MLA tell writers to, so these
// two fixtures diverge on purpose. sorter.test.js and case-13 in
// tests/fixtures/sort-coordination/cases.json pin the Borges behavior.
const EXCLUDED_FIXTURE_IDS = {
	'jones-aardvark-2020':
		'Borges skips the leading article; the bundled styles sort on the raw title.',
	'miller-a-theory-2021':
		'Borges skips the leading article; the bundled styles sort on the raw title.',
};

function hasConformanceSortableMetadata( citation ) {
	const csl = citation.csl || {};
	const hasContributor =
		( csl.author && csl.author.length > 0 ) ||
		( csl.editor && csl.editor.length > 0 );
	const hasTitle = typeof csl.title === 'string' && csl.title.trim() !== '';
	const hasYear = Boolean( csl.issued?.[ 'date-parts' ]?.[ 0 ]?.[ 0 ] );

	return hasContributor && hasTitle && hasYear;
}

const CONFORMANCE_FIXTURES = SORT_BASELINE_FIXTURES.filter(
	hasConformanceSortableMetadata
).filter( ( citation ) => ! ( citation.id in EXCLUDED_FIXTURE_IDS ) );

describe( 'sort conformance against citeproc-js', () => {
	it( 'documents and enforces explicit exclusions for non-conformance scope styles', () => {
		expect( Object.keys( EXCLUDED_STYLE_KEYS ).sort() ).toEqual( [
			'ieee',
			'oscola',
			'vancouver',
		] );
	} );

	it( 'documents fixture exclusions that currently diverge from citeproc sort semantics', () => {
		expect( Object.keys( EXCLUDED_FIXTURE_IDS ).sort() ).toEqual( [
			'jones-aardvark-2020',
			'miller-a-theory-2021',
		] );
	} );

	it.each( CONFORMANCE_STYLE_KEYS )(
		'matches citeproc-js bibliography order for %s',
		( styleKey ) => {
			const styleDefinition = STYLE_DEFINITIONS[ styleKey ];
			const cslItems = CONFORMANCE_FIXTURES.map( ( citation ) => ( {
				...citation.csl,
			} ) );
			const borgesOrder = sortCitations(
				CONFORMANCE_FIXTURES,
				styleKey
			).map( ( citation ) => citation.id );
			const referenceOrder = runCiteprocBibliographyOrder( {
				styleKey,
				cslItems,
				locale: styleDefinition.locale,
			} );

			expect( referenceOrder ).toEqual( borgesOrder );
		}
	);
} );
