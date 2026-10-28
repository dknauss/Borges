/**
 * Measures what each rendered page (render.php) offers machines, and writes
 * out/results.json. See README.md for what each number means and what it
 * does not.
 *
 * 1. Weight: page, block, and gzip bytes, and approximate tokens.
 * 2. Structured data: what an extractor finds (JSON-LD, microdata, RDFa),
 *    schema.org vocabulary and Google rich-result checks from Adobe's
 *    open-source validator, typed nodes, facts, and links to outside IDs.
 * 3. Field recovery: for each of the corpus's (work, field) pairs, whether a
 *    machine reader gets it as a labeled value (JSON-LD, COinS, CSL-JSON), can
 *    pick it out by pattern (DOI, ISBN), or only sees it in unlabeled prose.
 * 4. Reader mode: what survives Mozilla Readability plus Turndown, the
 *    HTML-to-Markdown step many LLM ingestion pipelines use.
 * 5. Accessibility: axe-core violations and the Chromium accessibility tree.
 * 6. JavaScript: whether the data is in the HTML with scripts off, as most
 *    AI crawlers fetch it.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
/*
 * These come from this folder's own package.json, which the plugin's CI does
 * not install, so the root lint cannot resolve them.
 */
/* eslint-disable import/no-unresolved */
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import WebAutoExtractor from '@marbec/web-auto-extractor';
import Validator from '@adobe/structured-data-validator';
/* eslint-enable import/no-unresolved */
import {
	OUT_DIR,
	VARIANTS,
	approxTokens,
	corpus as readCorpus,
	isbnDigits,
	manifest as readManifest,
	norm,
	serve,
	zoteroOpenUrl,
} from './lib.mjs';

const require = createRequire( import.meta.url );
const SCHEMA_VERSION = '29.3';
const SCHEMA_FILE = join( OUT_DIR, `schemaorg-${ SCHEMA_VERSION }.jsonld` );
const SCHEMA_URL = `https://raw.githubusercontent.com/schemaorg/schemaorg/main/data/releases/${ SCHEMA_VERSION }/schemaorg-current-https.jsonld`;

export const FIELDS = [
	'title',
	'authors',
	'year',
	'container',
	'doi',
	'isbn',
	'pages',
	'publisher',
];

/* ------------------------------------------------------------------ */
/* Ground truth                                                        */
/* ------------------------------------------------------------------ */

const familyNames = ( names ) =>
	( names || [] )
		.map( ( name ) =>
			norm( name.family || name.literal || name.name || '' )
		)
		.filter( Boolean );

/**
 * The fields the corpus item actually has; only these are scored.
 *
 * @param {Object} item CSL-JSON corpus item.
 */
function truth( item ) {
	return {
		title: item.title,
		authors: item.author ? familyNames( item.author ) : undefined,
		year: item.issued
			? String( item.issued[ 'date-parts' ][ 0 ][ 0 ] )
			: undefined,
		container: item[ 'container-title' ],
		doi: item.DOI,
		isbn: item.ISBN,
		pages: item.page,
		publisher: item.publisher,
	};
}

/**
 * Whether an extracted value matches the truth for a field.
 *
 * @param {string}  field    Field name from FIELDS.
 * @param {unknown} expected Ground-truth value.
 * @param {unknown} actual   Extracted value.
 */
function matches( field, expected, actual ) {
	if ( actual === undefined || actual === null || actual === '' ) {
		return false;
	}
	if ( field === 'authors' ) {
		// Every author, once each, in order: a reader that drops, repeats,
		// or reorders a name gets the author list wrong.
		const got = ( actual || [] ).map( norm );
		return (
			got.length === expected.length &&
			expected.every( ( name, index ) => got[ index ] === name )
		);
	}
	if ( field === 'isbn' ) {
		return isbnDigits( expected ) === isbnDigits( actual );
	}
	if ( field === 'year' ) {
		return String( actual ).slice( 0, 4 ) === expected;
	}
	return norm( expected ) === norm( actual );
}

