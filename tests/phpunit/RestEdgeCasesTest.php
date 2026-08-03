<?php

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Tests for edge-case and early-exit branches not covered by RestEndpointsTest.
 *
 * @package BibliographyBuilder
 */
final class RestEdgeCasesTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();
	}

	// ── bibliography_builder_rest_permissions_check ───────────────────────────

	public function test_permissions_check_returns_404_for_missing_post(): void {
		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/999/bibliographies' );
		$request['post_id'] = 999; // No post registered for this ID.

		$result = bibliography_builder_rest_permissions_check( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_post_not_found', $result->get_error_code() );
		$this->assertSame( 404, $result->get_error_data()['status'] );
	}

	// ── bibliography_builder_rest_format_citations edge cases ─────────────────

	public function test_format_citations_returns_empty_entries_when_no_csl_items(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		$request->set_body_params(
			array(
				'style'    => 'apa-7',
				'cslItems' => array(),
			)
		);

		$response = bibliography_builder_rest_format_citations( $request );
		$data     = $response->get_data();

		$this->assertSame( 'apa-7', $data['style'] );
		$this->assertSame( array(), $data['entries'] );
	}

	public function test_format_citations_returns_400_when_too_many_items(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		// Build one more item than the allowed maximum.
		$csl_items = array_fill(
			0,
			BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS + 1,
			array( 'type' => 'book', 'title' => 'Filler' )
		);

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		$request->set_body_params(
			array(
				'style'    => 'chicago-notes-bibliography',
				'cslItems' => $csl_items,
			)
		);

		$result = bibliography_builder_rest_format_citations( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_formatter_too_many_items', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_format_citations_returns_413_when_body_too_large(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );

		// Craft a body that exceeds the 1 MB limit.
		$oversized_body = str_repeat( 'x', BIBLIOGRAPHY_BUILDER_MAX_FORMAT_BYTES + 1 );
		$request->set_body_params( array( 'raw' => $oversized_body ) );

		$result = bibliography_builder_rest_format_citations( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_formatter_payload_too_large', $result->get_error_code() );
		$this->assertSame( 413, $result->get_error_data()['status'] );
	}


	public function test_format_citations_rejects_invalid_csl_type(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		$request->set_body_params(
			array(
				'cslItems' => array(
					array(
						'type'  => 'not-a-csl-type',
						'title' => 'Bad type',
					),
				),
			)
		);

		$result = bibliography_builder_rest_format_citations( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_format_citations_rejects_invalid_csl_author_shape(): void {
		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		$request->set_body_params(
			array(
				'cslItems' => array(
					array(
						'type'   => 'book',
						'title'  => 'Bad author',
						'author' => array( 'not-an-author-object' ),
					),
				),
			)
		);

		$result = bibliography_builder_rest_format_citations( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_format_citations_rejects_invalid_csl_date_parts(): void {
		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		$request->set_body_params(
			array(
				'cslItems' => array(
					array(
						'type'   => 'book',
						'title'  => 'Bad date',
						'issued' => array(
							'date-parts' => array( array( 'not-a-year' ) ),
						),
					),
				),
			)
		);

		$result = bibliography_builder_rest_format_citations( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
	}

	public function test_csl_sanitizer_strips_html_and_forbidden_keys(): void {
		$sanitized = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'        => 'book',
				'title'       => '<b>Safe</b> <script>alert(1)</script>',
				'ISBN'        => array( '<b>9780000000000</b>' ),
				'__proto__'   => array( 'polluted' => true ),
				'constructor' => array( 'polluted' => true ),
			)
		);

		$this->assertIsArray( $sanitized );
		// Core's wp_strip_all_tags drops script and style elements together
		// with their contents before stripping remaining tags, so the payload
		// disappears entirely rather than surviving as bare text. The previous
		// expectation of 'Safe alert(1)' described the harness's old naive
		// strip_tags() stand-in, not WordPress.
		$this->assertSame( 'Safe', $sanitized['title'] );
		$this->assertSame( array( '9780000000000' ), $sanitized['ISBN'] );
		$this->assertArrayNotHasKey( '__proto__', $sanitized );
		$this->assertArrayNotHasKey( 'constructor', $sanitized );
	}

	public function test_csl_sanitizer_rejects_excessive_depth(): void {
		$nested = 'too deep';

		for ( $index = 0; $index < 12; $index++ ) {
			$nested = array( 'next' => $nested );
		}

		$result = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'  => 'book',
				'title' => 'Deep payload',
				'extra' => $nested,
			)
		);

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
	}

	public function test_csl_sanitizer_rejects_oversized_string_field(): void {
		// Every CSL string field is run through a looped wp_strip_all_tags.
		// Core's implementation applies a lazy script/style-stripping regex
		// that exhausts PCRE's JIT stack somewhere above 600 KB and falls back
		// to catastrophic backtracking: ~2.4s at 600 KB, ~12.9s at 950 KB of
		// unclosed "<script " tokens. The request-level cap is on the whole
		// body, so without a per-field cap one Contributor-authored field can
		// carry the entire megabyte into that regex. Reject before stripping.
		$result = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'  => 'book',
				'title' => str_repeat( 'a', BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES + 1 ),
			)
		);

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_csl_sanitizer_accepts_string_field_at_the_cap(): void {
		$result = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'  => 'book',
				'title' => str_repeat( 'a', BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES ),
			)
		);

		$this->assertIsArray( $result );
		$this->assertSame(
			BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES,
			strlen( $result['title'] )
		);
	}

	public function test_csl_sanitizer_rejects_oversized_field_without_stripping_it(): void {
		// The cap is only worth having if it short-circuits the expensive path.
		// A hostile payload well past the backtracking cliff must be rejected
		// promptly rather than stripped first and rejected after.
		$hostile = str_repeat( '<script ', 120000 ); // ~960 KB

		$start  = microtime( true );
		$result = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'  => 'book',
				'title' => $hostile,
			)
		);
		$elapsed = microtime( true ) - $start;

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertLessThan(
			1.0,
			$elapsed,
			'Oversized field should be rejected before the looped strip, not after.'
		);
	}

	/**
	 * Every path that reaches the looped strip must be bounded, not just the
	 * flat string fields. bibliography_builder_strip_csl_html is called from
	 * five sites: the string-field loop, author name parts, date literal/raw,
	 * and both branches of the string-or-array handler. A cap on one of them
	 * leaves the same vulnerability reachable under a different key.
	 *
	 * @param array $csl_item CSL item carrying an oversized string.
	 */
	#[DataProvider( 'oversized_csl_path_provider' )]
	public function test_csl_sanitizer_rejects_oversized_strings_on_every_strip_path( array $csl_item ): void {
		$start   = microtime( true );
		$result  = bibliography_builder_validate_and_sanitize_csl_item( $csl_item );
		$elapsed = microtime( true ) - $start;

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 400, $result->get_error_data()['status'] );
		$this->assertLessThan(
			1.0,
			$elapsed,
			'Oversized string must be rejected before any strip, on every path.'
		);
	}

	public static function oversized_csl_path_provider(): array {
		$hostile = str_repeat( '<script ', 120000 ); // ~960 KB.

		return array(
			'flat string field'  => array(
				array(
					'type'  => 'book',
					'title' => $hostile,
				),
			),
			'author family name' => array(
				array(
					'type'   => 'book',
					'title'  => 'Fine',
					'author' => array( array( 'family' => $hostile ) ),
				),
			),
			'author literal'     => array(
				array(
					'type'   => 'book',
					'title'  => 'Fine',
					'author' => array( array( 'literal' => $hostile ) ),
				),
			),
			'date literal'       => array(
				array(
					'type'   => 'book',
					'title'  => 'Fine',
					'issued' => array( 'literal' => $hostile ),
				),
			),
			'date raw'           => array(
				array(
					'type'     => 'book',
					'title'    => 'Fine',
					'accessed' => array( 'raw' => $hostile ),
				),
			),
			'ISBN string'        => array(
				array(
					'type'  => 'book',
					'title' => 'Fine',
					'ISBN'  => $hostile,
				),
			),
			'ISBN array member'  => array(
				array(
					'type'  => 'book',
					'title' => 'Fine',
					'ISBN'  => array( $hostile ),
				),
			),
		);
	}

	/**
	 * The read side strips stored citation text too, and that path is worse
	 * than the formatter's: the payload is already in post_content, the route
	 * needs no authentication for a published post, and every request pays the
	 * cost again. Bound it wherever a stored string reaches a strip.
	 *
	 * @param callable $invoke Callable exercising one stripping read path.
	 */
	#[DataProvider( 'unbounded_read_path_provider' )]
	public function test_read_paths_bound_stored_text_before_stripping( callable $invoke ): void {
		$start   = microtime( true );
		$invoke();
		$elapsed = microtime( true ) - $start;

		$this->assertLessThan(
			1.0,
			$elapsed,
			'Stored text must be bounded before stripping on every read path.'
		);
	}

	public static function unbounded_read_path_provider(): array {
		$hostile = str_repeat( '<script ', 120000 ); // ~960 KB.

		return array(
			'plain-text bibliography render' => array(
				static function () use ( $hostile ) {
					bibliography_builder_build_plain_text(
						array(
							'citations' => array(
								array( 'displayOverride' => $hostile ),
							),
						)
					);
				},
			),
			'formatted-text sanitizer'       => array(
				static function () use ( $hostile ) {
					bibliography_builder_sanitize_formatted_text( $hostile );
				},
			),
		);
	}

	public function test_plain_text_response_is_not_truncated_at_supported_size(): void {
		// The per-citation bound must not become a per-response bound.
		// build_plain_text already bounds each citation before stripping, so the
		// aggregate cost is linear and a response-level cap adds no protection —
		// but it would silently drop the tail of a legitimate bibliography.
		//
		// An annotated bibliography reaches that size easily and well inside the
		// supported 200-citation ceiling: each entry is a citation plus a note
		// carried in displayOverride, so 50 entries already exceed the 64 KB
		// single-field cap by a comfortable margin.
		$entry = 'Author, Ada. "A Representative Article Title of Ordinary Length." '
			. 'Journal of Representative Studies 12, no. 3 (2024): 100-140. '
			. 'https://doi.org/10.1000/representative.example. '
			. str_repeat( 'This annotation summarizes the argument and its method. ', 26 );

		$bibliography = array( 'citations' => array() );
		for ( $index = 0; $index < 50; $index++ ) {
			$bibliography['citations'][] = array( 'displayOverride' => $entry );
		}

		$text = bibliography_builder_build_plain_text( $bibliography );

		$this->assertGreaterThan(
			BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES,
			strlen( $text ),
			'A 50-entry annotated bibliography should exceed the single-field cap.'
		);
		$this->assertSame( 50, substr_count( $text, 'Representative Studies' ) );

		// And it must survive the send-time filter intact. This is the path that
		// actually regressed: bounding $data there re-applies a single-field cap
		// to the whole response.
		$request = new WP_REST_Request( 'GET', '/bibliography/v1/posts/101/bibliographies/0' );
		$request->set_query_params( array( 'format' => 'text' ) );
		$response = new WP_REST_Response( $text, 200 );
		$response->header( 'Content-Type', 'text/plain; charset=utf-8' );
		$server = new WP_REST_Server();

		ob_start();
		bibliography_builder_rest_pre_serve_request( false, $response, $request, $server );
		$output = ob_get_clean();

		$this->assertSame(
			50,
			substr_count( $output, 'Representative Studies' ),
			'The send-time filter must not truncate a legitimate bibliography.'
		);
	}

	public function test_published_post_in_non_viewable_post_type_is_not_world_readable(): void {
		// can_read_post short-circuits on 'publish' without asking whether the
		// post type is publicly viewable, so bibliography data stored in a
		// private CPT was readable unauthenticated — where core's own REST
		// controllers would refuse. Narrow, since bibliographies usually live in
		// ordinary posts, but the check costs nothing.
		bibliography_builder_test_set_post( 909, 'publish', '', false, 'internal_notes' );
		bibliography_builder_test_set_post_type_viewable( 'internal_notes', false );
		bibliography_builder_test_set_current_user( 0 );

		$this->assertFalse(
			bibliography_builder_can_read_post( get_post( 909 ) ),
			'A published post in a non-viewable post type must not be world-readable.'
		);
	}

	public function test_published_post_in_viewable_post_type_stays_readable(): void {
		bibliography_builder_test_set_post( 910, 'publish', '', false, 'post' );
		bibliography_builder_test_set_current_user( 0 );

		$this->assertTrue( bibliography_builder_can_read_post( get_post( 910 ) ) );
	}

	public function test_editor_can_still_read_non_viewable_post_type(): void {
		// Losing the publish shortcut must not lock out someone who can edit it.
		bibliography_builder_test_set_post( 911, 'publish', '', false, 'internal_notes' );
		bibliography_builder_test_set_post_type_viewable( 'internal_notes', false );
		bibliography_builder_test_set_current_user( 7 );
		bibliography_builder_test_grant_cap( 7, 'edit_post', 911 );

		$this->assertTrue( bibliography_builder_can_read_post( get_post( 911 ) ) );
	}

	public function test_csl_sanitizer_rejects_list_shaped_csl_item(): void {
		$result = bibliography_builder_validate_and_sanitize_csl_item(
			array( 'book', 'Not an object' )
		);

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_csl_sanitizer_rejects_non_array_csl_item(): void {
		$result = bibliography_builder_validate_and_sanitize_csl_item( 'not an object' );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_csl_sanitizer_rejects_non_string_known_string_field(): void {
		$result = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'  => 'book',
				'title' => array( 'Nested title is invalid' ),
			)
		);

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_csl_sanitizer_rejects_non_array_name_list(): void {
		$result = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'   => 'book',
				'title'  => 'Invalid author list',
				'author' => 'Smith',
			)
		);

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_csl_sanitizer_rejects_non_string_author_field(): void {
		$result = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'   => 'book',
				'title'  => 'Invalid author field',
				'author' => array(
					array(
						'family' => array( 'Smith' ),
						'given'  => 'Jane',
					),
				),
			)
		);

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_csl_sanitizer_accepts_and_strips_identifier_strings_and_arrays(): void {
		$sanitized = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type' => 'book',
				'title' => 'Identifiers',
				'ISBN' => '<b>9780000000000</b>',
				'ISSN' => array( '<i>1234-5678</i>', '8765-4321' ),
			)
		);

		$this->assertIsArray( $sanitized );
		$this->assertSame( '9780000000000', $sanitized['ISBN'] );
		$this->assertSame( array( '1234-5678', '8765-4321' ), $sanitized['ISSN'] );
	}

	public function test_csl_sanitizer_rejects_invalid_identifier_values(): void {
		$invalid_scalar = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'  => 'book',
				'title' => 'Invalid identifier scalar',
				'ISBN'  => 9780000000000,
			)
		);

		$invalid_array_item = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'  => 'book',
				'title' => 'Invalid identifier array',
				'ISSN'  => array( '1234-5678', 87654321 ),
			)
		);

		$this->assertInstanceOf( WP_Error::class, $invalid_scalar );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $invalid_scalar->get_error_code() );
		$this->assertInstanceOf( WP_Error::class, $invalid_array_item );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $invalid_array_item->get_error_code() );
	}

	public function test_csl_sanitizer_removes_nested_forbidden_keys(): void {
		$sanitized = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'     => 'book',
				'title'    => 'Nested forbidden keys',
				'metadata' => array(
					'safe'        => array(
						'value'     => 'preserved',
						'prototype' => array( 'polluted' => true ),
					),
					'constructor' => array( 'polluted' => true ),
				),
			)
		);

		$this->assertIsArray( $sanitized );
		$this->assertSame( 'preserved', $sanitized['metadata']['safe']['value'] );
		$this->assertArrayNotHasKey( 'prototype', $sanitized['metadata']['safe'] );
		$this->assertArrayNotHasKey( 'constructor', $sanitized['metadata'] );
	}

	public function test_csl_sanitizer_accepts_accessed_date_and_normalizes_numeric_parts(): void {
		$sanitized = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'     => 'webpage',
				'title'    => 'Accessed date',
				'accessed' => array(
					'date-parts' => array(
						array( '2026', 6.0, 20 ),
					),
				),
			)
		);

		$this->assertIsArray( $sanitized );
		$this->assertSame(
			array( array( 2026, 6, 20 ) ),
			$sanitized['accessed']['date-parts']
		);
	}

	public function test_csl_sanitizer_accepts_literal_and_raw_dates(): void {
		$sanitized = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'     => 'book',
				'title'    => 'Literal date',
				'issued'   => array( 'literal' => '<b>Spring 2026</b>' ),
				'accessed' => array( 'raw' => '<i>2026-06-20</i>' ),
			)
		);

		$this->assertIsArray( $sanitized );
		$this->assertSame( 'Spring 2026', $sanitized['issued']['literal'] );
		$this->assertSame( '2026-06-20', $sanitized['accessed']['raw'] );
	}

	public function test_csl_sanitizer_rejects_non_string_literal_or_raw_dates(): void {
		$result = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'   => 'book',
				'title'  => 'Bad literal date',
				'issued' => array( 'literal' => array( 'Spring 2026' ) ),
			)
		);

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
	}

	public function test_csl_sanitizer_accepts_supported_standalone_types(): void {
		foreach ( array( 'performance', 'periodical', 'regulation' ) as $type ) {
			$sanitized = bibliography_builder_validate_and_sanitize_csl_item(
				array(
					'type'  => $type,
					'title' => 'Standalone Title',
				)
			);

			$this->assertIsArray( $sanitized );
			$this->assertSame( $type, $sanitized['type'] );
		}
	}

	public function test_csl_sanitizer_coerces_numeric_string_metadata_fields(): void {
		$sanitized = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'    => 'book',
				'title'   => 'Numeric metadata',
				'volume'  => 12,
				'issue'   => 3.0,
				'edition' => 2,
			)
		);

		$this->assertIsArray( $sanitized );
		$this->assertSame( '12', $sanitized['volume'] );
		$this->assertSame( '3', $sanitized['issue'] );
		$this->assertSame( '2', $sanitized['edition'] );
	}

	public function test_csl_sanitizer_rejects_invalid_date_shapes(): void {
		$list_shaped_date = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'   => 'book',
				'title'  => 'List date',
				'issued' => array( array( 2026 ) ),
			)
		);

		$non_array_date_parts = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'   => 'book',
				'title'  => 'Non-array date-parts',
				'issued' => array( 'date-parts' => '2026' ),
			)
		);

		$empty_date_parts = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'   => 'book',
				'title'  => 'Empty date-parts',
				'issued' => array( 'date-parts' => array() ),
			)
		);

		$this->assertInstanceOf( WP_Error::class, $list_shaped_date );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $list_shaped_date->get_error_code() );
		$this->assertInstanceOf( WP_Error::class, $non_array_date_parts );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $non_array_date_parts->get_error_code() );
		$this->assertInstanceOf( WP_Error::class, $empty_date_parts );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $empty_date_parts->get_error_code() );
	}

	public function test_csl_item_list_validation_wraps_invalid_item_position(): void {
		$result = bibliography_builder_validate_and_sanitize_csl_items(
			array(
				array(
					'type'  => 'book',
					'title' => 'Valid',
				),
				array(
					'type'  => 'not-valid',
					'title' => 'Invalid',
				),
			)
		);

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_invalid_csl_item', $result->get_error_code() );
		$this->assertSame( 'Invalid CSL citation item at position 2.', $result->get_error_message() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_format_citations_defaults_style_to_chicago_when_absent(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		// No 'style' key — should default to chicago-notes-bibliography.
		$request->set_body_params( array( 'cslItems' => array() ) );

		$response = bibliography_builder_rest_format_citations( $request );
		$data     = $response->get_data();

		$this->assertSame( 'chicago-notes-bibliography', $data['style'] );
	}

	// ── bibliography_builder_rest_resolve_pmid edge cases ─────────────────────

	public function test_resolve_pmid_rejects_invalid_id(): void {
		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/pmid/not-a-pmid' );
		$request['pmid'] = 'not-a-pmid';

		$result = bibliography_builder_rest_resolve_pmid( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_pmid_invalid', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_resolve_pmid_returns_404_for_missing_pubmed_record(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 404 ),
				'body'     => '',
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/pmid/99999999' );
		$request['pmid'] = '99999999';

		$result = bibliography_builder_rest_resolve_pmid( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_pmid_not_found', $result->get_error_code() );
		$this->assertSame( 404, $result->get_error_data()['status'] );

		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => wp_json_encode( array( 'title' => 'Recovered title' ) ),
			)
		);

		$cached = bibliography_builder_rest_resolve_pmid( $request );

		$this->assertInstanceOf( WP_Error::class, $cached );
		$this->assertSame( 'bibliography_builder_pmid_not_found', $cached->get_error_code() );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests() );
	}

	public function test_resolve_pmid_caches_404_responses(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 404 ),
				'body'     => '',
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/pmid/99999999' );
		$request['pmid'] = '99999999';

		$first  = bibliography_builder_rest_resolve_pmid( $request );
		$second = bibliography_builder_rest_resolve_pmid( $request );

		$this->assertInstanceOf( WP_Error::class, $first );
		$this->assertInstanceOf( WP_Error::class, $second );
		$this->assertSame( 'bibliography_builder_pmid_not_found', $second->get_error_code() );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests() );
	}

	public function test_resolve_pmid_returns_502_when_pubmed_request_fails(): void {
		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/pmid/26673779' );
		$request['pmid'] = '26673779';

		$result = bibliography_builder_rest_resolve_pmid( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_pmid_upstream_error', $result->get_error_code() );
		$this->assertSame( 502, $result->get_error_data()['status'] );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests() );
	}

	public function test_resolve_pmid_returns_502_for_unexpected_pubmed_status(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 500 ),
				'body'     => '',
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/pmid/26673779' );
		$request['pmid'] = '26673779';

		$result = bibliography_builder_rest_resolve_pmid( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_pmid_upstream_error', $result->get_error_code() );
		$this->assertSame( 502, $result->get_error_data()['status'] );
		$this->assertSame( 500, $result->get_error_data()['upstream_status'] );

		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => wp_json_encode( array( 'title' => 'Recovered title' ) ),
			)
		);

		$cached = bibliography_builder_rest_resolve_pmid( $request );

		$this->assertInstanceOf( WP_Error::class, $cached );
		$this->assertSame( 'bibliography_builder_pmid_upstream_error', $cached->get_error_code() );
		$this->assertSame( 500, $cached->get_error_data()['upstream_status'] );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests() );
	}

	public function test_resolve_pmid_returns_502_for_invalid_upstream_json(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => 'not-json',
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/pmid/26673779' );
		$request['pmid'] = '26673779';

		$result = bibliography_builder_rest_resolve_pmid( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_pmid_invalid_response', $result->get_error_code() );
		$this->assertSame( 502, $result->get_error_data()['status'] );
	}

	// ── bibliography_builder_rest_pre_serve_request early exits ───────────────

	public function test_pre_serve_returns_served_when_already_served(): void {
		$request  = new WP_REST_Request( 'GET', '/bibliography/v1/posts/101/bibliographies/0' );
		$response = new WP_REST_Response( 'some text', 200 );
		$server   = new WP_REST_Server();

		$result = bibliography_builder_rest_pre_serve_request( true, $response, $request, $server );

		$this->assertTrue( $result );
		$this->assertEmpty( $server->sent_headers );
	}

	public function test_pre_serve_returns_served_for_non_bibliography_route(): void {
		$request  = new WP_REST_Request( 'GET', '/wp/v2/posts/101' );
		$response = new WP_REST_Response( 'text', 200 );
		$server   = new WP_REST_Server();

		$result = bibliography_builder_rest_pre_serve_request( false, $response, $request, $server );

		$this->assertFalse( $result );
		$this->assertEmpty( $server->sent_headers );
	}

	public function test_pre_serve_returns_served_when_format_is_not_text(): void {
		$request = new WP_REST_Request( 'GET', '/bibliography/v1/posts/101/bibliographies/0' );
		$request->set_query_params( array( 'format' => 'json' ) );
		$response = new WP_REST_Response( array( 'key' => 'value' ), 200 );
		$server   = new WP_REST_Server();

		$result = bibliography_builder_rest_pre_serve_request( false, $response, $request, $server );

		$this->assertFalse( $result );
		$this->assertEmpty( $server->sent_headers );
	}

	public function test_pre_serve_returns_served_when_data_is_not_a_string(): void {
		$request = new WP_REST_Request( 'GET', '/bibliography/v1/posts/101/bibliographies/0' );
		$request->set_query_params( array( 'format' => 'text' ) );
		$response = new WP_REST_Response( array( 'not' => 'a string' ), 200 );
		$server   = new WP_REST_Server();

		$result = bibliography_builder_rest_pre_serve_request( false, $response, $request, $server );

		$this->assertFalse( $result );
		$this->assertEmpty( $server->sent_headers );
	}
}
