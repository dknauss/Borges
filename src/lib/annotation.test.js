/**
 * Annotations (CSL `annote`): storage, sanitizing, display paragraphs,
 * exports, and imports through the real citation-js parser.
 */
import {
	getAnnotationParagraphs,
	getAnnotationText,
	getRisAnnotation,
	normalizeAnnotationText,
	setAnnotation,
} from './annotation';
import { validateAndSanitizeCsl } from './csl-sanitize';
import {
	buildBiblatexExportContent,
	buildBibtexExportContent,
	buildCslJsonExportContent,
	buildPlainTextBibliographyContent,
	buildRisExportContent,
	cslToRisEntry,
} from './export';
import { buildCoins } from './coins';
import { cslToJsonLd } from './jsonld';
import { buildManualCsl } from './manual-entry';
import { markBibtexAnnotationParagraphs } from './bibtex-fields';
import { parsePastedInput } from './parser';

jest.mock( '@wordpress/api-fetch', () => jest.fn() );

const BOOK = {
	type: 'book',
	title: 'Ugly Feelings',
	author: [ { family: 'Ngai', given: 'Sianne' } ],
	publisher: 'Harvard University Press',
	issued: { 'date-parts': [ [ 2005 ] ] },
};

async function parseSingle( input ) {
	const result = await parsePastedInput( input );

	expect( result.errors ).toEqual( [] );
	expect( result.entries ).toHaveLength( 1 );

	return result.entries[ 0 ].csl;
}

describe( 'normalizeAnnotationText', () => {
	it( 'keeps plain text with one blank line between paragraphs', () => {
		expect(
			normalizeAnnotationText(
				'  First <b>bold</b> idea.\r\n\r\n\r\n  Second,\nwith a break.  '
			)
		).toBe( 'First bold idea.\n\nSecond,\nwith a break.' );
	} );

	it( 'gives an empty string for anything but text', () => {
		expect( normalizeAnnotationText( 42 ) ).toBe( '' );
		expect( normalizeAnnotationText( null ) ).toBe( '' );
		expect( normalizeAnnotationText( ' \n\n ' ) ).toBe( '' );
	} );
} );

describe( 'setAnnotation and getAnnotationText', () => {
	it( 'sets, replaces, and clears annote without touching the rest', () => {
		const annotated = setAnnotation( BOOK, ' A note. ' );

		expect( annotated ).toEqual( { ...BOOK, annote: 'A note.' } );
		expect( getAnnotationText( annotated ) ).toBe( 'A note.' );
		expect( setAnnotation( annotated, '' ) ).toEqual( BOOK );
		expect( BOOK ).not.toHaveProperty( 'annote' );
	} );

	it( 'reads a missing or non-string annote as empty', () => {
		expect( getAnnotationText( BOOK ) ).toBe( '' );
		expect( getAnnotationText( { ...BOOK, annote: 3 } ) ).toBe( '' );
	} );
} );

describe( 'getAnnotationParagraphs', () => {
	it( 'splits on blank lines and trims each paragraph', () => {
		expect(
			getAnnotationParagraphs( {
				annote: ' One.\r\n \r\nTwo,\nstill two.\n\n\n\nThree. ',
			} )
		).toEqual( [ 'One.', 'Two,\nstill two.', 'Three.' ] );
	} );

	it( 'gives nothing for a missing, empty, or non-string annote', () => {
		expect( getAnnotationParagraphs( BOOK ) ).toEqual( [] );
		expect( getAnnotationParagraphs( { annote: ' \n\n ' } ) ).toEqual( [] );
		expect( getAnnotationParagraphs( { annote: [ 'x' ] } ) ).toEqual( [] );
		expect( getAnnotationParagraphs( undefined ) ).toEqual( [] );
	} );

	it( 'joins paragraphs into one RIS value', () => {
		expect( getRisAnnotation( { annote: 'One\nline.\n\nTwo.' } ) ).toBe(
			'One line. Two.'
		);
		expect( getRisAnnotation( BOOK ) ).toBeUndefined();
	} );
} );

