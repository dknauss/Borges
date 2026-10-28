/**
 * RIS import through the real citation-js parser.
 *
 * The reference-manager corpus pins what whole RIS exports yield; these tests
 * check the pieces around it: finding records in a mixed paste, the repairs in
 * `ris-fields.js`, the sample library the corpus exports were made from, and a
 * round trip through Borges's own RIS export.
 */
import fs from 'fs';
import path from 'path';

import { cslToRisEntry } from './export';
import { parsePastedInput } from './parser';
import { segmentPastedInput } from './parser-segment';
import { getRisTagValues, normalizeRisCsl, parseRisDate } from './ris-fields';

jest.mock( '@wordpress/api-fetch', () => jest.fn() );

const CONTRIBUTED_DIR = path.join(
	__dirname,
	'__fixtures__',
	'reference-manager-exports',
	'contributed'
);

const offlineFetch = () =>
	Promise.reject( new Error( 'No network in the RIS import tests' ) );

function readContributed( name ) {
	return fs.readFileSync( path.join( CONTRIBUTED_DIR, name ), 'utf8' );
}

function parseOffline( input ) {
	return parsePastedInput( input, undefined, { fetchFn: offlineFetch } );
}

const KUHN_RECORD = [
	'TY  - BOOK',
	'AU  - Kuhn, Thomas S.',
	'TI  - The Structure of Scientific Revolutions',
	'PY  - 1962',
	'PB  - University of Chicago Press',
	'CY  - Chicago',
	'ER  - ',
].join( '\n' );
// Segments are trimmed, which takes the space after the final `ER  -`.
const KUHN_SEGMENT = KUHN_RECORD.trim();

describe( 'segmentPastedInput() with RIS', () => {
	it( 'lifts each record out of the text around it', () => {
		const segments = segmentPastedInput(
			`10.1038/171737a0\n\n${ KUHN_RECORD }\n\n${ KUHN_RECORD }\nTrailing text.`
		);

		expect(
			segments.map( ( { ris, value } ) => [ !! ris, value ] )
		).toEqual( [
			[ false, '10.1038/171737a0\n' ],
			[ true, KUHN_SEGMENT ],
			[ true, KUHN_SEGMENT ],
			[ false, 'Trailing text.' ],
		] );
	} );

	it( 'normalizes CRLF line endings inside a record', () => {
		const [ segment ] = segmentPastedInput(
			KUHN_RECORD.replace( /\n/gu, '\r\n' )
		);

		expect( segment ).toEqual( {
			bibtex: false,
			ris: true,
			value: KUHN_SEGMENT,
			raw: KUHN_SEGMENT,
		} );
	} );

	it( 'ends a record left open at the next TY line', () => {
		const open = KUHN_RECORD.replace( /\nER {2}- $/u, '' );
		const segments = segmentPastedInput( `${ open }\n${ KUHN_RECORD }` );

		expect( segments.map( ( { value } ) => value ) ).toEqual( [
			open,
			KUHN_SEGMENT,
		] );
	} );

	it( 'leaves input without a TY line to the BibTeX segmenter', () => {
		expect( segmentPastedInput( 'Plain text.\r\nMore.' ) ).toEqual( [
			{ bibtex: false, value: 'Plain text.\r\nMore.' },
		] );
	} );
} );

describe( 'ris-fields helpers', () => {
	it.each( [
		[ '2024/03/12/', [ 2024, 3, 12 ] ],
		[ '2024/03/11', [ 2024, 3, 11 ] ],
		[ '1962///', [ 1962 ] ],
		[ '2017/06//', [ 2017, 6 ] ],
		[ '2024-03-12', [ 2024, 3, 12 ] ],
	] )( 'reads the RIS date %s', ( value, parts ) => {
		expect( parseRisDate( value ) ).toEqual( { 'date-parts': [ parts ] } );
	} );

	it( 'ignores a date it cannot read', () => {
		expect( parseRisDate( 'March 11, 2024' ) ).toBeUndefined();
	} );

	it( 'collects every value of a tag', () => {
		expect(
			getRisTagValues(
				'TY  - ELEC\r\nY2  - 2024/03/12/\r\nY2  - \r\nER  - ',
				'Y2'
			)
		).toEqual( [ '2024/03/12/' ] );
	} );

	it( 'drops the random id citation-js gives a record without ID', () => {
		expect(
			normalizeRisCsl( { id: 'temp_id_123', type: 'book' }, '' )
		).toEqual( { type: 'book' } );
		expect(
			normalizeRisCsl( { id: 'kuhn1962', type: 'book' }, '' )
		).toEqual( {
			id: 'kuhn1962',
			type: 'book',
		} );
	} );
} );

