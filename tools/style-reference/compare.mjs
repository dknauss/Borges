/**
 * Renders the CSL style corpus (tests/fixtures/csl-styles/items.json) with
 * citeproc-js, the engine Zotero and Mendeley use, and reports, per style and
 * per entry, where the reviewed Borges goldens differ from it.
 *
 * Two renderings per style:
 *
 * - "official": the CSL project's own style for the same manual, at a pinned
 *   commit. A difference here is a question about the style rules: either
 *   Borges or the official style may be wrong, or the two follow different
 *   editions. Read each one against the manual.
 * - "engine": Borges's own CSL file, run through citeproc-js instead of
 *   citeproc-php. A difference here is an engine difference, or one of the
 *   formatter adaptations in includes/formatter.php (docs/csl-styles.md).
 *
 * The goldens are never rewritten. Run from the repository root:
 * `node tools/style-reference/compare.mjs` (or `npm run compare` here).
 * Options: `--style=apa-7` for one style, `--json` for raw results on stdout.
 * The official styles and locales are downloaded into out/ on first use. They
 * are CC BY-SA 3.0, so they stay out of the repository and the plugin.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire( import.meta.url );
// The root package's citeproc devDependency, which the sort conformance tests use.
// eslint-disable-next-line import/no-extraneous-dependencies
const CSL = require( 'citeproc' );

const TOOL_DIR = dirname( fileURLToPath( import.meta.url ) );
const ROOT = join( TOOL_DIR, '..', '..' );
const OUT_DIR = join( TOOL_DIR, 'out' );
const FIXTURES = join( ROOT, 'tests', 'fixtures', 'csl-styles' );

// Pinned so the report only changes when someone moves these on purpose.
const STYLES_COMMIT = 'e98c3b8a5371ad571abcf2192b75dfdd392243f2';
const LOCALES_COMMIT = '8bef426f89f38c0789223c50e53ec2197bc50bb3';

/**
 * Borges style key => the official style for the same manual, and the
 * edition gap when the two follow different editions.
 */
const OFFICIAL = {
	'chicago-notes-bibliography': { file: 'chicago-notes-bibliography' },
	'chicago-author-date': { file: 'chicago-author-date' },
	'apa-7': { file: 'apa' },
	'mla-9': { file: 'modern-language-association' },
	harvard: {
		file: 'harvard-cite-them-right',
		edition:
			'Official style follows Cite Them Right 12th ed.; Borges follows the 13th (2025).',
	},
	ieee: { file: 'ieee' },
	// vancouver.csl is a dependent style of this one.
	vancouver: { file: 'nlm-citation-sequence' },
	oscola: {
		file: 'oscola',
		edition:
			'Official style follows OSCOLA 4th ed.; Borges follows the 5th (2026).',
	},
	abnt: { file: 'associacao-brasileira-de-normas-tecnicas' },
};

/**
 * Downloads a file once into out/, from a pinned raw.githubusercontent URL.
 *
 * @param {string} repo   Repository under citation-style-language.
 * @param {string} commit Commit SHA.
 * @param {string} file   Path in the repository.
 * @return {Promise<string>} File contents.
 */
async function fetchPinned( repo, commit, file ) {
	const dir = join( OUT_DIR, repo );
	const path = join( dir, file );

	if ( ! existsSync( path ) ) {
		const url = `https://raw.githubusercontent.com/citation-style-language/${ repo }/${ commit }/${ file }`;
		const res = await fetch( url );
		if ( ! res.ok ) {
			throw new Error( `Could not download ${ url } (${ res.status })` );
		}
		await mkdir( dir, { recursive: true } );
		await writeFile( path, await res.text() );
	}

	return readFile( path, 'utf8' );
}

const officialLocale = ( lang ) =>
	fetchPinned( 'locales', LOCALES_COMMIT, `locales-${ lang }.xml` );

const borgesLocale = ( lang ) =>
	readFile(
		join(
			ROOT,
			'packages',
			'citation-style-language-locales',
			`locales-${ lang }.xml`
		),
		'utf8'
	);

/**
 * Renders every item with citeproc-js, keyed by item id.
 *
 * @param {Object[]}                          items     CSL-JSON items.
 * @param {string}                            styleXml  CSL style.
 * @param {string}                            lang      Locale code.
 * @param {(lang: string) => Promise<string>} getLocale Locale loader.
 * @return {Promise<Object<string, string>>} Plain-text entries by id.
 */
