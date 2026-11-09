/**
 * How often Borges's free-text parser returns a wrong record.
 *
 * borges-parser.mjs measures recall: how much of Borges's own rendered lists
 * the parser recovers. This measures precision on other people's
 * references: AnyStyle's hand-labelled training data, thousands of real
 * references in many styles, each with its title and date marked. Every
 * reference goes through parseFreeTextCitation(); for each one it accepts,
 * the parsed title is compared with the labelled one. A wrong title on an
 * accepted reference is a quietly wrong citation, which is worse than a
 * refusal, so a parser change must not raise the wrong-title rate. See
 * docs/planning/free-text-styles-plan.md, "Gates".
 *
 * The data ships in the anystyle gem (res/parser/*.xml, BSD-2-Clause,
 * Copyright 2011-2023 Sylvester Keil), not in anystyle-data, which holds
 * only a dictionary. Nothing is committed: the gem is fetched at a pinned
 * version into out/anystyle-gem/ on the first run (needs Ruby's `gem`), or
 * read from ANYSTYLE_RES, a directory holding the XML files.
 *
 * Run: `node anystyle-precision.mjs` (or `npm run anystyle-precision`).
 * Writes anystyle-precision.json to MV_OUT (default out/).
 */

import { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { OUT_DIR } from './lib.mjs';

register( './src-esm-hooks.mjs', import.meta.url );
const { parseFreeTextCitation } =
	await import( '../../src/lib/free-text-parser.js' );

const ANYSTYLE_VERSION = '1.6.0';

/**
 * The labelled sets read. `bad.xml` and `ugly.xml` hold deliberately broken
 * references, which no rule-based parser should accept.
 */
const DATA_FILES = [ 'core.xml', 'gold.xml', 'good.xml' ];

/**
 * Rough style subsets, chosen from the printed text. They overlap and miss
 * entries; they show where errors cluster, not exact per-style figures.
 */
const SUBSETS = {
	'IEEE-like ("Title," in quotes)': ( text ) =>
		/“[^”]+,” |"[^"]+," /u.test( text ),
	'Labelled vol. … pp.': ( text ) => /\bvol\. \d+.*\bpp?\. \d/u.test( text ),
	'ABNT-like (SURNAME, in capitals)': ( text ) =>
		/^[A-ZÁÉÍÓÚÇÃ]{3,}, /u.test( text ),
	'Harvard-like (Surname, I. (Year))': ( text ) =>
		/^[A-Z][a-z]+, [A-Z]\.(?: ?[A-Z]\.)? \(\d{4}\) /u.test( text ),
	'Numbered ([n] or n.)': ( text ) =>
		/^(?:\[\d+\]|\d{1,3}\.)\s/u.test( text ),
};

/**
 * The directory holding AnyStyle's labelled XML, fetching the gem if needed.
 *
 * @return {string} Directory path.
 */
function dataDir() {
	if ( process.env.ANYSTYLE_RES ) {
		return process.env.ANYSTYLE_RES;
	}

	const gemDir = join( OUT_DIR, 'anystyle-gem' );
	const resDir = join( gemDir, 'res', 'parser' );

	if ( ! existsSync( join( resDir, DATA_FILES[ 0 ] ) ) ) {
		const gem = `anystyle-${ ANYSTYLE_VERSION }.gem`;
		execFileSync( 'gem', [ 'fetch', 'anystyle', '-v', ANYSTYLE_VERSION ], {
			cwd: gemDir,
			stdio: 'pipe',
		} );
		execFileSync( 'tar', [ 'xf', gem ], { cwd: gemDir } );
		execFileSync( 'tar', [ 'xzf', 'data.tar.gz', 'res/parser' ], {
			cwd: gemDir,
		} );
	}

	return resDir;
}

/**
 * Collapse runs of white space.
 *
 * @param {string|null} text Text.
 * @return {string} Text on one line.
 */
function squash( text ) {
	return ( text || '' ).replace( /\s+/gu, ' ' ).trim();
}

/**
 * Read the labelled references from one XML file.
 *
 * Each `<sequence>` is one reference; its children (`author`, `title`,
 * `date`, …) are its parts in order, so joining them gives the printed text.
 *
 * @param {string} xml File contents.
 * @return {Array<{text: string, title: string, year: string}>} References.
 */
