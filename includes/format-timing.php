<?php
/**
 * Server-Timing for the /format route.
 *
 * The route's round trip, as `scripts/time-format-route.sh` measures it,
 * includes the network, the host's own request handling, and WordPress
 * itself. To tell those apart from the plugin's work on a real host, the
 * route sends a `Server-Timing` header (a standard browser developer tools
 * and the timing script both read) with:
 *
 * - `wp`: time from WordPress starting to the route callback;
 * - `sanitize`: validating and sanitizing the CSL items;
 * - `cache`: looking up the whole-response cache and the entry map;
 * - `render`: formatting the entries the caches did not have;
 * - `store`: writing the caches;
 * - `callback`: the whole route callback.
 *
 * The route is editor-only (`edit_posts`), so only editors see the header.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Record a /format timing, or take the ones recorded so far.
 *
 * Durations under one name add up. Called with no name, returns every
 * timing recorded since the last such call and starts over.
 *
 * @param string|null $name Metric name, a Server-Timing token.
 * @param float       $ms   Duration in milliseconds.
 * @param string      $desc Short description; the last one recorded wins.
 * @return array<string, array{dur: float, desc: string}>
 */
function bibliography_builder_format_timing( $name = null, $ms = 0.0, $desc = '' ) {
	static $timings = array();

	if ( null === $name ) {
		$recorded = $timings;
		$timings  = array();

		return $recorded;
	}

	if ( ! isset( $timings[ $name ] ) ) {
		$timings[ $name ] = array(
			'dur'  => 0.0,
			'desc' => '',
		);
	}

	$timings[ $name ]['dur'] += $ms;

	if ( '' !== $desc ) {
		$timings[ $name ]['desc'] = $desc;
	}

	return $timings;
}

/**
 * Milliseconds since a `microtime( true )` reading.
 *
 * @param float $start Start time in seconds.
 * @return float
 */
function bibliography_builder_format_timing_since( $start ) {
	return ( microtime( true ) - $start ) * 1000.0;
}

/**
 * Build a Server-Timing header value from recorded timings.
 *
 * @param array<string, array{dur: float, desc: string}> $timings Timings by name.
 * @return string
 */
function bibliography_builder_server_timing_header( $timings ) {
	$metrics = array();

	foreach ( $timings as $name => $timing ) {
		$metric = (string) preg_replace( '/[^A-Za-z0-9_-]/', '', $name )
			. ';dur=' . (string) round( $timing['dur'], 1 );

		if ( '' !== $timing['desc'] ) {
			$metric .= ';desc="' . str_replace( array( '"', '\\' ), '', $timing['desc'] ) . '"';
		}

		$metrics[] = $metric;
	}

	return implode( ', ', $metrics );
}
