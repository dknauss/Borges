<?php
/**
 * Cold-start profile of the POST /bibliography/v1/format pipeline.
 *
 * Runs the plugin's own code (not a standalone citeproc-php instance) under
 * the PHPUnit WordPress mocks, so it times what a real request runs minus
 * WordPress boot and HTTP. Each run is a fresh PHP process, like a request.
 *
 * Usage:
 *   php scripts/profile-format-route.php [style] [stages|callback] [runs]
 *
 *   style     style key (default chicago-notes-bibliography)
 *   stages    time each stage of the pipeline (default)
 *   callback  time the whole REST callback, as scripts/time-format-route.sh
 *             would see it without WordPress and HTTP
 *   runs      fresh processes to run (default 5)
 *
 * Prints one JSON line per run with milliseconds per stage, then the median.
 * Uses src/benchmarks/fixtures/csl-200.json and changes one title per run so
 * the formatter cache never answers.
 *
 * @package BibliographyBuilder
 */

$root  = dirname( __DIR__ );
$style = isset( $argv[1] ) ? $argv[1] : 'chicago-notes-bibliography';
$mode  = isset( $argv[2] ) ? $argv[2] : 'stages';

// The parent process spawns one child per run and reports the median.
if ( ! getenv( 'BORGES_PROFILE_CHILD' ) ) {
	$runs   = isset( $argv[3] ) ? max( 1, (int) $argv[3] ) : 5;
	$totals = array();

	for ( $run = 0; $run < $runs; $run++ ) {
		$line = shell_exec(
			'BORGES_PROFILE_CHILD=1 ' . escapeshellarg( PHP_BINARY ) . ' ' . escapeshellarg( __FILE__ )
			. ' ' . escapeshellarg( $style ) . ' ' . escapeshellarg( $mode )
		);
		echo $line;
		$result   = json_decode( (string) $line, true );
		$totals[] = isset( $result['total'] ) ? $result['total'] : 0;
	}

	sort( $totals );
	printf( "median total_ms=%.1f over %d runs (%s, %s)\n", $totals[ intdiv( count( $totals ), 2 ) ], $runs, $style, $mode );
	exit( 0 );
}

$marks = array( 'start' => hrtime( true ) );

require $root . '/tests/phpunit/bootstrap.php';
$marks['plugin_loaded'] = hrtime( true );

$items              = json_decode( (string) file_get_contents( $root . '/src/benchmarks/fixtures/csl-200.json' ), true );
$items[0]['title'] .= ' ' . mt_rand();

if ( 'callback' === $mode ) {
	$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
	$request->set_body(
		(string) json_encode(
			array(
				'style'    => $style,
				'cslItems' => $items,
			)
		)
	);
	$response          = bibliography_builder_rest_format_citations( $request );
	$marks['callback'] = hrtime( true );
	$count             = count( $response->get_data()['entries'] );
} else {
	$clean             = bibliography_builder_validate_and_sanitize_csl_items( $items );
	$marks['sanitize'] = hrtime( true );

	bibliography_builder_ensure_formatter_available();
	require_once $root . '/includes/class-bibliography-builder-reusable-citeproc.php';
	$marks['autoload_vendor'] = hrtime( true );

	$definition = bibliography_builder_get_formatter_style_definition( $style );
	$xml        = (string) file_get_contents( $root . '/vendor/citation-style-language/styles/' . $definition['template'] . '.csl' );
	$demote     = 1 === preg_match( '/demote-non-dropping-particle="display-and-sort"/', $xml );
	$prepared   = array();

	foreach ( array_values( $clean ) as $index => $item ) {
		$entry       = bibliography_builder_prepare_csl_for_formatter( $item, $demote );
		$entry['id'] = 'bibliography-builder-format-' . $index;
		$prepared[]  = $entry;
	}

	$objects          = json_decode( (string) json_encode( $prepared ) );
	$marks['prepare'] = hrtime( true );

	// The style and locale are parsed on the first render, not here.
	$formatter         = new Bibliography_Builder_Reusable_CiteProc( $xml, $definition['locale'], array() );
	$html              = $formatter->render( array( $objects[0] ), 'bibliography' );
	$marks['parse_and_first_render'] = hrtime( true );

	$count_objects = count( $objects );

	for ( $index = 1; $index < $count_objects; $index++ ) {
		$html .= $formatter->render( array( $objects[ $index ] ), 'bibliography' );
	}

	$marks['other_renders'] = hrtime( true );

	$count            = count( bibliography_builder_extract_citeproc_entries( $html, $definition ) );
	$marks['extract'] = hrtime( true );
}

$previous = $marks['start'];
$output   = array();

foreach ( $marks as $stage => $time ) {
	if ( 'start' !== $stage ) {
		$output[ $stage ] = round( ( $time - $previous ) / 1e6, 1 );
		$previous         = $time;
	}
}

$output['total']   = round( ( $previous - $marks['start'] ) / 1e6, 1 );
$output['entries'] = $count;

echo json_encode( $output ), "\n";
