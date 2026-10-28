/**
 * How much of the plain list a language model recovers on its own.
 *
 * The counterpart of parser-baseline.mjs for language models. It gives a
 * model the plain page's entries, one per line, with the fixed prompt below,
 * asks for CSL-JSON, and scores the answer against the same ground truth and
 * matching rules as the structured layers.
 *
 * Two ways to run it, after render.php and parser-baseline.mjs (which writes
 * out/plain-entries.txt):
 *
 * - `ANTHROPIC_API_KEY=… node llm-baseline.mjs --model <model id>` calls the
 *   Anthropic Messages API at temperature 0.
 * - `node llm-baseline.mjs --input answer.json --label <name>` scores an
 *   answer obtained some other way (another vendor, a chat window), given
 *   the same prompt (`node llm-baseline.mjs --print-prompt`).
 *
 * Writes out/llm-<label>.json. A model may supply a field the list doesn't
 * print (an ISBN from memory); it is scored like any other value, and
 * `unprinted` counts how many correct values were not on the page.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	FIELDS,
	OUT_DIR,
	corpus as readCorpus,
	familyNames,
	manifest as readManifest,
	matches,
	truth,
} from './lib.mjs';

export const PROMPT = `Below is a reference list, one entry per line. Convert each entry to CSL-JSON.

Return only a JSON array with exactly one object per line of input, in the same order, and nothing else. Use only what the entry itself says: do not add information from memory or look anything up. Use these CSL-JSON keys where the entry gives a value: "type", "title", "author" (a list of {"family", "given"} or {"literal"} objects), "issued" ({"date-parts": [[year]]}), "container-title", "DOI" (without https://doi.org/), "ISBN", "page", "publisher", "volume", "issue", "URL".

Reference list:
`;

const arg = ( name ) => {
	const i = process.argv.indexOf( `--${ name }` );
	return i > 0 ? process.argv[ i + 1 ] : undefined;
};

function fromModel( csl ) {
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

async function callAnthropic( model, prompt ) {
	const response = await fetch( 'https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': process.env.ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify( {
			model,
			max_tokens: 16000,
			temperature: 0,
			messages: [ { role: 'user', content: prompt } ],
		} ),
	} );
	if ( ! response.ok ) {
		throw new Error( `${ response.status } ${ await response.text() }` );
	}
	const body = await response.json();
	return body.content.map( ( part ) => part.text || '' ).join( '' );
}

const plainText = ( value ) =>
	String( value )
		.toLowerCase()
		.normalize( 'NFKD' )
		.replace( /[\u0300-\u036f]/g, '' )
		.replace( /[^a-z0-9]+/g, ' ' )
		.trim();

/**
 * Whether a ground-truth value appears in the printed entry, so a correct
 * answer can be told apart from one supplied from memory.
 *
 * @param {string} field Field name.
 * @param {string|string[]} want Ground-truth value.
 * @param {string} line  The plain entry, lowercased.
 */
function onPage( field, want, line ) {
	const text = ` ${ plainText( line ) } `;
	const has = ( value ) => text.includes( ` ${ plainText( value ) } ` );

	switch ( field ) {
		case 'authors':
			return want.every( ( name ) => has( name ) );
		case 'isbn':
			return line.replace( /[^0-9x]/g, '' ).includes(
				String( want )
					.replace( /[^0-9x]/gi, '' )
					.toLowerCase()
			);
		case 'pages':
			return String( want )
				.split( /[^0-9a-z]+/i )
				.filter( Boolean )
				.every( ( part ) => has( part ) );
		case 'doi':
			return line.includes( String( want ).toLowerCase() );
		case 'year':
			// A year can carry a letter ("1962a") or sit in a date.
			return line.includes( String( want ) );
		default:
			return has( want );
	}
}

const parseArray = ( text ) =>
	JSON.parse(
		text.slice( text.indexOf( '[' ), text.lastIndexOf( ']' ) + 1 )
	);

async function main() {
	const entries = await readFile(
		join( OUT_DIR, 'plain-entries.txt' ),
		'utf8'
	);
	const prompt = PROMPT + entries;

	if ( process.argv.includes( '--print-prompt' ) ) {
		process.stdout.write( prompt );
		return;
	}

	const model = arg( 'model' );
	const input = arg( 'input' );
	const label = arg( 'label' ) || model;
	if ( ! label || ( ! input && ! model ) ) {
		throw new Error(
			'Use --model <id> (with ANTHROPIC_API_KEY) or --input <file> --label <name>.'
		);
	}

	const answer = input
		? await readFile( input, 'utf8' )
		: await callAnthropic( model, prompt );
	const parsed = parseArray( answer );
	const { items } = await readCorpus();
	const { order } = await readManifest();
	const lines = entries.trim().split( '\n' );

	const byField = Object.fromEntries(
		FIELDS.map( ( f ) => [ f, { correct: 0, pairs: 0 } ] )
	);
	const misses = [];
	let unprinted = 0;

	order.forEach( ( id, index ) => {
		const expected = truth( items.find( ( i ) => i.id === id ) );
		const got = parsed[ index ] ? fromModel( parsed[ index ] ) : {};
		const line = ( lines[ index ] || '' ).toLowerCase();

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
				if ( ! onPage( field, want, line ) ) {
					unprinted++;
				}
			} else {
				misses.push( { id, field, want, got: got[ field ] ?? null } );
			}
		} );
	} );

	const correct = FIELDS.reduce( ( n, f ) => n + byField[ f ].correct, 0 );
	const pairs = FIELDS.reduce( ( n, f ) => n + byField[ f ].pairs, 0 );
	await writeFile(
		join( OUT_DIR, `llm-${ label }.json` ),
		JSON.stringify(
			{
				generated: new Date().toISOString(),
				label,
				model: model || null,
				entries: lines.length,
				answered: parsed.length,
				correct,
				pairs,
				unprinted,
				byField,
				misses,
				answer: parsed,
			},
			null,
			'\t'
		) + '\n'
	);
	// eslint-disable-next-line no-console
	console.log(
		`${ label }: ${ correct } of ${ pairs } fields correct from the plain list (${ unprinted } not printed there)`
	);
}

main().catch( ( error ) => {
	// eslint-disable-next-line no-console
	console.error( error );
	process.exitCode = 1;
} );
