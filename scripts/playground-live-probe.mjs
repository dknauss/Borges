#!/usr/bin/env node
/* eslint-disable no-console, import/no-extraneous-dependencies -- a CLI report; playwright comes with @playwright/test */
/**
 * Live Playground probe.
 *
 * Opens the README's Playground demo links on playground.wordpress.net the way
 * a reader does (a fresh browser profile, so nothing is cached), and reports
 * whether the demo boots or Playground shows its error screen ("Try again").
 * Each run logs the network requests the blueprint makes (the CORS proxy, the
 * GitHub release ZIP, WordPress.org downloads) with status and timing, plus
 * the browser console's errors, so a first-load failure can be traced to the
 * step that failed.
 *
 * Usage:
 *   node scripts/playground-live-probe.mjs [blueprint-url ...]
 *
 * Environment:
 *   PROBE_RUNS       Fresh-profile loads per blueprint (default 3).
 *   PROBE_TIMEOUT    Milliseconds to wait for the editor (default 90000).
 *   PROBE_BROWSER    chromium (default), firefox, or webkit (Safari's engine).
 *   PROBE_ANY_BLOCK  Count any block as ready, for a control blueprint
 *                    without Borges (scripts/probe-fixtures/).
 *
 * A load passes when the block editor initializes with a Borges block in it,
 * not merely when its markup appears: in November 2026 some Chromium loads
 * rendered the page while Playground's service worker failed to serve core
 * editor scripts (a11y.min.js, url.min.js), so the editor never started. The
 * exit code is 1 when any load fails.
 *
 * It needs a browser that can reach playground.wordpress.net, so it is run
 * by .github/workflows/playground-live-probe.yml, not in CI's normal jobs.
 */
import { appendFileSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright';

const DEFAULT_BLUEPRINTS = [
	'https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint.json',
	'https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint-main.json',
];

const blueprints = process.argv.slice( 2 ).length
	? process.argv.slice( 2 )
	: DEFAULT_BLUEPRINTS;
/**
 * Reads a positive whole number from the environment, or exits: a run count of
 * 0 or "five" would otherwise probe nothing and still pass.
 *
 * @param {string} name     Variable name.
 * @param {number} fallback Value when the variable is unset or empty.
 * @return {number} The value.
 */
function positiveInteger( name, fallback ) {
	const raw = process.env[ name ];
	const value = raw === undefined || raw === '' ? fallback : Number( raw );
	if ( ! Number.isInteger( value ) || value < 1 ) {
		console.error(
			`${ name } must be a positive whole number, not "${ raw }".`
		);
		process.exit( 2 );
	}
	return value;
}

const runs = positiveInteger( 'PROBE_RUNS', 3 );
const timeout = positiveInteger( 'PROBE_TIMEOUT', 90000 );

// Requests worth logging: everything a blueprint fetches, not Playground's own
// static assets.
const INTERESTING =
	/cors-proxy|github\.com|githubusercontent|wordpress\.org\/plugins|downloads\.wordpress\.org|api\.wordpress\.org|blueprint/i;

/**
 * Finds the WordPress frame and reports whether the block editor is up.
 *
 * @param {import('playwright').Page} page Page.
 * @return {Promise<boolean>} Whether the editor rendered.
 */
async function editorReady( page ) {
	for ( const frame of page.frames() ) {
		try {
			// The editor initialized and the block store holds a Borges
			// block: markup alone can be present while the editor's scripts
			// failed to load.
			const ready = await frame.evaluate( ( anyBlock ) => {
				const data = window.wp && window.wp.data;
				if ( ! data || ! data.select ) {
					return false;
				}
				const editor = data.select( 'core/block-editor' );
				return !! (
					editor &&
					editor
						.getBlocks()
						.some(
							( block ) =>
								anyBlock ||
								block.name.startsWith( 'bibliography-builder/' )
						)
				);
			}, !! process.env.PROBE_ANY_BLOCK );
			if ( ready ) {
				return true;
			}
		} catch {
			// Frame navigated away; try the next one.
		}
	}
	return false;
}

/**
 * Reports Playground's error screen text, if it is showing.
 *
 * @param {import('playwright').Page} page Page.
 * @return {Promise<string>} Error text, or ''.
 */
async function errorScreen( page ) {
	for ( const frame of page.frames() ) {
		try {
			const button = frame.getByRole( 'button', { name: /try again/i } );
			if ( ( await button.count() ) > 0 ) {
				const text = await frame.locator( 'body' ).innerText();
				return text.replace( /\s+/g, ' ' ).slice( 0, 1500 );
			}
		} catch {
			// Ignore detached frames.
		}
	}
	return '';
}

/**
 * Loads one blueprint once in a fresh profile.
 *
 * @param {import('playwright').Browser} browser    Browser.
 * @param {string}                       blueprint  Blueprint URL.
 * @param {number}                       run        Run number.
 * @param {boolean}                      retryInTab Whether to reload once on failure, like "Try again".
 * @return {Promise<string>} Outcome.
 */
async function probe( browser, blueprint, run, retryInTab ) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const started = Date.now();
	const since = () =>
		`${ ( ( Date.now() - started ) / 1000 ).toFixed( 1 ) }s`;
	const log = ( line ) => console.log( `  [${ since() }] ${ line }` );
	const requestStart = new Map();

	context.on( 'request', ( req ) => {
		if ( INTERESTING.test( req.url() ) ) {
			requestStart.set( req, Date.now() );
			log( `→ ${ req.method() } ${ req.url() }` );
		}
	} );
	context.on( 'requestfinished', async ( req ) => {
		if ( ! requestStart.has( req ) ) {
			return;
		}
		const res = await req.response();
		const ms = Date.now() - requestStart.get( req );
		log( `← ${ res ? res.status() : '???' } ${ ms }ms ${ req.url() }` );
	} );
	// Every failed request, whatever its host: a script the editor needs
	// failing to load is as fatal as a blueprint fetch failing.
	context.on( 'requestfailed', ( req ) => {
		if ( ! /google-analytics|googletagmanager/.test( req.url() ) ) {
			log(
				`✗ FAILED ${ req.resourceType() } ${ req.url() } (${
					req.failure()?.errorText
				})`
			);
		}
	} );
	context.on( 'response', ( res ) => {
		if ( res.status() >= 400 ) {
			log( `✗ HTTP ${ res.status() } ${ res.url() }` );
		}
	} );
	page.on( 'console', ( msg ) => {
		if ( [ 'error', 'warning' ].includes( msg.type() ) ) {
			log( `console.${ msg.type() }: ${ msg.text().slice( 0, 600 ) }` );
		}
	} );
	page.on( 'pageerror', ( err ) =>
		log( `pageerror: ${ String( err ).slice( 0, 600 ) }` )
	);

	// Encoded, so a blueprint URL's own query string stays part of it.
	const url = new URL( 'https://playground.wordpress.net/' );
	url.searchParams.set( 'blueprint-url', blueprint );
	console.log( `\n=== run ${ run }: ${ url }` );

	let attempt = 1;
	let outcome = 'timeout';
	// A navigation error (a reset connection, a timeout) is a failed load,
	// not a reason to stop probing the rest.
	try {
		await page.goto( url.toString() );
		while ( Date.now() - started < timeout ) {
			if ( await editorReady( page ) ) {
				outcome = `ok (attempt ${ attempt }, ${ since() })`;
				break;
			}
			const error = await errorScreen( page );
			if ( error ) {
				log( `ERROR SCREEN: ${ error }` );
				if ( retryInTab && attempt === 1 ) {
					attempt++;
					log( 'clicking Try again' );
					for ( const frame of page.frames() ) {
						const button = frame.getByRole( 'button', {
							name: /try again/i,
						} );
						if ( ( await button.count() ) > 0 ) {
							await button.first().click();
							break;
						}
					}
					await page.waitForTimeout( 3000 );
					continue;
				}
				outcome = `error screen (attempt ${ attempt }, ${ since() })`;
				break;
			}
			await page.waitForTimeout( 1000 );
		}

		if ( outcome === 'timeout' ) {
			await page.screenshot( {
				path: `probe-timeout-${ browserName }-${ run }.png`,
				fullPage: true,
			} );
		}
	} catch ( error ) {
		outcome = `navigation error (${ String( error ).split( '\n' )[ 0 ] })`;
	} finally {
		await context.close();
	}
	log( `OUTCOME: ${ outcome }` );
	return outcome;
}

const engines = { chromium, firefox, webkit };
const browserName = process.env.PROBE_BROWSER || 'chromium';
console.log( `Browser: ${ browserName }` );
const browser = await engines[ browserName ].launch();
const summary = [];
for ( const blueprint of blueprints ) {
	for ( let run = 1; run <= runs; run++ ) {
		summary.push( [
			new URL( blueprint ).pathname.split( '/' ).pop(),
			run,
			await probe( browser, blueprint, run, true ),
		] );
		// Space the loads out: playground.wordpress.net answers a burst of
		// fresh visitors with 429 Too Many Requests.
		await new Promise( ( resolve ) => setTimeout( resolve, 5000 ) );
	}
}
await browser.close();

const failed = summary.filter(
	( [ , , outcome ] ) => ! outcome.startsWith( 'ok' )
);
const lines = summary.map(
	( [ name, run, outcome ] ) => `- ${ name } run ${ run }: ${ outcome }`
);
console.log( '\n=== Summary' );
console.log( lines.join( '\n' ) );

// On GitHub Actions, put the summary on the run's page too.
if ( process.env.GITHUB_STEP_SUMMARY ) {
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		`### ${ browserName }: ${ summary.length - failed.length } of ${
			summary.length
		} loads booted the editor\n\n${ lines.join( '\n' ) }\n\n`
	);
}

// Any load that never reached the editor fails the job, so a run's status
// says whether Playground was healthy. The log above says why.
process.exitCode = failed.length ? 1 : 0;
