<?php
/**
 * Server-Timing on the /format route (includes/format-timing.php).
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class FormatTimingTest extends TestCase {

	protected function setUp(): void {
		bibliography_builder_test_reset_state();
		bibliography_builder_format_timing();
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );
	}

	private static function format( array $items ): WP_REST_Response {
		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		$request->set_body_params(
			array(
				'style'    => 'apa-7',
				'cslItems' => $items,
			)
		);

		return bibliography_builder_rest_format_citations( $request );
	}

	private static function item( string $title ): array {
		return array(
			'type'   => 'book',
			'title'  => $title,
			'author' => array(
				array(
					'family' => 'Timing',
					'given'  => 'Ada',
				),
			),
		);
	}

	/**
	 * Parse a Server-Timing header into name => [dur, desc].
	 *
	 * @param string $header Header value.
	 */
	private static function parse( string $header ): array {
		$metrics = array();

		foreach ( explode( ', ', $header ) as $metric ) {
			preg_match( '/^([\w-]+);dur=([\d.]+)(?:;desc="([^"]*)")?$/', $metric, $parts );
			$metrics[ $parts[1] ] = array( (float) $parts[2], $parts[3] ?? '' );
		}

		return $metrics;
	}

	public function test_a_cold_request_reports_each_stage(): void {
		$metrics = self::parse( self::format( array( self::item( 'First' ), self::item( 'Second' ) ) )->get_headers()['Server-Timing'] );

		$this->assertSame( array( 'sanitize', 'cache', 'render', 'store', 'callback' ), array_keys( $metrics ) );
		$this->assertSame( '0 of 2 entries', $metrics['cache'][1] );
		$this->assertSame( '2 entries', $metrics['render'][1] );
		$this->assertGreaterThan( 0, $metrics['callback'][0] );
		$this->assertGreaterThanOrEqual( $metrics['render'][0], $metrics['callback'][0] );
	}

	public function test_an_edit_reports_what_the_entry_map_answered(): void {
		self::format( array( self::item( 'First' ), self::item( 'Second' ) ) );

		$metrics = self::parse( self::format( array( self::item( 'First' ), self::item( 'Third' ) ) )->get_headers()['Server-Timing'] );

		$this->assertSame( '1 of 2 entries', $metrics['cache'][1] );
		$this->assertSame( '1 entries', $metrics['render'][1] );
	}

	public function test_a_repeated_list_is_answered_whole(): void {
		self::format( array( self::item( 'First' ) ) );

		$metrics = self::parse( self::format( array( self::item( 'First' ) ) )->get_headers()['Server-Timing'] );

		$this->assertSame( array( 'sanitize', 'cache', 'callback' ), array_keys( $metrics ) );
		$this->assertSame( 'whole list', $metrics['cache'][1] );
	}

	public function test_timings_add_up_and_are_taken_once(): void {
		bibliography_builder_format_timing( 'store', 1.25 );
		bibliography_builder_format_timing( 'store', 2.5, 'two writes' );

		$this->assertSame(
			array(
				'store' => array(
					'dur'  => 3.75,
					'desc' => 'two writes',
				),
			),
			bibliography_builder_format_timing()
		);
		$this->assertSame( array(), bibliography_builder_format_timing() );
	}

	public function test_header_values_stay_well_formed(): void {
		$this->assertSame(
			'mymetric;dur=1.3;desc="say hi"',
			bibliography_builder_server_timing_header(
				array(
					'my metric!' => array(
						'dur'  => 1.25,
						'desc' => 'say "hi\\"',
					),
				)
			)
		);
	}
}
