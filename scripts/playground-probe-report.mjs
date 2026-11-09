#!/usr/bin/env node
/* eslint-disable no-console -- a CLI report */
/**
 * Playground probe report.
 *
 * Reads the JSON lines that scripts/playground-live-probe.mjs appends to
 * PROBE_RESULTS (one line per load), and decides whether the README's
 * Playground demos are healthy enough to leave alone. The scheduled run of
 * .github/workflows/playground-live-probe.yml opens or updates an issue when
 * they are not, and closes it once they recover.
 *
 * Playground itself fails some cold loads (its service worker sometimes drops
 * WordPress's own scripts, WordPress/wordpress-playground#4419), so one failed
 * load is not news. The demos are unhealthy when:
 *
 * - any Borges blueprint load logged a blueprint step error (such as "Could not
 *   download"): that points at the blueprint or what it fetches, which this
 *   repository can fix; or
 * - fewer than PROBE_MIN_PASS (default 0.6) of the Borges blueprint loads
 *   reached a working editor.
 *
 * The control blueprint's pass rate (no Borges) is reported beside them, so a
 * reader can tell a Playground outage from a Borges problem.
 *
 * Usage:
 *   node scripts/playground-probe-report.mjs results.jsonl [...]
 *
 * Writes the Markdown report to stdout, and `healthy=true|false` to
 * GITHUB_OUTPUT when that is set. Exits 0 either way; the workflow decides
 * what to do with the verdict.
 */
import { appendFileSync, readFileSync } from 'node:fs';

const minPass = Number( process.env.PROBE_MIN_PASS || '0.6' );
const files = process.argv.slice( 2 );

const loads = files.flatMap( ( file ) =>
	readFileSync( file, 'utf8' )
		.split( '\n' )
		.filter( ( line ) => line.trim() )
		.map( ( line ) => JSON.parse( line ) )
);

/**
 * Formats a pass count as "n of m (p%)".
 *
 * @param {Array<{ok: boolean}>} group Loads.
 * @return {string} Pass count.
 */
function rate( group ) {
	const passed = group.filter( ( load ) => load.ok ).length;
	const percent = group.length
		? Math.round( ( passed / group.length ) * 100 )
		: 0;
	return `${ passed } of ${ group.length } (${ percent }%)`;
}

const borges = loads.filter( ( load ) => ! load.control );
const control = loads.filter( ( load ) => load.control );
const blueprintErrors = borges.filter( ( load ) => load.blueprintError );
const passShare = borges.length
	? borges.filter( ( load ) => load.ok ).length / borges.length
	: 0;

const reasons = [];
if ( ! borges.length ) {
	reasons.push( 'No Borges blueprint loads were recorded.' );
}
if ( blueprintErrors.length ) {
	reasons.push(
		`${ blueprintErrors.length } Borges load(s) hit a blueprint step error, such as a download failing. That points at the blueprint or a host it fetches from.`
	);
}
if ( borges.length && passShare < minPass ) {
	reasons.push(
		`Only ${ rate( borges ) } Borges loads reached a working editor, under the ${ Math.round(
			minPass * 100
		) }% threshold.`
	);
}
const healthy = reasons.length === 0;

const rows = [];
const host = ( load ) =>
	new URL( load.playground || 'https://playground.wordpress.net/' ).host;
const keys = [
	...new Set(
		loads.map(
			( load ) =>
				`${ host( load ) }|${ load.blueprint }|${ load.browser }`
		)
	),
];
for ( const key of keys.sort() ) {
	const [ playground, blueprint, browser ] = key.split( '|' );
	const group = loads.filter(
		( load ) =>
			host( load ) === playground &&
			load.blueprint === blueprint &&
			load.browser === browser
	);
	rows.push(
		`| ${ playground } | \`${ blueprint }\` | ${ browser } | ${ rate(
			group
		) } |`
	);
}

const report = [
	healthy
		? '**Healthy.** The Playground demos booted often enough, with no blueprint errors.'
		: '**Unhealthy.**\n\n' +
			reasons.map( ( reason ) => `- ${ reason }` ).join( '\n' ),
	'',
	`Borges blueprints: ${ rate( borges ) } loads reached the editor.`,
	control.length
		? `Control blueprint (no Borges): ${ rate(
				control
			) }. When it fails as often, the cause is Playground itself.`
		: 'No control blueprint loads were recorded.',
	'',
	'| Playground | Blueprint | Browser | Loads that reached the editor |',
	'| --- | --- | --- | --- |',
	...rows,
];
if ( blueprintErrors.length ) {
	report.push( '', 'Blueprint step errors:', '' );
	for ( const load of blueprintErrors ) {
		report.push(
			`- \`${ load.blueprint }\` (${ load.browser }, run ${ load.run }): ${ load.blueprintError }`
		);
	}
}

console.log( report.join( '\n' ) );
if ( process.env.GITHUB_OUTPUT ) {
	appendFileSync( process.env.GITHUB_OUTPUT, `healthy=${ healthy }\n` );
}