describe( 'validateAndSanitizeCsl keeps annote as plain text', () => {
	it( 'keeps a clean annotation', () => {
		expect(
			validateAndSanitizeCsl( { ...BOOK, annote: 'Read it.\n\nTwice.' } )
				.annote
		).toBe( 'Read it.\n\nTwice.' );
	} );

	it( 'strips markup and normalizes paragraph breaks', () => {
		expect(
			validateAndSanitizeCsl( {
				...BOOK,
				annote: '<p>Read <script>it</script>.</p>\r\n\r\n\r\n<p>Twice.</p>',
			} ).annote
		).toBe( 'Read it.\n\nTwice.' );
	} );

	it( 'drops a non-string or empty annotation instead of refusing the item', () => {
		expect(
			validateAndSanitizeCsl( { ...BOOK, annote: { text: 'x' } } )
		).not.toHaveProperty( 'annote' );
		expect(
			validateAndSanitizeCsl( { ...BOOK, annote: '<b></b> ' } )
		).not.toHaveProperty( 'annote' );
	} );
} );

describe( 'annotation exports', () => {
	const annotated = [
		{
			csl: {
				...BOOK,
				id: 'ngai',
				annote: 'Affect & aesthetics.\n\nOn envy.',
			},
		},
	];

	it( 'adds an N1 line only when asked', () => {
		expect( cslToRisEntry( annotated[ 0 ].csl ) ).not.toContain( 'N1' );
		expect(
			cslToRisEntry( annotated[ 0 ].csl, { annotation: true } )
		).toContain( 'N1  - Affect & aesthetics. On envy.\nER  - ' );
	} );

	it( 'writes N1 in the RIS export', () => {
		expect( buildRisExportContent( annotated, 'apa-7' ) ).toContain(
			'N1  - Affect & aesthetics. On envy.'
		);
	} );

	it( 'keeps annote in the CSL-JSON export', () => {
		expect(
			JSON.parse( buildCslJsonExportContent( annotated, 'apa-7' ) )[ 0 ]
				.annote
		).toBe( 'Affect & aesthetics.\n\nOn envy.' );
	} );

	it( 'writes BibTeX annote and BibLaTeX annotation, paragraphs kept', async () => {
		const bibtex = await buildBibtexExportContent( annotated, 'apa-7' );
		const biblatex = await buildBiblatexExportContent( annotated, 'apa-7' );

		expect( bibtex ).toContain(
			'annote = {Affect \\& aesthetics.\n\nOn envy.}'
		);
		expect( biblatex ).toContain(
			'annotation = {Affect \\& aesthetics.\n\nOn envy.}'
		);
	} );

	it( 'leaves the annotation out of plain text, COinS, and JSON-LD', () => {
		const citation = {
			...annotated[ 0 ],
			formattedText: 'Ngai, Sianne. Ugly Feelings. 2005.',
		};

		expect(
			buildPlainTextBibliographyContent( [ citation ], 'apa-7' )
		).toBe( 'Ngai, Sianne. Ugly Feelings. 2005.\n' );
		expect( buildCoins( citation.csl ) ).not.toMatch( /envy/u );
		expect( JSON.stringify( cslToJsonLd( citation.csl ) ) ).not.toMatch(
			/envy/u
		);
	} );
} );

describe( 'manual entry', () => {
	it( 'stores a typed annotation in annote', () => {
		expect(
			buildManualCsl( {
				type: 'book',
				title: 'Ugly Feelings',
				annotation: '  On envy.\n\n\nOn irritation. ',
			} ).annote
		).toBe( 'On envy.\n\nOn irritation.' );
	} );

	it( 'stores nothing for an empty annotation', () => {
		expect(
			buildManualCsl( {
				type: 'book',
				title: 'Ugly Feelings',
				annotation: '   ',
			} )
		).not.toHaveProperty( 'annote' );
	} );
} );

