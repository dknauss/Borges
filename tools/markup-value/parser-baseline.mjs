/**
 * How much of the plain list a citation parser recovers on its own.
 *
 * measure.mjs counts a field the plain list prints only as prose as
 * "unlabeled": present, but with nothing to say which words are the title.
 * Real readers do not stop there; they run a citation parser. This runs one,
 * AnyStyle (https://anystyle.io, BSD-2-Clause, a machine-learning parser
 * used by Zotero's and others' import tools), over the plain page's
 * entries and scores what it gets against the same ground truth and the
 * same matching rules measure.mjs uses for the structured layers.
 *
 * Needs Ruby and the anystyle-cli gem (`gem install anystyle-cli`); set
 * ANYSTYLE to its path if it is not on PATH. Run after render.php and
 * measure.mjs: `node parser-baseline.mjs` (or `npm run parser`). Writes
 * out/parser-baseline.json.
 */

import { execFileSync } from 'node:child_process';
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

/**
 * AnyStyle's CSL-JSON for one entry, as the same fields measure.mjs scores.
 *
 * @param {Object} csl CSL-JSON item from AnyStyle.
 */
function fromParsed( csl ) {
	const issued =
		csl.issued && typeof csl.issued === 'object'
			? csl.issued[ 'date-parts' ]?.[ 0 ]?.[ 0 ]
			: csl.issued;

	return {
		title: csl.title,
		authors: familyNames( csl.author ),
		year: issued === undefined ? undefined : String( issued ),
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

	const input = join( OUT_DIR, 'plain-entries.txt' );
	await writeFile( input, entries.join( '\n' ) + '\n' );

	const parsed = JSON.parse(
		execFileSync(
			process.env.ANYSTYLE || 'anystyle',
			[ '-f', 'csl', '--stdout', 'parse', input ],
			{ encoding: 'utf8' }
		)
	);
	const version = execFileSync(
		process.env.ANYSTYLE || 'anystyle',
		[ '--version' ],
		{ encoding: 'utf8' }
	).trim();

	const byField = Object.fromEntries(
		FIELDS.map( ( f ) => [ f, { correct: 0, pairs: 0 } ] )
	);
	const misses = [];

	order.forEach( ( id, index ) => {
		const expected = truth( items.find( ( i ) => i.id === id ) );
		const got = parsed[ index ] ? fromParsed( parsed[ index ] ) : {};

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
		parser: version,
		input: 'plain.html, one entry per line',
		correct,
		pairs,
		byField,
		misses,
	};

	await writeFile(
		join( OUT_DIR, 'parser-baseline.json' ),
		JSON.stringify( result, null, '\t' ) + '\n'
	);

	// eslint-disable-next-line no-console
	console.log(
		`${ version }: ${ correct } of ${ pairs } fields correct from the plain list`
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
