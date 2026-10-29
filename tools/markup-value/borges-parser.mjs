/**
 * How much of the plain list Borges's own free-text parser recovers.
 *
 * The same test as parser-baseline.mjs, with Borges's parser in place of
 * AnyStyle: each entry of the plain page goes through
 * parseFreeTextCitation() (src/lib/free-text-parser.js), the parser the
 * editor uses for a pasted citation it has no identifier for, and its
 * CSL-JSON is scored against the same ground truth with the same rules.
 *
 * This measures the parser alone. In the editor, an entry with a DOI or
 * another identifier in it is looked up at its source instead (embedded
 * identifier resolution), so pasting these lists gives better records than
 * the parser does by itself.
 *
 * Run after render.php: `node borges-parser.mjs` (or `npm run borges-parser`).
 * Writes borges-parser.json to MV_OUT (default out/).
 */

import { register } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import {
	FIELDS,
	OUT_DIR,
	corpus as readCorpus,
	familyNames,
	manifest as readManifest,
	matches,
	truth,
} from './lib.mjs';

register( './src-esm-hooks.mjs', import.meta.url );
const { parseFreeTextCitation } =
	await import( '../../src/lib/free-text-parser.js' );

/**
 * Borges's CSL-JSON for one entry, as the fields measure.mjs scores.
 *
 * @param {Object} csl CSL-JSON item from parseFreeTextCitation().
 */
function fromParsed( csl ) {
	const year = csl.issued?.[ 'date-parts' ]?.[ 0 ]?.[ 0 ];

	return {
		title: csl.title,
		authors: familyNames( csl.author ),
		year: year === undefined ? undefined : String( year ),
		container: csl[ 'container-title' ],
		doi: csl.DOI,
		isbn: csl.ISBN,
		pages: csl.page,
		publisher: csl.publisher,
	};
}

async function main() {
	const { items } = await readCorpus();
	const { order } = await readManifest();
	const html = await readFile( join( OUT_DIR, 'plain.html' ), 'utf8' );
	const { document } = new JSDOM( html ).window;
	const entries = [ ...document.querySelectorAll( 'article li' ) ].map(
		( li ) => li.textContent.replace( /\s+/g, ' ' ).trim()
	);

	if ( entries.length !== order.length ) {
		throw new Error(
			`Expected ${ order.length } entries, found ${ entries.length }.`
		);
	}

	const byField = Object.fromEntries(
		FIELDS.map( ( f ) => [ f, { correct: 0, pairs: 0 } ] )
	);
	const misses = [];
	let unparsed = 0;

	order.forEach( ( id, index ) => {
		const expected = truth( items.find( ( i ) => i.id === id ) );
		const parsed = parseFreeTextCitation( entries[ index ] );
		if ( ! parsed ) {
			unparsed++;
		}
		const got = parsed ? fromParsed( parsed.csl ) : {};

		FIELDS.forEach( ( field ) => {
			const want = expected[ field ];
			if (
				want === undefined ||
				( Array.isArray( want ) && ! want.length )
			) {
				return;
			}
			byField[ field ].pairs++;
			if ( matches( field, want, got[ field ] ) ) {
				byField[ field ].correct++;
			} else {
				misses.push( { id, field, want, got: got[ field ] ?? null } );
			}
		} );
	} );

	const correct = FIELDS.reduce( ( n, f ) => n + byField[ f ].correct, 0 );
	const pairs = FIELDS.reduce( ( n, f ) => n + byField[ f ].pairs, 0 );
	const result = {
		generated: new Date().toISOString(),
		parser: 'Borges parseFreeTextCitation()',
		input: 'plain.html, one entry at a time',
		correct,
		pairs,
		unparsed,
		byField,
		misses,
	};

	await writeFile(
		join( OUT_DIR, 'borges-parser.json' ),
		JSON.stringify( result, null, '\t' ) + '\n'
	);

	// eslint-disable-next-line no-console
	console.log(
		`Borges parser: ${ correct } of ${ pairs } fields correct from the plain list (${ unparsed } entries not parsed)`
	);
	FIELDS.forEach( ( f ) =>
		// eslint-disable-next-line no-console
		console.log(
			`  ${ f.padEnd( 10 ) } ${ byField[ f ].correct }/${ byField[ f ].pairs }`
		)
	);
}

main().catch( ( error ) => {
	// eslint-disable-next-line no-console
	console.error( error );
	process.exitCode = 1;
} );
