<?php
/**
 * PHP formatter latency benchmark.
 *
 * Times the plugin's own formatter, bibliography_builder_format_csl_items(),
 * at 50, 75, 100, 150, and 200 entries in one style per family (notes,
 * author-date, numeric), under the PHPUnit WordPress mocks:
 *
 * - cold:  every entry rendered, as when a bibliography is first formatted or
 *          its style switched. The plugin renders one entry at a time and
 *          restores citeproc-php's state between entries.
 * - edit:  the same list with one title changed, as after an author edits a
 *          citation. The formatter's per-style entry map answers for the
 *          unchanged entries, so only one is rendered.
 * - batch: citeproc-php rendering the whole list in one call. The plugin never
 *          does this (state leaks from one entry into the next, see
 *          includes/formatter.php); it is kept as a reference for citeproc-php
 *          itself, and is what this script timed before 2026-10.
 *
 * Plugin boot, vendor autoload, and the first style parse are outside the
 * timings (one untimed warm-up call per style); see
 * scripts/profile-format-route.php for a cold-process profile and
 * scripts/time-format-route.sh for the round trip over HTTP.
 *
 * Usage:
 *   php scripts/benchmark-formatter.php
 *   php scripts/benchmark-formatter.php --sizes=50,100,200 --runs=3
 *
 * Output: JSON + Markdown to output/benchmarks/php-formatter.{json,md}
 *
 * @package BibliographyBuilder
 */

$plugin_root = dirname( __DIR__ );

require $plugin_root . '/tests/phpunit/bootstrap.php';

if ( is_wp_error( bibliography_builder_ensure_formatter_available() ) ) {
	fwrite( STDERR, "Error: citeproc-php not available. Run composer install in the repo root.\n" );
	exit( 1 );
}

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

$opts  = getopt( '', array( 'sizes:', 'runs:', 'output-dir:' ) );
$sizes = isset( $opts['sizes'] )
	? array_map( 'intval', explode( ',', $opts['sizes'] ) )
	: array( 50, 75, 100, 150, 200 );
$runs  = isset( $opts['runs'] ) ? max( 1, (int) $opts['runs'] ) : 5;

$output_dir = isset( $opts['output-dir'] ) ? $opts['output-dir'] : ( $plugin_root . '/output/benchmarks' );
if ( ! is_dir( $output_dir ) ) {
	mkdir( $output_dir, 0755, true );
}

$style_keys = array(
	'notes'       => 'chicago-notes-bibliography',
	'author-date' => 'chicago-author-date',
	'numeric'     => 'ieee',
);

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

$fixture_path = $plugin_root . '/src/benchmarks/fixtures/csl-200.json';

if ( ! file_exists( $fixture_path ) ) {
	fwrite( STDERR, "Error: fixture not found: {$fixture_path}\n" );
	fwrite( STDERR, "Run: node scripts/generate-benchmark-fixtures.js\n" );
	exit( 1 );
}

$all_csl_items = json_decode( (string) file_get_contents( $fixture_path ), true );