describe( 'parsePastedInput() with RIS', () => {
	it( 'reads a record mixed with formatted citations', async () => {
		const result = await parseOffline(
			`${ KUHN_RECORD }\n\nWatson, J. D., and F. H. C. Crick. "Molecular Structure of Nucleic Acids." Nature 171 (1953): 737–738.`
		);

		expect( result.errors ).toEqual( [] );
		expect( result.entries.map( ( entry ) => entry.inputFormat ) ).toEqual(
			[ 'ris', 'freetext' ]
		);
		expect( result.entries[ 0 ].csl ).toEqual( {
			type: 'book',
			title: 'The Structure of Scientific Revolutions',
			author: [ { family: 'Kuhn', given: 'Thomas S.' } ],
			issued: { 'date-parts': [ [ 1962 ] ] },
			publisher: 'University of Chicago Press',
			'publisher-place': 'Chicago',
		} );
	} );

	it( 'reads a web page’s Y2 as its access date', async () => {
		const result = await parseOffline(
			[
				'TY  - ELEC',
				'AU  - Citation Style Language',
				'TI  - Citation Style Language',
				'UR  - https://citationstyles.org/',
				'Y2  - 2024/03/11',
				'ER  - ',
			].join( '\n' )
		);

		expect( result.entries[ 0 ].csl ).toMatchObject( {
			type: 'webpage',
			author: [ { literal: 'Citation Style Language' } ],
			accessed: { 'date-parts': [ [ 2024, 3, 11 ] ] },
		} );
	} );

	it( 'imports the sample library with Zotero’s own reading of it', async () => {
		// Zotero imported borges-sample.ris and exported it as CSL JSON, so its
		// export is an independent reading of the same records.
		const zotero = JSON.parse( readContributed( 'zotero-csl.json' ) );
		const result = await parseOffline(
			readContributed( 'borges-sample.ris' )
		);
		const summarize = ( csl ) => ( {
			title: csl.title,
			authors: ( csl.author || [] ).length,
			// Zotero writes years as strings.
			year:
				Number( csl.issued?.[ 'date-parts' ]?.[ 0 ]?.[ 0 ] ) ||
				undefined,
			DOI: csl.DOI?.toLowerCase(),
			container: csl[ 'container-title' ],
			event: csl[ 'event-title' ],
			collectionEditors: ( csl[ 'collection-editor' ] || [] ).length,
			publisher: csl.publisher,
			place: csl[ 'publisher-place' ],
			page: csl.page?.replace( /[–-]/gu, '-' ),
			URL: csl.URL,
		} );

		expect( result.errors ).toEqual( [] );
		expect( result.entries ).toHaveLength( 12 );
		expect(
			result.entries
				.map( ( entry ) => summarize( entry.csl ) )
				.sort( ( a, b ) => a.title.localeCompare( b.title ) )
		).toEqual(
			zotero
				.map( summarize )
				.sort( ( a, b ) => a.title.localeCompare( b.title ) )
		);
	} );

	it( 'reads back what Borges’s own RIS export writes', async () => {
		const sample = await parseOffline( readContributed( 'zotero.ris' ) );
		const exported = sample.entries
			.map( ( entry ) => cslToRisEntry( entry.csl ) )
			.join( '\n\n' );
		const reimported = await parseOffline( exported );
		// The export writes these fields; it leaves out the place of
		// publication, the access date, collection editors, and the event
		// title of a conference paper.
		const exportedFields = ( csl ) => ( {
			type: csl.type,
			title: csl.title,
			author: csl.author,
			editor: csl.editor,
			container: csl[ 'container-title' ],
			publisher: csl.publisher,
			year: csl.issued?.[ 'date-parts' ]?.[ 0 ]?.[ 0 ],
			volume: csl.volume,
			issue: csl.issue,
			page: csl.page,
			DOI: csl.DOI,
			URL: csl.URL,
			language: csl.language,
		} );

		expect( reimported.errors ).toEqual( [] );
		expect(
			reimported.entries.map( ( entry ) => exportedFields( entry.csl ) )
		).toEqual(
			sample.entries.map( ( entry ) => exportedFields( entry.csl ) )
		);
	} );
} );