/* ------------------------------------------------------------------ */
/* Readers: each turns one layer of one entry into the same fields     */
/* ------------------------------------------------------------------ */

const first = ( value ) => ( Array.isArray( value ) ? value[ 0 ] : value );
const asList = ( value ) => ( value === undefined ? [] : [].concat( value ) );

/**
 * schema.org work (JSON-LD) to fields.
 *
 * @param {Object} work schema.org CreativeWork node.
 */
function fromJsonLd( work ) {
	let container;
	for (
		let part = first( work.isPartOf );
		part;
		part = first( part.isPartOf )
	) {
		container = part.name || container;
	}

	const ids = asList( work.identifier );
	const doiId = ids.find( ( id ) => id && id.propertyID === 'DOI' );
	const doiUrl = [ work[ '@id' ], ...asList( work.sameAs ), work.url ]
		.filter( ( url ) => typeof url === 'string' )
		.find( ( url ) => /^https?:\/\/(dx\.)?doi\.org\//i.test( url ) );

	return {
		title: work.name || work.headline,
		authors: asList( work.author ).map( ( a ) => a.familyName || a.name ),
		year: work.datePublished,
		container,
		doi: doiId
			? doiId.value
			: doiUrl &&
				decodeURIComponent(
					doiUrl.replace( /^https?:\/\/(dx\.)?doi\.org\//i, '' )
				),
		isbn: first( work.isbn ),
		pages:
			work.pagination ||
			( work.pageStart && work.pageEnd
				? `${ work.pageStart }-${ work.pageEnd }`
				: work.pageStart ),
		publisher: first( work.publisher ) && first( work.publisher ).name,
	};
}

/** Zotero's OpenURL reader, loaded in main(). */
let openUrl;

/**
 * The last names of a COinS span's authors, as Zotero's own OpenURL reader
 * imports them: in its order, with any name it repeats or drops.
 *
 * @param {string} title The span's title attribute (a KEV string).
 * @return {string[]} Last names; a reader failure gives [].
 */
function coinsAuthors( title ) {
	try {
		return openUrl
			.parseContextObject( title )
			.creators.map( ( creator ) => creator.lastName || '' );
	} catch {
		return [];
	}
}

/**
 * Fields a Zotero item of each type keeps, among those compared here. The
 * OpenURL reader sets a publisher or ISBN on any item, but Zotero discards a
 * field the item type does not have when it saves the item, so a journal
 * article imported from COinS keeps no publisher.
 */
const ZOTERO_FIELDS = {
	journalArticle: [ 'title', 'authors', 'year', 'container', 'doi', 'pages' ],
	book: [ 'title', 'authors', 'year', 'doi', 'isbn', 'publisher' ],
	bookSection: [
		'title',
		'authors',
		'year',
		'container',
		'doi',
		'isbn',
		'pages',
		'publisher',
	],
	conferencePaper: [
		'title',
		'authors',
		'year',
		'container',
		'doi',
		'isbn',
		'pages',
		'publisher',
	],
	report: [ 'title', 'authors', 'year', 'doi', 'pages', 'publisher' ],
	thesis: [ 'title', 'authors', 'year', 'doi', 'publisher' ],
	webpage: [ 'title', 'authors', 'year', 'container', 'doi' ],
};

/**
 * OpenURL ContextObject in a COinS span to fields, as Zotero imports it: the
 * span is read by Zotero's own OpenURL reader, which decides the item type
 * from the format and genre (a book-format span without
 * `rft.genre=bookitem` imports as a book, titled with the book's title), and
 * only the fields that item type keeps are counted.
 *
 * @param {string} title The span's title attribute (a KEV string).
 */
function fromCoins( title ) {
	let item;
	try {
		item = openUrl.parseContextObject( title );
	} catch {
		item = null;
	}
	if ( ! item || ! item.itemType ) {
		return {};
	}

	const fields = {
		title: item.title,
		authors: coinsAuthors( title ),
		year: item.date,
		container: item.publicationTitle,
		doi: item.DOI,
		isbn: item.ISBN,
		pages: item.pages,
		publisher: item.publisher,
	};
	const kept = ZOTERO_FIELDS[ item.itemType ] || Object.keys( fields );

	return Object.fromEntries(
		Object.entries( fields ).map( ( [ key, value ] ) => [
			key,
			kept.includes( key ) ? value : undefined,
		] )
	);
}

/**
 * CSL-JSON (Borges' data-cite-csl-json attribute) to fields.
 *
 * @param {Object} csl CSL-JSON item.
 */
function fromCsl( csl ) {
	return {
		title: csl.title,
		authors: familyNames( csl.author ),
		year:
			csl.issued &&
			csl.issued[ 'date-parts' ] &&
			String( csl.issued[ 'date-parts' ][ 0 ][ 0 ] ),
		container: csl[ 'container-title' ],
		doi: csl.DOI,
		isbn: first( csl.ISBN ),
		pages: csl.page,
		publisher: csl.publisher,
	};
}

/**
 * Classifies a field a reader only has as text. DOIs and ISBNs identify
 * themselves (a regex finds them in any style); the rest are present but
 * unlabeled: a reader needs a citation parser or an LLM to say which words
 * are the title, the journal, or the publisher.
 *
 * @param {string}  field    Field name from FIELDS.
 * @param {unknown} expected Ground-truth value.
 * @param {string}  text     The entry's text and link targets.
 */
function fromText( field, expected, text ) {
	if ( field === 'isbn' ) {
		return isbnDigits( text ).includes( isbnDigits( expected ) )
			? 'pattern'
			: 'missing';
	}
	const haystack = norm( text );
	if ( field === 'authors' ) {
		return expected.every( ( name ) => haystack.includes( name ) )
			? 'unlabeled'
			: 'missing';
	}
	if ( ! haystack.includes( norm( expected ) ) ) {
		return 'missing';
	}
	return field === 'doi' ? 'pattern' : 'unlabeled';
}

/* ------------------------------------------------------------------ */
/* Structured-data statistics                                          */
/* ------------------------------------------------------------------ */

const EXTERNAL_ID =
	/^https?:\/\/((dx\.)?doi\.org|arxiv\.org|pubmed\.ncbi\.nlm\.nih\.gov|www\.ncbi\.nlm\.nih\.gov\/pmc|pmc\.ncbi\.nlm\.nih\.gov|orcid\.org|www\.wikidata\.org|openlibrary\.org|archive\.org|isbnsearch\.org)\b/i;

/**
 * Counts typed nodes, facts (property values), types, and outside IDs.
 *
 * @param {Object[]} blocks Parsed JSON-LD blocks.
 */
function graphStats( blocks ) {
	const stats = {
		typedNodes: 0,
		facts: 0,
		types: new Set(),
		externalIds: new Set(),
		citationEdges: 0,
	};

	const walk = ( node, key ) => {
		if ( Array.isArray( node ) ) {
			node.forEach( ( child ) => walk( child, key ) );
			return;
		}
		if ( node && typeof node === 'object' ) {
			if ( node[ '@type' ] ) {
				stats.typedNodes++;
				asList( node[ '@type' ] ).forEach( ( type ) =>
					stats.types.add( type )
				);
			}
			if ( key === 'citation' ) {
				stats.citationEdges++;
			}
			for ( const [ k, v ] of Object.entries( node ) ) {
				if ( k !== '@context' && k !== '@type' ) {
					walk( v, k );
				}
			}
			return;
		}
		if ( key !== '@context' ) {
			stats.facts++;
			if (
				typeof node === 'string' &&
				EXTERNAL_ID.test( node ) &&
				[ '@id', 'sameAs', 'url' ].includes( key )
			) {
				stats.externalIds.add( node );
			}
		}
	};

	blocks.forEach( ( block ) => walk( block ) );

	return {
		typedNodes: stats.typedNodes,
		facts: stats.facts,
		types: [ ...stats.types ].sort(),
		externalIds: stats.externalIds.size,
		citationEdges: stats.citationEdges,
	};
}

async function schemaOrg() {
	if ( ! existsSync( SCHEMA_FILE ) ) {
		const res = await fetch( SCHEMA_URL );
		if ( ! res.ok ) {
			throw new Error(
				`Could not download the schema.org vocabulary (${ res.status }) from ${ SCHEMA_URL }`
			);
		}
		await writeFile( SCHEMA_FILE, await res.text() );
	}
	return JSON.parse( await readFile( SCHEMA_FILE, 'utf8' ) );
}

async function structuredData( html, validator ) {
	const extracted = new WebAutoExtractor( {
		addLocation: true,
		embedSource: [ 'rdfa', 'microdata' ],
	} ).parse( html );
	const issues = await validator.validate( extracted );
	const jsonld = Object.values( extracted.jsonld || {} ).flat();
	const count = ( format ) =>
		Object.values( extracted[ format ] || {} ).flat().length;

	return {
		jsonLdBlocks: jsonld.length,
		microdataItems: count( 'microdata' ),
		rdfaItems: count( 'rdfa' ),
		...graphStats( jsonld ),
		validator: {
			errors: issues.filter( ( i ) => i.severity === 'ERROR' ).length,
			warnings: issues.filter( ( i ) => i.severity === 'WARNING' ).length,
			issues: issues.map( ( i ) => ( {
				severity: i.severity,
				message: i.issueMessage,
				path: ( i.path || [] )
					.map( ( p ) => p.type || p.property )
					.filter( Boolean )
					.join( ' > ' ),
			} ) ),
		},
	};
}

/* ------------------------------------------------------------------ */
/* Field recovery                                                      */
/* ------------------------------------------------------------------ */

function jsonLdWorksById( document ) {
	const works = {};
	const visit = ( node ) => {
		if ( Array.isArray( node ) ) {
			node.forEach( visit );
		} else if ( node && typeof node === 'object' ) {
			if (
				node[ '@type' ] === 'ListItem' &&
				node.item &&
				typeof node.url === 'string'
			) {
				const match = node.url.match( /#ref-(.+)$/ );
				if ( match ) {
					works[ match[ 1 ] ] = node.item;
				}
			}
			Object.values( node ).forEach( visit );
		}
	};
	for ( const script of document.querySelectorAll(
		'script[type="application/ld+json"]'
	) ) {
		try {
			visit( JSON.parse( script.textContent ) );
		} catch {
			// Invalid JSON-LD reads as no JSON-LD.
		}
	}
	return works;
}

function fieldRecovery( document, items, order ) {
	const works = jsonLdWorksById( document );
	const entries = [ ...document.querySelectorAll( 'article li' ) ];
	const layers = { jsonld: 0, coins: 0, cslJson: 0 };
	const byField = Object.fromEntries(
		FIELDS.map( ( f ) => [
			f,
			{ labeled: 0, pattern: 0, unlabeled: 0, missing: 0 },
		] )
	);
	const totals = {
		labeled: 0,
		pattern: 0,
		unlabeled: 0,
		missing: 0,
		pairs: 0,
	};
	const perLayer = Object.fromEntries(
		Object.keys( layers ).map( ( layer ) => [
			layer,
			{
				correct: 0,
				byField: Object.fromEntries( FIELDS.map( ( f ) => [ f, 0 ] ) ),
			},
		] )
	);

	order.forEach( ( id, index ) => {
		const item = items.find( ( i ) => i.id === id );
		const expected = truth( item );
		const li = document.getElementById( `ref-${ id }` ) || entries[ index ];
		const coins = li && li.querySelector( '.Z3988' );
		const csl = li && li.getAttribute( 'data-cite-csl-json' );
		const readers = {
			jsonld: works[ id ] ? fromJsonLd( works[ id ] ) : null,
			coins: coins ? fromCoins( coins.getAttribute( 'title' ) ) : null,
			cslJson: csl ? fromCsl( JSON.parse( csl ) ) : null,
		};
		Object.keys( layers ).forEach(
			( layer ) => readers[ layer ] && layers[ layer ]++
		);

		// What a text-only reader sees: the entry's words and its link targets.
		const text = li
			? `${
					li.querySelector( '.bibliography-builder-entry-text' )
						?.textContent ?? li.textContent
				} ${ [ ...li.querySelectorAll( 'a[href]' ) ]
					.map( ( a ) => a.href )
					.join( ' ' ) }`
			: '';

		for ( const field of FIELDS ) {
			if ( expected[ field ] === undefined ) {
				continue;
			}
			let category = null;
			for ( const [ layer, fields ] of Object.entries( readers ) ) {
				if (
					fields &&
					matches( field, expected[ field ], fields[ field ] )
				) {
					perLayer[ layer ].correct++;
					perLayer[ layer ].byField[ field ]++;
					category = 'labeled';
				}
			}
			category = category || fromText( field, expected[ field ], text );
			byField[ field ][ category ]++;
			totals[ category ]++;
			totals.pairs++;
		}
	} );

	return { entriesWithLayer: layers, perLayer, byField, totals };
}

/* ------------------------------------------------------------------ */
/* Reader mode                                                         */
/* ------------------------------------------------------------------ */

function readerMode( html, url, items ) {
	const dom = new JSDOM( html, { url } );
	const article = new Readability( dom.window.document ).parse();
	const markdown = new TurndownService( { headingStyle: 'atx' } ).turndown(
		article ? article.content : ''
	);
	const doiLinks = (
		markdown.match( /\]\(https?:\/\/(dx\.)?doi\.org\/[^)]+\)/g ) || []
	).length;
	const titles = items.filter( ( item ) =>
		norm( markdown ).includes( norm( item.title ) )
	).length;

	return {
		markdownBytes: Buffer.byteLength( markdown ),
		markdownTokens: approxTokens( markdown ),
		titlesKept: titles,
		doiLinksKept: doiLinks,
		jsonLdKept: /application\/ld\+json|"@context"/.test( markdown ),
		markdown,
	};
}

/* ------------------------------------------------------------------ */
/* Browser: accessibility and JavaScript-off checks                    */
/* ------------------------------------------------------------------ */

async function launchChromium() {
	// Playwright comes from the plugin's own devDependencies, which ships the
	// browser build CI uses.
	// eslint-disable-next-line import/no-extraneous-dependencies
	const { chromium } = require( '@playwright/test' );
	try {
		return await chromium.launch();
	} catch {
		const executablePath =
			process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
		return chromium.launch( { executablePath } );
	}
}

async function browserChecks( browser, url ) {
	const page = await browser.newPage();
	await page.goto( url, { waitUntil: 'load' } );
	await page.addScriptTag( {
		path: require.resolve( 'axe-core/axe.min.js' ),
	} );
	const axe = await page.evaluate( async () => {
		const result = await window.axe.run( document, {
			resultTypes: [ 'violations' ],
		} );
		return {
			violations: result.violations.map( ( v ) => ( {
				id: v.id,
				impact: v.impact,
				nodes: v.nodes.length,
			} ) ),
			passes: result.passes.length,
		};
	} );

	const cdp = await page.context().newCDPSession( page );
	const { nodes } = await cdp.send( 'Accessibility.getFullAXTree' );
	const roles = {};
	const landmarks = [];
	const LANDMARKS = new Set( [
		'main',
		'navigation',
		'region',
		'complementary',
		'banner',
		'contentinfo',
		'search',
		'form',
		'doc-bibliography',
	] );
	for ( const node of nodes ) {
		const role = node.role && node.role.value;
		if ( ! role || node.ignored ) {
			continue;
		}
		roles[ role ] = ( roles[ role ] || 0 ) + 1;
		if (
			role === 'link' &&
			node.name &&
			/^https?:\/\/\S+$/.test( node.name.value.trim() )
		) {
			roles.urlNamedLink = ( roles.urlNamedLink || 0 ) + 1;
		}
		if ( LANDMARKS.has( role ) ) {
			landmarks.push( { role, name: node.name ? node.name.value : '' } );
		}
	}
	await page.close();

	const noJs = await browser.newContext( { javaScriptEnabled: false } );
	const raw = await noJs.newPage();
	await raw.goto( url );
	const withoutJs = await raw.evaluate( () => ( {
		jsonLd: document.querySelectorAll(
			'script[type="application/ld+json"]'
		).length,
		coins: document.querySelectorAll( '.Z3988' ).length,
		entries: document.querySelectorAll( 'article li' ).length,
	} ) );
	await noJs.close();

	return {
		axe,
		// Chromium exposes an <li> inside a doc-bibliography region as
		// doc-biblioentry, a listitem subclass, so count both as entries.
		roles: {
			listitem: roles.listitem || 0,
			biblioentry: roles[ 'doc-biblioentry' ] || 0,
			list: roles.list || 0,
			link: roles.link || 0,
			// Links a screen reader announces as a bare URL.
			urlNamedLink: roles.urlNamedLink || 0,
		},
		landmarks,
		withoutJs,
	};
}

/**
 * The article's text without its scripts (JSON-LD sits inside the block).
 *
 * @param {Document} document Page document.
 */
function visibleText( document ) {
	const article = document.querySelector( 'article' ).cloneNode( true );
	article
		.querySelectorAll( 'script, style' )
		.forEach( ( node ) => node.remove() );
	return article.textContent.replace( /\s+/g, ' ' ).trim();
}

/* ------------------------------------------------------------------ */

async function main() {
	const items = ( await readCorpus() ).items;
	const manifest = await readManifest();
	const validator = new Validator( await schemaOrg() );
	openUrl = await zoteroOpenUrl();
	const server = await serve();
	const browser = await launchChromium();
	const results = {
		generated: new Date().toISOString(),
		corpus: { works: items.length, style: manifest.style },
		schemaOrgVersion: SCHEMA_VERSION,
		variants: {},
	};

	try {
		for ( const name of VARIANTS ) {
			const html = await readFile(
				join( OUT_DIR, `${ name }.html` ),
				'utf8'
			);
			const block = await readFile(
				join( OUT_DIR, `${ name }.post-content.html` ),
				'utf8'
			);
			const document = new JSDOM( html, { url: manifest.pageUrl } ).window
				.document;
			const reader = readerMode( html, manifest.pageUrl, items );
			await writeFile(
				join( OUT_DIR, `${ name }.reader.md` ),
				reader.markdown
			);
			delete reader.markdown;

			results.variants[ name ] = {
				weight: {
					pageBytes: Buffer.byteLength( html ),
					pageGzipBytes: gzipSync( html ).length,
					blockBytes: Buffer.byteLength( block ),
					pageTokens: approxTokens( html ),
					visibleTextBytes: Buffer.byteLength(
						visibleText( document )
					),
				},
				structuredData: await structuredData( html, validator ),
				fieldRecovery: fieldRecovery( document, items, manifest.order ),
				readerMode: reader,
				browser: await browserChecks(
					browser,
					`${ server.url }${ name }.html`
				),
			};
			process.stdout.write( `measured ${ name }\n` );
		}
	} finally {
		await browser.close();
		await server.close();
	}

	await writeFile(
		join( OUT_DIR, 'results.json' ),
		JSON.stringify( results, null, '\t' ) + '\n'
	);
	process.stdout.write( 'Wrote tools/markup-value/out/results.json\n' );
}

main().catch( ( error ) => {
	process.stderr.write( `${ error.stack || error }\n` );
	process.exit( 1 );
} );