if ( ! is_array( $all_csl_items ) || count( $all_csl_items ) < max( $sizes ) ) {
	fwrite( STDERR, sprintf( "Error: the fixture has fewer than %d entries.\n", max( $sizes ) ) );
	exit( 1 );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Milliseconds since an hrtime() mark.
 *
 * @param int $start hrtime( true ) at the start.
 * @return float
 */
function benchmark_ms_since( $start ) {
	return ( hrtime( true ) - $start ) / 1e6;
}

/**
 * Summary statistics for a list of timings.
 *
 * @param float[] $values_ms Timings in milliseconds.
 * @return array
 */
function benchmark_summarize( array $values_ms ) {
	sort( $values_ms );
	$n     = count( $values_ms );
	$p50_i = (int) min( $n - 1, ceil( $n * 0.50 ) - 1 );
	$p95_i = (int) min( $n - 1, ceil( $n * 0.95 ) - 1 );

	return array(
		'runs'  => array_map(
			static function ( $v ) {
				return round( $v, 2 );
			},
			$values_ms
		),
		'minMs' => round( $values_ms[0], 2 ),
		'maxMs' => round( $values_ms[ $n - 1 ], 2 ),
		'avgMs' => round( array_sum( $values_ms ) / $n, 2 ),
		'p50Ms' => round( $values_ms[ $p50_i ], 2 ),
		'p95Ms' => round( $values_ms[ $p95_i ], 2 ),
	);
}

/**
 * A copy of the items with every title made unique to this run, so no cache
 * answers for any of them.
 *
 * @param array  $items CSL items.
 * @param string $token Run token.
 * @return array
 */
function benchmark_fresh_items( array $items, $token ) {
	foreach ( $items as $index => $item ) {
		$items[ $index ]['title'] = ( isset( $item['title'] ) ? $item['title'] : '' ) . ' ' . $token;
	}

	return $items;
}

// ---------------------------------------------------------------------------
// Budget threshold (mirrors SPEC §Rate Limiting & Resource Caps)
// ---------------------------------------------------------------------------

const BUDGET_STYLE_SWITCH_P95_MS = 250;

// ---------------------------------------------------------------------------
// Run benchmark
// ---------------------------------------------------------------------------

fprintf( STDOUT, "PHP formatter benchmark: plugin per-entry path (cold, edit) and citeproc-php batch (reference)\n" );
fprintf( STDOUT, "Sizes: %s  Runs per cell: %d\n\n", implode( ', ', $sizes ), $runs );

$results = array();

foreach ( $style_keys as $family => $style_key ) {
	// Untimed warm-up: loads the vendor classes and the plugin's citeproc
	// adapter once, as opcache would on a warm server.
	bibliography_builder_test_reset_state();
	bibliography_builder_format_csl_items( benchmark_fresh_items( array_slice( $all_csl_items, 0, 2 ), 'warmup' ), $style_key );
}

foreach ( $sizes as $size ) {
	$items       = array_slice( $all_csl_items, 0, $size );
	$size_result = array(
		'size'     => $size,
		'byFamily' => array(),
	);

	foreach ( $style_keys as $family => $style_key ) {
		$definition = bibliography_builder_get_formatter_style_definition( $style_key );
		$style_xml  = (string) file_get_contents( BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'vendor/citation-style-language/styles/' . $definition['template'] . '.csl' );
		$cold_runs  = array();
		$edit_runs  = array();
		$batch_runs = array();

		for ( $run = 0; $run < $runs; $run++ ) {
			bibliography_builder_test_reset_state();

			$run_items = benchmark_fresh_items( $items, "s{$size}r{$run}" );
			$start     = hrtime( true );
			$formatted = bibliography_builder_format_csl_items( $run_items, $style_key );
			$cold_runs[] = benchmark_ms_since( $start );

			if ( is_wp_error( $formatted ) || count( $formatted ) !== $size ) {
				fwrite( STDERR, "Error: the formatter failed for {$style_key} at {$size} entries.\n" );
				exit( 1 );
			}

			// Edit one entry, a different one each run.
			$run_items[ ( $run * 37 ) % $size ]['title'] .= ' (edited)';
			$start       = hrtime( true );
			bibliography_builder_format_csl_items( $run_items, $style_key );
			$edit_runs[] = benchmark_ms_since( $start );

			$batch_items = json_decode( (string) wp_json_encode( array_values( $run_items ) ) );
			foreach ( $batch_items as $index => $item ) {
				$item->id = 'bm-' . ( $index + 1 );
			}
			$start        = hrtime( true );
			$citeproc     = new \Seboettg\CiteProc\CiteProc( $style_xml, $definition['locale'] );
			$citeproc->render( $batch_items, 'bibliography' );
			$batch_runs[] = benchmark_ms_since( $start );
		}

		$cold  = benchmark_summarize( $cold_runs );
		$edit  = benchmark_summarize( $edit_runs );
		$batch = benchmark_summarize( $batch_runs );

		$cold['exceedsBudget'] = $cold['p95Ms'] > BUDGET_STYLE_SWITCH_P95_MS;

		$size_result['byFamily'][] = array(
			'styleKey' => $style_key,
			'family'   => $family,
			'cold'     => $cold,
			'edit'     => $edit,
			'batch'    => $batch,
		);

		fprintf(
			STDOUT,
			"  size=%-3d  %-28s  cold p50=%6.1f p95=%6.1f  edit p50=%5.1f  batch p50=%6.1f ms%s\n",
			$size,
			$style_key,
			$cold['p50Ms'],
			$cold['p95Ms'],
			$edit['p50Ms'],
			$batch['p50Ms'],
			$cold['exceedsBudget'] ? '  ** OVER BUDGET **' : ''
		);
	}

	$results[] = $size_result;
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

$report = array(
	'generatedAt'   => gmdate( 'c' ),
	'formatterMode' => 'plugin-per-entry',
	'phpVersion'    => PHP_VERSION,
	'budgets'       => array( 'styleSwitchColdP95Ms' => BUDGET_STYLE_SWITCH_P95_MS ),
	'sizes'         => $sizes,
	'runs'          => $runs,
	'results'       => $results,
);

$json_path = $output_dir . '/php-formatter.json';
file_put_contents( $json_path, wp_json_encode( $report, JSON_PRETTY_PRINT ) . "\n" );

$md   = array( '# PHP formatter latency benchmark', '' );
$md[] = sprintf( 'Generated: %s  PHP %s  Runs: %d', $report['generatedAt'], PHP_VERSION, $runs );
$md[] = '';
$md[] = 'Cold renders every entry (first format, style switch). Edit changes one title, so the entry map answers for the rest. Batch is citeproc-php rendering the whole list in one call, which the plugin never does; it is a reference only.';
$md[] = '';
$md[] = sprintf( 'Budget: cold p95 < %d ms', BUDGET_STYLE_SWITCH_P95_MS );
$md[] = '';
$md[] = '| Size | Family | Style | Cold p50 | Cold p95 | Edit p50 | Batch p50 | Budget |';
$md[] = '| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |';
foreach ( $results as $row ) {
	foreach ( $row['byFamily'] as $f ) {
		$md[] = sprintf(
			'| %d | %s | %s | %s | %s | %s | %s | %s |',
			$row['size'],
			$f['family'],
			$f['styleKey'],
			$f['cold']['p50Ms'],
			$f['cold']['p95Ms'],
			$f['edit']['p50Ms'],
			$f['batch']['p50Ms'],
			$f['cold']['exceedsBudget'] ? 'OVER' : 'ok'
		);
	}
}

$md_path = $output_dir . '/php-formatter.md';
file_put_contents( $md_path, implode( "\n", $md ) . "\n" );

fprintf( STDOUT, "\nWrote JSON report to %s\n", $json_path );
fprintf( STDOUT, "Wrote Markdown report to %s\n", $md_path );
