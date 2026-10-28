/**
 * What the Zotero translation server saves from each page.
 *
 * zotero-coins.mjs reads COinS with Zotero's OpenURL reader alone. This asks
 * a running Zotero translation server (https://github.com/zotero/translation-server)
 * to save each rendered page as a user would with the browser connector:
 * it picks the translator Zotero would (COinS, DOI, embedded metadata), takes
 * every item offered, and scores the items against the corpus with the same
 * rules as measure.mjs. A DOI the page links to is looked up at Crossref or
 * DataCite by Zotero's DOI translator, so those items come from the registry,
 * not the page.
 *
 * Start the server (Docker: `docker run -p 1969:1969 zotero/translation-server`,
 * or from source with `npm start`), then `npm run zotero-ts`; set
 * ZOTERO_TS_URL if it is not at http://127.0.0.1:1969. Writes
 * out/zotero-translation.json.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	FIELDS,
	OUT_DIR,
	VARIANTS,
	corpus as readCorpus,
	familyNames,
	matches,
	serve,
	truth,
} from './lib.mjs';

const SERVER = process.env.ZOTERO_TS_URL || 'http://127.0.0.1:1969';

async function web( body, type ) {
	const response = await fetch( `${ SERVER }/web`, {
		method: 'POST',
		headers: { 'content-type': type },
		body,
	} );
	const text = await response.text();
	return { status: response.status, body: text ? JSON.parse( text ) : null };
}

/**
 * Every item Zotero would save from a page, choosing all when it offers a list.
 *
 * @param {string} url Page URL.
 */
async function translate( url ) {
	let result = await web( url, 'text/plain' );
	if ( result.status === 300 ) {
		result = await web( JSON.stringify( result.body ), 'application/json' );
	}
	if ( result.status !== 200 ) {
		return [];
	}
	return result.body.filter( ( item ) => item.itemType !== 'note' );
}

const words = ( value ) =>
	String( value || '' )
		.toLowerCase()
		.replace( /[^a-z0-9]+/g, ' ' )
		.trim();

function fromZotero( item ) {
	const authors = ( item.creators || [] )
		.filter( ( c ) => c.creatorType === 'author' )
		.map( ( c ) =>
			c.name
				? { literal: c.name }
				: { family: c.lastName, given: c.firstName }
		);

	return {
		title: item.title,
		authors: familyNames( authors ),
		year: ( item.date || '' ).match( /\d{4}/ )?.[ 0 ],
		container:
			item.publicationTitle ||
			item.bookTitle ||
			item.proceedingsTitle ||
			item.websiteTitle,
		doi: item.DOI,
		isbn: item.ISBN,
		pages: item.pages,
		publisher: item.publisher || item.repository,
	};
}

async function main() {
	const { items } = await readCorpus();
	const server = await serve();
	const results = {};

	try {
		for ( const variant of VARIANTS ) {
			const saved = await translate( `${ server.url }${ variant }.html` );
			const byField = Object.fromEntries(
				FIELDS.map( ( f ) => [ f, { correct: 0, pairs: 0 } ] )
			);
			let found = 0;

			for ( const work of items ) {
				const expected = truth( work );
				const match = saved.find(
					( item ) =>
						( work.DOI &&
							item.DOI &&
							item.DOI.toLowerCase() ===
								work.DOI.toLowerCase() ) ||
						words( item.title ).replace( /\s/g, '' ) ===
							words( work.title ).replace( /\s/g, '' )
				);
				found += match ? 1 : 0;
				const got = match ? fromZotero( match ) : {};

				for ( const field of FIELDS ) {
					const want = expected[ field ];
					if (
						want === undefined ||
						( Array.isArray( want ) && ! want.length )
					) {
						continue;
					}
					byField[ field ].pairs++;
					if ( matches( field, want, got[ field ] ) ) {
						byField[ field ].correct++;
					}
				}
			}

			results[ variant ] = {
				itemsSaved: saved.length,
				itemTypes: saved.map( ( item ) => item.itemType ),
				worksFound: found,
				correct: FIELDS.reduce(
					( n, f ) => n + byField[ f ].correct,
					0
				),
				pairs: FIELDS.reduce( ( n, f ) => n + byField[ f ].pairs, 0 ),
				byField,
			};
			// eslint-disable-next-line no-console
			console.log(
				`${ variant.padEnd( 15 ) } ${ found }/${ items.length } works, ${
					results[ variant ].correct
				}/${ results[ variant ].pairs } fields`
			);
		}
	} finally {
		await server.close();
	}

	await writeFile(
		join( OUT_DIR, 'zotero-translation.json' ),
		JSON.stringify( { server: SERVER, results }, null, '\t' ) + '\n'
	);
}

main().catch( ( error ) => {
	// eslint-disable-next-line no-console
	console.error( error );
	process.exitCode = 1;
} );