async function render( items, styleXml, lang, getLocale ) {
	// citeproc-js asks for locales synchronously, so load the likely ones first.
	const locales = {};
	for ( const code of new Set( [ lang, 'en-US' ] ) ) {
		try {
			locales[ code ] = await getLocale( code );
		} catch {
			// The engine falls back to en-US.
		}
	}

	const byId = Object.fromEntries(
		items.map( ( item ) => [ item.id, item ] )
	);
	const engine = new CSL.Engine(
		{
			retrieveLocale: ( code ) => locales[ code ] || locales[ 'en-US' ],
			retrieveItem: ( id ) => byId[ id ],
		},
		styleXml,
		lang,
		true
	);
	engine.setOutputFormat( 'text' );
	engine.updateItems( Object.keys( byId ) );

	const [ meta, entries ] = engine.makeBibliography();
	const out = {};

	meta.entry_ids.forEach( ( ids, index ) => {
		out[ ids[ 0 ] ] = clean( entries[ index ] );
	} );

	return out;
}

/**
 * Trims an entry and drops the citation number numeric styles put first;
 * Borges numbers with the list element instead (docs/csl-styles.md).
 *
 * @param {string} text citeproc-js text output.
 */
const clean = ( text ) =>
	text
		.replace( /^\s*\[?\d+\]?\.?\s+/, '' )
		.replace( /\s+/g, ' ' )
		.trim();

/**
 * Folds the differences docs/csl-styles.md lists as deliberate, or that are
 * typographic only: letter case (Borges keeps stored title case), quote
 * marks, dash forms, angle brackets around URLs, and a final full stop.
 *
 * @param {string} text Entry text.
 */
const fold = ( text ) =>
	text
		.normalize( 'NFKC' )
		.toLowerCase()
		.replace( /[‐-―−]/g, '-' )
		.replace( /[‘’‚‛]/g, "'" )
		.replace( /[“”„‟«»]/g, '"' )
		.replace( /<(https?:[^>]+)>/g, '$1' )
		.replace( /\s+/g, ' ' )
		.replace( /[.\s]+$/, '' );

/**
 * A word-level diff: [-golden only-] {+reference only+}.
 *
 * @param {string} a Golden.
 * @param {string} b Reference.
 */
function wordDiff( a, b ) {
	const x = a.split( ' ' );
	const y = b.split( ' ' );
	const lcs = Array.from( { length: x.length + 1 }, () =>
		new Array( y.length + 1 ).fill( 0 )
	);

	for ( let i = x.length - 1; i >= 0; i-- ) {
		for ( let j = y.length - 1; j >= 0; j-- ) {
			lcs[ i ][ j ] =
				x[ i ] === y[ j ]
					? lcs[ i + 1 ][ j + 1 ] + 1
					: Math.max( lcs[ i + 1 ][ j ], lcs[ i ][ j + 1 ] );
		}
	}

	const parts = [];
	const push = ( kind, word ) => {
		const last = parts[ parts.length - 1 ];
		if ( last && last.kind === kind ) {
			last.words.push( word );
		} else {
			parts.push( { kind, words: [ word ] } );
		}
	};
	let i = 0;
	let j = 0;

	while ( i < x.length || j < y.length ) {
		if ( i < x.length && j < y.length && x[ i ] === y[ j ] ) {
			push( '=', x[ i++ ] );
			j++;
		} else if (
			j < y.length &&
			( i === x.length || lcs[ i ][ j + 1 ] >= lcs[ i + 1 ][ j ] )
		) {
			push( '+', y[ j++ ] );
		} else {
			push( '-', x[ i++ ] );
		}
	}

	return parts
		.map( ( { kind, words } ) => {
			const text = words.join( ' ' );
			if ( kind === '-' ) {
				return `[-${ text }-]`;
			}
			return kind === '+' ? `{+${ text }+}` : text;
		} )
		.join( ' ' );
}

/**
 * Sorts one comparison into exact, folded (typography and case only), or a
 * real difference.
 *
 * @param {string}           golden    Borges golden line.
 * @param {string|undefined} reference citeproc-js output.
 */
function compare( golden, reference ) {
	if ( reference === undefined ) {
		return { status: 'missing' };
	}
	if ( golden === reference ) {
		return { status: 'exact' };
	}
	if ( fold( golden ) === fold( reference ) ) {
		return { status: 'typography', diff: wordDiff( golden, reference ) };
	}
	return { status: 'differs', diff: wordDiff( golden, reference ) };
}

async function readGoldens( styleKey ) {
	const text = await readFile(
		join( FIXTURES, `${ styleKey }.txt` ),
		'utf8'
	);

	return Object.fromEntries(
		text
			.split( '\n' )
			.filter( Boolean )
			.map( ( line ) => line.split( '\t' ) )
	);
}

const args = process.argv.slice( 2 );
const only = args.find( ( arg ) => arg.startsWith( '--style=' ) )?.slice( 8 );
const styleData = JSON.parse(
	await readFile( join( ROOT, 'includes', 'styles.json' ), 'utf8' )
);
const items = JSON.parse(
	await readFile( join( FIXTURES, 'items.json' ), 'utf8' )
);
const results = {};

