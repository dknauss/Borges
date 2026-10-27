/**
 * Shared helpers for the markup-value scripts: a static server for the
 * rendered pages, the corpus and manifest, and value normalization.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = dirname( fileURLToPath( import.meta.url ) );
export const OUT_DIR = join( TOOL_DIR, 'out' );
export const BUILD_DIR = join( TOOL_DIR, '..', '..', 'build' );
export const VARIANTS = [ 'plain', 'borges-default', 'borges-full' ];

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.json': 'application/json',
};

/**
 * Serves out/ at the root, and the plugin's build/ at /assets/, the way a
 * WordPress site serves the block's front-end CSS and view script.
 *
 * @return {Promise<{url: string, close: () => Promise<void>}>} Base URL and a closer.
 */
export async function serve() {
	const server = createServer( async ( req, res ) => {
		const path = normalize(
			decodeURIComponent( new URL( req.url, 'http://x' ).pathname )
		);
		const file = path.startsWith( '/assets/' )
			? join( BUILD_DIR, path.slice( 8 ) )
			: join( OUT_DIR, path );

		try {
			const body = await readFile( file );
			res.writeHead( 200, {
				'content-type':
					TYPES[ extname( file ) ] || 'application/octet-stream',
			} );
			res.end( body );
		} catch {
			res.writeHead( 404 );
			res.end( 'Not found' );
		}
	} );

	await new Promise( ( resolve ) =>
		server.listen( 0, '127.0.0.1', resolve )
	);

	return {
		url: `http://127.0.0.1:${ server.address().port }/`,
		close: () => new Promise( ( resolve ) => server.close( resolve ) ),
	};
}

export async function readJson( path ) {
	return JSON.parse( await readFile( path, 'utf8' ) );
}

export const corpus = () => readJson( join( TOOL_DIR, 'corpus.json' ) );
export const manifest = () => readJson( join( OUT_DIR, 'manifest.json' ) );

/**
 * Normalizes a value for comparison: Unicode NFKC, lowercase, dashes as
 * hyphens, curly quotes straightened, whitespace collapsed, and edge
 * punctuation trimmed.
 *
 * @param {unknown} value Any value.
 * @return {string} Normalized string, '' for empty values.
 */
export function norm( value ) {
	if ( value === undefined || value === null ) {
		return '';
	}

	return String( value )
		.normalize( 'NFKC' )
		.toLowerCase()
		.replace( /[‐-―−]/g, '-' )
		.replace( /[‘’]/g, "'" )
		.replace( /[“”]/g, '"' )
		.replace( /\s+/g, ' ' )
		.replace( /^[\s.,;:"']+|[\s.,;:"']+$/g, '' );
}

/**
 * ISBN digits only, so hyphenation differences do not count.
 *
 * @param {unknown} value Raw ISBN, with or without hyphens.
 */
export const isbnDigits = ( value ) =>
	String( value || '' )
		.replace( /[^0-9X]/gi, '' )
		.toUpperCase();

/**
 * Approximate LLM tokens: the common four-characters-per-token rule of thumb.
 *
 * @param {string} text Any text.
 */
export const approxTokens = ( text ) => Math.round( text.length / 4 );
