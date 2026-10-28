/**
 * Runs render.php, measure.mjs, and parser-baseline.mjs once per citation
 * style, for the corpus in MV_CORPUS (default corpus.json), and summarizes
 * what changes with the style: what a text-only reader finds unlabeled or
 * by pattern, and what a citation parser recovers from the plain list. The
 * structured layers carry the same CSL record in every style.
 *
 * `node sweep.mjs [style ...]` (or `npm run sweep`); with no styles, all of
 * them. Writes out-runs/<corpus>/<style>/ and out-runs/<corpus>/styles.json.
 * Needs what render.php, measure.mjs, and parser-baseline.mjs need.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { CORPUS_PATH, TOOL_DIR } from './lib.mjs';

async function main() {
	const styles = process.argv.slice( 2 ).length
		? process.argv.slice( 2 )
		: Object.keys(
				JSON.parse(
					await readFile(
						join( TOOL_DIR, '..', '..', 'includes', 'styles.json' ),
						'utf8'
					)
				).styles
			);
	const base = join( TOOL_DIR, 'out-runs', basename( CORPUS_PATH, '.json' ) );
	const summary = {};

	for ( const style of styles ) {
		const out = join( base, style );
		await mkdir( out, { recursive: true } );
		const env = {
			...process.env,
			MV_STYLE: style,
			MV_OUT: out,
			MV_CORPUS: CORPUS_PATH,
		};
		const run = ( cmd, args ) =>
			execFileSync( cmd, args, { cwd: TOOL_DIR, env, stdio: 'pipe' } );

		run( 'php', [ 'render.php' ] );
		run( 'node', [ 'measure.mjs' ] );
		let parser = null;
		try {
			run( 'node', [ 'parser-baseline.mjs' ] );
			parser = JSON.parse(
				await readFile( join( out, 'parser-baseline.json' ), 'utf8' )
			);
		} catch ( error ) {
			parser = { error: String( error.message ).split( '\n' )[ 0 ] };
		}
		const results = JSON.parse(
			await readFile( join( out, 'results.json' ), 'utf8' )
		);
		const plain = results.variants.plain.fieldRecovery.totals;
		const borges = results.variants[ 'borges-default' ].fieldRecovery;

		summary[ style ] = {
			pairs: plain.pairs,
			plainText: {
				pattern: plain.pattern,
				unlabeled: plain.unlabeled,
				missing: plain.missing,
			},
			parser: parser.error
				? parser
				: {
						correct: parser.correct,
						pairs: parser.pairs,
						byField: Object.fromEntries(
							Object.entries( parser.byField ).map(
								( [ f, v ] ) => [
									f,
									`${ v.correct }/${ v.pairs }`,
								]
							)
						),
					},
			jsonLdLabeled: borges.perLayer.jsonld.correct,
		};
		// eslint-disable-next-line no-console
		console.log(
			`${ style.padEnd( 28 ) } parser ${
				parser.error ? 'n/a' : `${ parser.correct }/${ parser.pairs }`
			}  JSON-LD ${ borges.perLayer.jsonld.correct }/${ plain.pairs }`
		);
	}

	await writeFile(
		join( base, 'styles.json' ),
		JSON.stringify( summary, null, '\t' ) + '\n'
	);
}

main().catch( ( error ) => {
	// eslint-disable-next-line no-console
	console.error( error );
	process.exitCode = 1;
} );
