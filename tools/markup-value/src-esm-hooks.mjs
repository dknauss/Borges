/**
 * Node module hooks that let these tools import Borges's own src/lib modules,
 * which are written for the webpack build: extensionless relative imports,
 * and ES module syntax in a package Node treats as CommonJS. Registered by
 * borges-parser.mjs; not used by the plugin.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve( specifier, context, next ) {
	if (
		specifier.startsWith( '.' ) &&
		context.parentURL &&
		! /\.[cm]?js$|\.json$/.test( specifier )
	) {
		const url = new URL( specifier + '.js', context.parentURL );
		if ( existsSync( fileURLToPath( url ) ) ) {
			return next( url.href, context );
		}
	}
	return next( specifier, context );
}
export async function load( url, context, next ) {
	if ( url.includes( '/src/lib/' ) && url.endsWith( '.js' ) ) {
		return next( url, { ...context, format: 'module' } );
	}
	return next( url, context );
}
