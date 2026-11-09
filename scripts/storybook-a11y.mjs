#!/usr/bin/env node
/* eslint-disable no-console -- a CLI report. */
/**
 * Loads every story in a built Storybook in Chromium and runs axe on it.
 *
 * Fails when a story throws or logs a console error, when a story renders
 * nothing it was not meant to (stories whose name says so may be empty),
 * or when axe reports a violation inside the story.
 *
 * Usage: node scripts/storybook-a11y.mjs [storybook-static]
 * (npm run test:storybook builds Storybook first.)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const root = resolve( process.argv[ 2 ] || 'storybook-static' );
const MIME = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
	'.png': 'image/png',
};

// Stories that are meant to render nothing.
const MAY_BE_EMPTY = /--(no-notice|apa-shows-nothing)$/;

const server = createServer( async ( request, response ) => {
	const path = decodeURIComponent( request.url.split( '?' )[ 0 ] );
	const file = normalize( join( root, path === '/' ? 'index.html' : path ) );

	if ( ! file.startsWith( root ) ) {
		response.writeHead( 403 ).end();
		return;
	}

	try {
		const body = await readFile( file );
		response
			.writeHead( 200, {
				'content-type':
					MIME[ extname( file ) ] || 'application/octet-stream',
			} )
			.end( body );
	} catch {
		response.writeHead( 404 ).end();
	}
} );

await new Promise( ( done ) => server.listen( 0, '127.0.0.1', done ) );
const base = `http://127.0.0.1:${ server.address().port }`;

const index = JSON.parse(
	await readFile( join( root, 'index.json' ), 'utf8' )
);
const stories = Object.values( index.entries ).filter(
	( entry ) => entry.type === 'story'
);

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on( 'pageerror', ( error ) => pageErrors.push( error.message ) );
page.on( 'console', ( message ) => {
	// Failed requests are reported below, with their URL.
	if (
		message.type() === 'error' &&
		! message.text().startsWith( 'Failed to load resource' )
	) {
		pageErrors.push( message.text() );
	}
} );
page.on( 'response', ( response ) => {
	// Chromium asks for a favicon the static build doesn't have.
	if (
		response.status() >= 400 &&
		! response.url().endsWith( '/favicon.ico' )
	) {
		pageErrors.push( `${ response.status() } ${ response.url() }` );
	}
} );

let failures = 0;

for ( const story of stories ) {
	pageErrors.length = 0;
	await page.goto( `${ base }/iframe.html?id=${ story.id }&viewMode=story`, {
		waitUntil: 'networkidle',
	} );
	await page.locator( '#storybook-root' ).waitFor( { state: 'attached' } );

	const html = await page.locator( '#storybook-root' ).innerHTML();
	const results = await new AxeBuilder( { page } )
		.include( '#storybook-root' )
		.analyze();

	const problems = [
		...pageErrors.map( ( text ) => `error: ${ text }` ),
		...( html.trim() === '' && ! MAY_BE_EMPTY.test( story.id )
			? [ 'rendered nothing' ]
			: [] ),
		...results.violations.map(
			( violation ) =>
				`axe ${ violation.id } (${ violation.nodes.length }): ${ violation.help }`
		),
	];

	if ( problems.length ) {
		failures++;
		console.log( `FAIL ${ story.id }` );
		problems.forEach( ( problem ) => console.log( `     ${ problem }` ) );
	} else {
		console.log( `ok   ${ story.id }` );
	}
}

await browser.close();
server.close();

console.log(
	`\n${ stories.length - failures } of ${ stories.length } stories passed.`
);
process.exitCode = failures ? 1 : 0;
