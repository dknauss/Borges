const fs = require( 'fs' );
const path = require( 'path' );

import {
	MAX_CITATIONS_PER_BIBLIOGRAPHY,
	MAX_ENTRIES_PER_PASTE,
} from './citation-limits';

function readPhpConstant( relativePath, name ) {
	const source = fs.readFileSync(
		path.resolve( __dirname, '../..', relativePath ),
		'utf8'
	);
	const match = source.match(
		new RegExp( `const ${ name } = (\\d+);`, 'u' )
	);

	return match ? Number( match[ 1 ] ) : null;
}

describe( 'citation limits', () => {
	// The editor sends the whole bibliography to /format in one request, so a
	// server cap below the editor's would quietly drop every larger
	// bibliography to the raw-text fallback.
	test( 'the formatter route accepts a full bibliography', () => {
		expect(
			readPhpConstant(
				'bibliography-builder.php',
				'BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS'
			)
		).toBe( MAX_CITATIONS_PER_BIBLIOGRAPHY );
	} );

	test( 'the write routes add no more per request than a paste', () => {
		expect(
			readPhpConstant(
				'includes/write-routes.php',
				'BIBLIOGRAPHY_BUILDER_MAX_ITEMS_PER_WRITE'
			)
		).toBe( MAX_ENTRIES_PER_PASTE );
	} );
} );