describe( 'annotation imports (real citation-js)', () => {
	it( 'marks blank lines in annote fields only', () => {
		expect(
			markBibtexAnnotationParagraphs(
				'@book{k,\n  title = {One\n\nTwo},\n  annote = {Three.\n\n  Four.},\n  year = {2001}\n}'
			)
		).toBe(
			'@book{k,\n  title = {One\n\nTwo},\n  annote = {Three. \\par Four.},\n  year = {2001}\n}'
		);
		expect( markBibtexAnnotationParagraphs( 'no entry' ) ).toBe(
			'no entry'
		);
	} );

	it( 'changes only the inside of the annotation value', () => {
		// A blank line after the value, before the closing brace, and between
		// `=` and the value stays as it is, so the entry stays valid BibTeX.
		expect(
			markBibtexAnnotationParagraphs(
				'@book{k,\n  annote = {Note.},\n\n  year = {2001}\n}'
			)
		).toBe( '@book{k,\n  annote = {Note.},\n\n  year = {2001}\n}' );
		expect(
			markBibtexAnnotationParagraphs(
				'@book{k,\n  annote =\n\n  {One.\n\nTwo.}\n\n}'
			)
		).toBe( '@book{k,\n  annote =\n\n  {One. \\par Two.}\n\n}' );
		expect(
			markBibtexAnnotationParagraphs(
				'@book{k, annotation = "A {nested\n\n} one.\n\nB.",\n\n year = 1}'
			)
		).toBe(
			'@book{k, annotation = "A {nested \\par } one. \\par B.",\n\n year = 1}'
		);
		expect(
			markBibtexAnnotationParagraphs(
				'@book{k, annote = macro,\n\n year = 1}'
			)
		).toBe( '@book{k, annote = macro,\n\n year = 1}' );
	} );

	it( 'maps BibTeX annote to annote, keeping paragraphs, and leaves abstract alone', async () => {
		const csl = await parseSingle( `@book{ngai2005,
  author = {Ngai, Sianne},
  title = {Ugly Feelings},
  publisher = {Harvard University Press},
  year = {2005},
  abstract = {The publisher's summary.},
  annote = {On minor feelings.

Chapter 3 on envy \\& irritation.}
}` );

		expect( csl.annote ).toBe(
			'On minor feelings.\n\nChapter 3 on envy & irritation.'
		);
		expect( csl.abstract ).toBe( "The publisher's summary." );
	} );

	it( 'maps BibLaTeX annotation to annote', async () => {
		const csl = await parseSingle( `@book{ngai2005,
  author = {Ngai, Sianne},
  title = {Ugly Feelings},
  date = {2005},
  annotation = {A short note.}
}` );

		expect( csl.annote ).toBe( 'A short note.' );
	} );

	it( 'round-trips its own BibTeX export', async () => {
		const bibtex = await buildBibtexExportContent(
			[ { csl: { ...BOOK, annote: 'One.\n\nTwo.' } } ],
			'apa-7'
		);
		const csl = await parseSingle( bibtex );

		expect( csl.annote ).toBe( 'One.\n\nTwo.' );
	} );

	it( 'keeps annote from pasted CSL-JSON', async () => {
		const csl = await parseSingle(
			JSON.stringify( [ { ...BOOK, id: 'ngai', annote: 'Kept.' } ] )
		);

		expect( csl.annote ).toBe( 'Kept.' );
	} );

	it( 'leaves RIS N1 as a note and AB as an abstract, not an annotation', async () => {
		const csl = await parseSingle(
			'TY  - BOOK\nTI  - Ugly Feelings\nAU  - Ngai, Sianne\nPY  - 2005\nN1  - A note\nAB  - An abstract\nER  - \n'
		);

		expect( csl ).not.toHaveProperty( 'annote' );
		expect( csl.note ).toBe( 'A note' );
		expect( csl.abstract ).toBe( 'An abstract' );
	} );
} );
