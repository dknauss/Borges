<?php
/**
 * Standalone PHP formatter latency benchmark.
 *
 * Measures real citeproc-php formatting time at 50, 75, 100, 150, and 200
 * entries across all three style families (notes, author-date, numeric).
 * Runs from the main repo root (requires vendor/autoload.php).
 *
 * Usage:
 *   php scripts/benchmark-formatter.php
 *   php scripts/benchmark-formatter.php --sizes=50,75,100 --runs=3
 *
 * Output: JSON + Markdown to output/benchmarks/php-formatter.{json,md}
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Bootstrap — locate repo root (works from main repo or worktree)
// ---------------------------------------------------------------------------

$script_dir  = __DIR__;
$plugin_root = dirname( $script_dir );

// In a worktree, vendor/ lives in the main repo, not in the worktree.
// Walk up the directory tree from the worktree root looking for vendor/.
$autoload  = null;
$search    = $plugin_root;
$max_depth = 6;
for ( $depth = 0; $depth < $max_depth; $depth++ ) {
	$candidate = $search . '/vendor/autoload.php';
	if ( file_exists( $candidate ) ) {
		$autoload = $candidate;
		break;
	}
	$parent = dirname( $search );
	if ( $parent === $search ) {
		break; // reached filesystem root
	}
	$search = $parent;
}

// Also accept an explicit --vendor-dir=<path> argument.
$vendor_opt = getopt( '', [ 'vendor-dir:' ] );
if ( isset( $vendor_opt['vendor-dir'] ) ) {
	$candidate = rtrim( $vendor_opt['vendor-dir'], '/' ) . '/autoload.php';
	if ( file_exists( $candidate ) ) {
		$autoload = $candidate;
	}
}

if ( null === $autoload ) {
	fwrite( STDERR, "Error: vendor/autoload.php not found. Run composer install in the repo root.\n" );
	exit( 1 );
}

require_once $autoload;

if ( ! class_exists( '\Seboettg\CiteProc\CiteProc' ) ) {
	fwrite( STDERR, "Error: citeproc-php not available after autoload.\n" );
	exit( 1 );
}

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

$opts  = getopt( '', [ 'sizes:', 'runs:', 'output-dir:' ] );
$sizes = isset( $opts['sizes'] )
	? array_map( 'intval', explode( ',', $opts['sizes'] ) )
	: [ 50, 75, 100, 150, 200 ];
$runs  = isset( $opts['runs'] ) ? max( 1, (int) $opts['runs'] ) : 5;

$output_dir = $opts['output-dir'] ?? ( $plugin_root . '/output/benchmarks' );
if ( ! is_dir( $output_dir ) ) {
	mkdir( $output_dir, 0755, true );
}

// ---------------------------------------------------------------------------
// Style definitions (one per family, same as bibliography-builder.php)
// ---------------------------------------------------------------------------

// vendor/ is beside autoload.php
$vendor_dir = dirname( $autoload );
$styles_dir = $vendor_dir . '/citation-style-language/styles/';

$style_families = [
	[
		'styleKey' => 'chicago-notes-bibliography',
		'family'   => 'notes',
		'template' => 'chicago-notes-bibliography',
		'locale'   => 'en-US',
	],
	[
		'styleKey' => 'chicago-author-date',
		'family'   => 'author-date',
		'template' => 'chicago-author-date',
		'locale'   => 'en-US',
	],
	[
		'styleKey' => 'ieee',
		'family'   => 'numeric',
		'template' => 'ieee',
		'locale'   => 'en-US',
	],
];

// Verify style files are readable.
foreach ( $style_families as $style ) {
	$style_path = $styles_dir . $style['template'] . '.csl';
	if ( ! is_readable( $style_path ) ) {
		fwrite( STDERR, "Error: style file not readable: {$style_path}\n" );
		exit( 1 );
	}
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

$fixture_path = $plugin_root . '/src/benchmarks/fixtures/csl-200.json';

if ( ! file_exists( $fixture_path ) ) {
	fwrite( STDERR, "Error: fixture not found: {$fixture_path}\n" );
	fwrite( STDERR, "Run: node scripts/generate-benchmark-fixtures.js\n" );
	exit( 1 );
}

$all_csl_items = json_decode( file_get_contents( $fixture_path ), false );

if ( ! is_array( $all_csl_items ) || count( $all_csl_items ) < max( $sizes ) ) {
	fwrite(
		STDERR,
		sprintf(
			"Error: fixture has %d entries but largest requested size is %d.\n",
			count( $all_csl_items ),
			max( $sizes )
		)
	);
	exit( 1 );
}

// ---------------------------------------------------------------------------
// Benchmark helpers
// ---------------------------------------------------------------------------

/** @return float seconds (float) */
function micro_now(): float {
	return microtime( true );
}

function summarize( array $values_ms ): array {
	sort( $values_ms );
	$n      = count( $values_ms );
	$sum    = array_sum( $values_ms );
	$p50_i  = (int) min( $n - 1, ceil( $n * 0.50 ) - 1 );
	$p95_i  = (int) min( $n - 1, ceil( $n * 0.95 ) - 1 );

	return [
		'runs'    => array_map( fn( $v ) => round( $v, 2 ), $values_ms ),
		'minMs'   => round( $values_ms[0],        2 ),
		'maxMs'   => round( $values_ms[ $n - 1 ], 2 ),
		'avgMs'   => round( $sum / $n,            2 ),
		'p50Ms'   => round( $values_ms[ $p50_i ], 2 ),
		'p95Ms'   => round( $values_ms[ $p95_i ], 2 ),
	];
}

