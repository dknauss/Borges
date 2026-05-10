<?php

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