for ( const [ styleKey, style ] of Object.entries( styleData.styles ) ) {
	if ( ( only && only !== styleKey ) || ! OFFICIAL[ styleKey ] ) {
		continue;
	}

	const goldens = await readGoldens( styleKey );
	const borgesXml = await readFile(
		join(
			ROOT,
			'packages',
			'citation-style-language-styles',
			`${ style.cslTemplate }.csl`
		),
		'utf8'
	);
	const officialXml = await fetchPinned(
		'styles',
		STYLES_COMMIT,
		`${ OFFICIAL[ styleKey ].file }.csl`
	);
	const official = await render(
		items,
		officialXml,
		style.locale,
		officialLocale
	);
	const engine = await render( items, borgesXml, style.locale, borgesLocale );

	results[ styleKey ] = {
		officialStyle: OFFICIAL[ styleKey ].file,
		edition: OFFICIAL[ styleKey ].edition || null,
		entries: items.map( ( { id } ) => ( {
			id,
			golden: goldens[ id ],
			official: official[ id ],
			engine: engine[ id ],
			vsOfficial: compare( goldens[ id ], official[ id ] ),
			vsEngine: compare( goldens[ id ], engine[ id ] ),
		} ) ),
	};
}

if ( args.includes( '--json' ) ) {
	// eslint-disable-next-line no-console
	console.log(
		JSON.stringify( { STYLES_COMMIT, LOCALES_COMMIT, results }, null, '\t' )
	);
} else {
	await mkdir( OUT_DIR, { recursive: true } );
	await writeFile( join( OUT_DIR, 'report.md' ), report( results ) );
	await writeFile(
		join( OUT_DIR, 'results.json' ),
		JSON.stringify( results, null, '\t' )
	);

	for ( const [ styleKey, { entries } ] of Object.entries( results ) ) {
		const count = ( key, status ) =>
			entries.filter( ( entry ) => entry[ key ].status === status )
				.length;

		// eslint-disable-next-line no-console
		console.log(
			`${ styleKey.padEnd( 27 ) } official: ${ count( 'vsOfficial', 'exact' ) } exact, ${ count( 'vsOfficial', 'typography' ) } typography, ${ count( 'vsOfficial', 'differs' ) } differ` +
				` | engine: ${ count( 'vsEngine', 'exact' ) } exact, ${ count( 'vsEngine', 'typography' ) } typography, ${ count( 'vsEngine', 'differs' ) } differ`
		);
	}
	// eslint-disable-next-line no-console
	console.log( `Report: ${ join( OUT_DIR, 'report.md' ) }` );
}

/**
 * The Markdown report: a summary table, then every entry that is not an
 * exact match, with its word diff.
 *
 * @param {Object} data Results by style key.
 */
function report( data ) {
	const lines = [
		'# Borges style goldens against citeproc-js',
		'',
		`Official styles at citation-style-language/styles@${ STYLES_COMMIT.slice( 0, 7 ) }, locales at citation-style-language/locales@${ LOCALES_COMMIT.slice( 0, 7 ) }, citeproc-js ${ CSL.PROCESSOR_VERSION }.`,
		'',
		'Diffs read `[-Borges golden-] {+citeproc-js+}`. "Typography" means the two differ only in letter case, quote or dash forms, URL angle brackets, or a final full stop.',
		'',
		'| Style | Official style | vs official: exact / typography / differ | vs engine: exact / typography / differ |',
		'| --- | --- | --- | --- |',
	];

	for ( const [ styleKey, { officialStyle, entries } ] of Object.entries(
		data
	) ) {
		const tally = ( key ) =>
			[ 'exact', 'typography', 'differs' ]
				.map(
					( status ) =>
						entries.filter(
							( entry ) => entry[ key ].status === status
						).length
				)
				.join( ' / ' );
		lines.push(
			`| \`${ styleKey }\` | \`${ officialStyle }\` | ${ tally( 'vsOfficial' ) } | ${ tally( 'vsEngine' ) } |`
		);
	}

	for ( const [
		styleKey,
		{ officialStyle, edition, entries },
	] of Object.entries( data ) ) {
		lines.push( '', `## \`${ styleKey }\``, '' );
		if ( edition ) {
			lines.push( `${ edition }`, '' );
		}

		for ( const [ key, label ] of [
			[ 'vsOfficial', `Against the official \`${ officialStyle }\`` ],
			[ 'vsEngine', 'Against Borges’s own CSL in citeproc-js (engine)' ],
		] ) {
			const shown = entries.filter(
				( entry ) => entry[ key ].status !== 'exact'
			);
			lines.push( `### ${ label }`, '' );
			if ( ! shown.length ) {
				lines.push( 'Every entry matches.', '' );
				continue;
			}
			for ( const entry of shown ) {
				lines.push(
					`- **${ entry.id }** (${ entry[ key ].status }): ${ entry[ key ].diff || 'no output' }`
				);
			}
			lines.push( '' );
		}
	}

	return lines.join( '\n' );
}