function readReferences( xml ) {
	const { document } = new JSDOM( xml, { contentType: 'text/xml' } ).window;

	return [ ...document.querySelectorAll( 'sequence' ) ].map( ( sequence ) => {
		const parts = [ ...sequence.children ];
		const first = ( tag ) =>
			squash( parts.find( ( p ) => p.tagName === tag )?.textContent );

		return {
			text: parts.map( ( p ) => squash( p.textContent ) ).join( ' ' ),
			title: first( 'title' ),
			year: first( 'date' ).match( /\d{4}/u )?.[ 0 ] || '',
		};
	} );
}

/**
 * Lower case, punctuation removed, for comparing titles.
 *
 * @param {string} text Title.
 * @return {string} Comparable form.
 */
function normalize( text ) {
	return ( text || '' )
		.toLowerCase()
		.replace( /[^\p{L}\p{N}]+/gu, ' ' )
		.trim();
}

/**
 * Whether a parsed title matches the labelled one. One may be a prefix of
 * the other, since a labelled title can carry its subtitle separately.
 *
 * @param {string} parsed   Parsed title.
 * @param {string} expected Labelled title.
 * @return {boolean} True when they match.
 */
function titleMatches( parsed, expected ) {
	const a = normalize( parsed );
	const b = normalize( expected );

	return Boolean(
		a && b && ( a === b || b.startsWith( a ) || a.startsWith( b ) )
	);
}

/**
 * Score a set of references.
 *
 * @param {Array} references References with their parse results.
 * @return {Object} Counts and rates.
 */
function score( references ) {
	const accepted = references.filter( ( r ) => r.parsed );
	const titled = accepted.filter( ( r ) => r.title );
	const wrongTitle = titled.filter(
		( r ) => ! titleMatches( r.parsed.title, r.title )
	);
	const dated = accepted.filter( ( r ) => r.year );
	const wrongYear = dated.filter(
		( r ) =>
			String( r.parsed.issued?.[ 'date-parts' ]?.[ 0 ]?.[ 0 ] ) !== r.year
	);
	const rate = ( part, whole ) =>
		whole ? Math.round( ( 1000 * part ) / whole ) / 10 : null;

	return {
		references: references.length,
		accepted: accepted.length,
		wrongTitle: wrongTitle.length,
		wrongTitlePct: rate( wrongTitle.length, titled.length ),
		wrongYear: wrongYear.length,
		wrongYearPct: rate( wrongYear.length, dated.length ),
		examples: wrongTitle.slice( 0, 5 ).map( ( r ) => ( {
			text: r.text,
			parsedTitle: r.parsed.title,
			expectedTitle: r.title,
		} ) ),
	};
}

async function main() {
	await mkdir( join( OUT_DIR, 'anystyle-gem' ), { recursive: true } );
	const dir = dataDir();
	const references = [];

	for ( const file of DATA_FILES ) {
		references.push(
			...readReferences( await readFile( join( dir, file ), 'utf8' ) )
		);
	}

	for ( const reference of references ) {
		reference.parsed = parseFreeTextCitation( reference.text )?.csl || null;
	}

	const result = {
		source: `anystyle ${ ANYSTYLE_VERSION } res/parser/{${ DATA_FILES.join(
			','
		) }}`,
		all: score( references ),
		subsets: Object.fromEntries(
			Object.entries( SUBSETS ).map( ( [ name, test ] ) => [
				name,
				score( references.filter( ( r ) => test( r.text ) ) ),
			] )
		),
	};

	await writeFile(
		join( OUT_DIR, 'anystyle-precision.json' ),
		JSON.stringify( result, null, '\t' ) + '\n'
	);

	const rows = [ [ 'All', result.all ], ...Object.entries( result.subsets ) ];
	// eslint-disable-next-line no-console
	console.log(
		'| Subset | References | Accepted | Wrong title | Wrong year |\n|---|---|---|---|---|'
	);
	for ( const [ name, s ] of rows ) {
		// eslint-disable-next-line no-console
		console.log(
			`| ${ name } | ${ s.references } | ${ s.accepted } | ${
				s.wrongTitle
			} (${ s.wrongTitlePct ?? '–' }%) | ${ s.wrongYear } (${
				s.wrongYearPct ?? '–'
			}%) |`
		);
	}
}

await main();