// ---------------------------------------------------------------------------
// Budget thresholds (mirror SPEC §Rate Limiting & Resource Caps)
// ---------------------------------------------------------------------------

const BUDGET_STYLE_SWITCH_P95_MS = 250;

// ---------------------------------------------------------------------------
// Run benchmark
// ---------------------------------------------------------------------------

fprintf( STDOUT, "PHP formatter benchmark — citeproc-php\n" );
fprintf( STDOUT, "Sizes: %s  Runs per cell: %d\n\n", implode( ', ', $sizes ), $runs );

$results = [];

foreach ( $sizes as $size ) {
	$items = array_slice( $all_csl_items, 0, $size );

	// Re-assign sequential IDs.
	foreach ( $items as $index => $item ) {
		$item->id = 'bm-' . ( $index + 1 );
	}

	$size_result = [ 'size' => $size, 'byFamily' => [] ];

	foreach ( $style_families as $style_def ) {
		$style_path = $styles_dir . $style_def['template'] . '.csl';
		$style_xml  = file_get_contents( $style_path );

		$cold_runs = [];
		$warm_runs = [];

		for ( $run = 0; $run < $runs; $run++ ) {
			// Cold: construct a fresh CiteProc instance each time.
			$t0        = micro_now();
			$formatter = new \Seboettg\CiteProc\CiteProc( $style_xml, $style_def['locale'] );
			$formatter->render( $items, 'bibliography' );
			$cold_runs[] = ( micro_now() - $t0 ) * 1000;

			// Warm: reuse the same instance (re-rendering the same items).
			$t0 = micro_now();
			$formatter->render( $items, 'bibliography' );
			$warm_runs[] = ( micro_now() - $t0 ) * 1000;
		}

		$cold_stats = summarize( $cold_runs );
		$warm_stats = summarize( $warm_runs );

		$size_result['byFamily'][] = [
			'styleKey'           => $style_def['styleKey'],
			'family'             => $style_def['family'],
			'cold'               => array_merge( $cold_stats, [
				'exceedsBudget' => $cold_stats['p95Ms'] > BUDGET_STYLE_SWITCH_P95_MS,
			] ),
			'warm'               => array_merge( $warm_stats, [
				'exceedsBudget' => $warm_stats['p95Ms'] > BUDGET_STYLE_SWITCH_P95_MS,
			] ),
		];

		fprintf(
			STDOUT,
			"  size=%-3d  %-30s  cold p50=%6.1f ms  p95=%6.1f ms  warm p50=%6.1f ms  p95=%6.1f ms%s\n",
			$size,
			$style_def['styleKey'],
			$cold_stats['p50Ms'],
			$cold_stats['p95Ms'],
			$warm_stats['p50Ms'],
			$warm_stats['p95Ms'],
			$cold_stats['p95Ms'] > BUDGET_STYLE_SWITCH_P95_MS ? '  ** OVER BUDGET **' : ''
		);
	}

	$results[] = $size_result;
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

$report = [
	'generatedAt'   => date( 'c' ),
	'formatterMode' => 'real-citeproc-php',
	'budgets'       => [ 'styleSwitchColdP95Ms' => BUDGET_STYLE_SWITCH_P95_MS ],
	'sizes'         => $sizes,
	'runs'          => $runs,
	'results'       => $results,
];

$json_path = $output_dir . '/php-formatter.json';
file_put_contents( $json_path, json_encode( $report, JSON_PRETTY_PRINT ) . "\n" );

// Markdown summary.
$md = [ '# PHP formatter latency benchmark', '' ];
$md[] = sprintf( 'Generated: %s', $report['generatedAt'] );
$md[] = sprintf( 'Formatter: real citeproc-php  Runs: %d', $runs );
$md[] = '';
$md[] = '## Cold format (new CiteProc instance each run)';
$md[] = '';
$md[] = sprintf( 'Budget: p95 < %d ms', BUDGET_STYLE_SWITCH_P95_MS );
$md[] = '';
$md[] = '| Size | Family | Style | p50 (ms) | p95 (ms) | Budget |';
$md[] = '| ---: | --- | --- | ---: | ---: | --- |';
foreach ( $results as $row ) {
	foreach ( $row['byFamily'] as $f ) {
		$md[] = sprintf(
			'| %d | %s | %s | %s | %s | %s |',
			$row['size'],
			$f['family'],
			$f['styleKey'],
			$f['cold']['p50Ms'],
			$f['cold']['p95Ms'],
			$f['cold']['exceedsBudget'] ? 'OVER' : 'ok'
		);
	}
}
$md[] = '';
$md[] = '## Warm format (reuse CiteProc instance)';
$md[] = '';
$md[] = sprintf( 'Budget: p95 < %d ms', BUDGET_STYLE_SWITCH_P95_MS );
$md[] = '';
$md[] = '| Size | Family | Style | p50 (ms) | p95 (ms) | Budget |';
$md[] = '| ---: | --- | --- | ---: | ---: | --- |';
foreach ( $results as $row ) {
	foreach ( $row['byFamily'] as $f ) {
		$md[] = sprintf(
			'| %d | %s | %s | %s | %s | %s |',
			$row['size'],
			$f['family'],
			$f['styleKey'],
			$f['warm']['p50Ms'],
			$f['warm']['p95Ms'],
			$f['warm']['exceedsBudget'] ? 'OVER' : 'ok'
		);
	}
}

$md_path = $output_dir . '/php-formatter.md';
file_put_contents( $md_path, implode( "\n", $md ) . "\n" );

fprintf( STDOUT, "\nWrote JSON report to %s\n", $json_path );
fprintf( STDOUT, "Wrote Markdown report to %s\n", $md_path );
