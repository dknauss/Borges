/**
 * Imports the COinS spans the plugin renders for coins-cases.json into
 * Zotero's own OpenURL reader, and fails unless every case comes out with
 * exactly the expected authors, in order: no name repeated, dropped, or moved.
 *
 * Run from the repository root after `composer install`:
 * `node tools/markup-value/zotero-coins.mjs` (or `npm run zotero` here).
 * The reader is downloaded into out/ on first use; see lib.mjs.
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TOOL_DIR, zoteroAuthors, zoteroOpenUrl } from './lib.mjs';

const { cases } = JSON.parse(
	await readFile( join( TOOL_DIR, 'coins-cases.json' ), 'utf8' )
);
const titles = JSON.parse(
	execFileSync( 'php', [ join( TOOL_DIR, 'coins-cases.php' ) ], {
		encoding: 'utf8',
	} )
);
const openUrl = await zoteroOpenUrl();
let failures = 0;

cases.forEach( ( testCase, index ) => {
	const got = zoteroAuthors( openUrl, titles[ index ] );
	const ok = JSON.stringify( got ) === JSON.stringify( testCase.expected );

	if ( ! ok ) {
		failures++;
	}

	// eslint-disable-next-line no-console
	console.log(
		`${ ok ? 'ok  ' : 'FAIL' } ${ testCase.name }: ${ JSON.stringify( got ) }` +
			( ok
				? ''
				: `\n     expected ${ JSON.stringify( testCase.expected ) }` )
	);
} );

// eslint-disable-next-line no-console
console.log( `${ cases.length - failures }/${ cases.length } cases pass` );
process.exitCode = failures ? 1 : 0;
