/**
 * Round-trip check: parses each style's golden entries back into fields with
 * AnyStyle (a machine-learning reference parser, https://anystyle.io) and
 * reports, per style and per field, how many of the fields in
 * tests/fixtures/csl-styles/items.json come back.
 *
 * A field that a reader cannot recover from the formatted text is either
 * missing from the entry or printed in a form readers do not expect. AnyStyle
 * makes its own mistakes, so read a low score as "look at this entry", not as
 * proof of a bug; compare runs over time rather than chasing 100%.
 *
 * Needs the AnyStyle CLI (`gem install anystyle-cli`, Ruby 2.7+); set
 * ANYSTYLE to its path when it is not on PATH. Run from the repository root:
 * `node tools/style-reference/anystyle.mjs` (or `npm run anystyle` here).
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname( fileURLToPath( import.meta.url ) );
const ROOT = join( TOOL_DIR, '..', '..' );
const FIXTURES = join( ROOT, 'tests', 'fixtures', 'csl-styles' );
const ANYSTYLE = process.env.ANYSTYLE || 'anystyle';

const norm = ( value ) =>
	String( value ?? '' )
		.normalize( 'NFKC' )
		.toLowerCase()
		.replace( /[‐-―−]/g, '-' )
		.replace( /^https?:\/\/(dx\.)?doi\.org\//, '' )
		.replace( /[^\p{L}\p{N}-]+/gu, '' );

const year = ( item ) =>
	String(
		item.issued?.[ 'date-parts' ]?.[ 0 ]?.[ 0 ] ?? item.issued ?? ''
	).slice( 0, 4 );

/**
 * The fields compared, each read from the source item and from AnyStyle's
 * CSL output. AnyStyle often puts a DOI only in URL, so DOI checks both.
 */
const FIELDS = {
	title: ( item ) => item.title,
	'first author': ( item ) =>
		item.author?.[ 0 ]?.family ?? item.author?.[ 0 ]?.literal,
	// The parsed side compares the whole name object; see recovered().
	year,
	container: ( item ) => item[ 'container-title' ],
	volume: ( item ) => item.volume,
	page: ( item ) => item.page,
	DOI: ( item ) => item.DOI ?? item.URL,
	publisher: ( item ) => item.publisher,
};

/**
 * Whether AnyStyle recovered the source value. Page ranges match on their
 * first page, since styles abbreviate the last one.
 *
 * @param {string}  field  Field name.
 * @param {unknown} source Source value.
 * @param {unknown} parsed AnyStyle value or name object.
 */
function recovered( field, source, parsed ) {
	if ( field === 'page' ) {
		return (
			norm( source ).split( '-' )[ 0 ] ===
			norm( parsed ).split( '-' )[ 0 ]
		);
	}
	if ( field === 'first author' && parsed ) {
		// AnyStyle splits an organization into given and family names.
		return [ parsed.family, `${ parsed.given } ${ parsed.family }` ].some(
			( name ) => norm( name ) === norm( source )
		);
	}
	if ( field === 'DOI' ) {
		return norm( parsed ).includes( norm( source ) );
	}
	return norm( source ) === norm( parsed );
}

const styles = JSON.parse(
	await readFile( join( ROOT, 'includes', 'styles.json' ), 'utf8' )
).styles;
const items = JSON.parse(
	await readFile( join( FIXTURES, 'items.json' ), 'utf8' )
);
const tmp = await mkdtemp( join( tmpdir(), 'borges-anystyle-' ) );
const rows = [];
const misses = [];

try {
	for ( const styleKey of Object.keys( styles ) ) {
		const golden = Object.fromEntries(
			( await readFile( join( FIXTURES, `${ styleKey }.txt` ), 'utf8' ) )
				.split( '\n' )
				.filter( Boolean )
				.map( ( line ) => line.split( '\t' ) )
		);
		const input = join( tmp, `${ styleKey }.txt` );
		await writeFile(
			input,
			items.map( ( { id } ) => golden[ id ] ).join( '\n' ) + '\n'
		);

		const parsed = JSON.parse(
			execFileSync(
				ANYSTYLE,
				[ '--stdout', '-f', 'csl', 'parse', input ],
				{
					encoding: 'utf8',
					maxBuffer: 16 * 1024 * 1024,
				}
			)
		);
		const row = { style: styleKey };

		for ( const [ field, read ] of Object.entries( FIELDS ) ) {
			let have = 0;
			let got = 0;

			items.forEach( ( item, index ) => {
				const source = read( item );
				if ( ! source ) {
					return;
				}
				have++;
				const value =
					field === 'first author'
						? parsed[ index ]?.author?.[ 0 ]
						: read( parsed[ index ] || {} );
				if ( recovered( field, source, value ) ) {
					got++;
				} else {
					misses.push(
						`${ styleKey }\t${ item.id }\t${ field }\t${ JSON.stringify( source ) } => ${ JSON.stringify( value ?? null ) }`
					);
				}
			} );
			row[ field ] = `${ got }/${ have }`;
		}
		rows.push( row );
	}
} finally {
	await rm( tmp, { recursive: true, force: true } );
}

// eslint-disable-next-line no-console
console.table( rows );
if ( process.argv.includes( '--misses' ) ) {
	// eslint-disable-next-line no-console
	console.log( misses.join( '\n' ) );
}
