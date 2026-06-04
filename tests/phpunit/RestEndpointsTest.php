<?php

use PHPUnit\Framework\TestCase;

final class RestEndpointsTest extends TestCase {
	private $published_post_id = 101;
	private $draft_post_id = 102;

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();

		$block_content = '<!-- wp:bibliography-builder/bibliography {} /-->';

		bibliography_builder_test_set_post( $this->published_post_id, 'publish', $block_content );
		bibliography_builder_test_set_post( $this->draft_post_id, 'draft', $block_content );
		bibliography_builder_test_set_parsed_blocks(
			$block_content,
			array(
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array(
						'citationStyle' => 'chicago-notes-bibliography',
						'headingText'   => 'References',
						'outputJsonLd'  => true,
						'outputCoins'   => false,
						'outputCslJson' => true,
						'citations'     => array(
							array(
								'id'              => 'alpha-1',
								'formattedText'   => '<strong>Alpha</strong> citation.',
								'displayOverride' => '',
								'csl'             => array(
									'type'   => 'book',
									'title'  => 'Alpha Book',
									'author' => array(
										array(
											'family' => 'Alpha',
											'given'  => 'Ada',
										),
									),
								),
							),
						),
					),
				),
			)
		);
	}

	public function test_rest_routes_are_registered(): void {
		bibliography_builder_register_rest_routes();
		$routes = $GLOBALS['bibliography_builder_test_rest_routes'];

		$this->assertCount( 4, $routes );
		$this->assertSame( 'bibliography/v1', $routes[0]['namespace'] );
		$this->assertSame( '/format', $routes[0]['route'] );
		$this->assertSame( '/pmid/(?P<pmid>\d{1,8})', $routes[1]['route'] );
		$this->assertSame( '/posts/(?P<post_id>\d+)/bibliographies', $routes[2]['route'] );
		$this->assertSame( '/posts/(?P<post_id>\d+)/bibliographies/(?P<index>\d+)', $routes[3]['route'] );
		$this->assertSame( 'bibliography_builder_rest_pmid_permissions_check', $routes[1]['args']['permission_callback'] );

		$pmid_arg = $routes[1]['args']['args']['pmid'];
		$this->assertSame( '26673779', $pmid_arg['sanitize_callback']( 'PMID: 26-673779' ) );
		$this->assertTrue( $pmid_arg['validate_callback']( '26673779' ) );
		$this->assertFalse( $pmid_arg['validate_callback']( '123456789' ) );
		$this->assertFalse( $pmid_arg['validate_callback']( array( '26673779' ) ) );
	}

	public function test_published_posts_are_publicly_readable(): void {
		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/101/bibliographies' );
		$request['post_id'] = $this->published_post_id;

		$this->assertTrue( bibliography_builder_rest_permissions_check( $request ) );
	}

	public function test_draft_posts_require_edit_capability(): void {
		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/102/bibliographies' );
		$request['post_id'] = $this->draft_post_id;

		$forbidden = bibliography_builder_rest_permissions_check( $request );
		$this->assertInstanceOf( WP_Error::class, $forbidden );
		$this->assertSame( 403, $forbidden->get_error_data()['status'] );

		bibliography_builder_test_grant_cap( 7, 'edit_post', $this->draft_post_id );
		bibliography_builder_test_set_current_user( 7 );

		$this->assertTrue( bibliography_builder_rest_permissions_check( $request ) );
	}

	public function test_password_protected_published_posts_require_edit_capability(): void {
		$post_id       = 103;
		$block_content = '<!-- wp:bibliography-builder/bibliography {} /-->';
		bibliography_builder_test_set_post( $post_id, 'publish', $block_content, true );

		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/103/bibliographies' );
		$request['post_id'] = $post_id;

		$forbidden = bibliography_builder_rest_permissions_check( $request );
		$this->assertInstanceOf( WP_Error::class, $forbidden );
		$this->assertSame( 403, $forbidden->get_error_data()['status'] );

		bibliography_builder_test_grant_cap( 7, 'edit_post', $post_id );
		bibliography_builder_test_set_current_user( 7 );

		$this->assertTrue( bibliography_builder_rest_permissions_check( $request ) );
	}

	public function test_formatter_endpoint_requires_editor_capability(): void {
		$forbidden = bibliography_builder_rest_format_permissions_check();

		$this->assertInstanceOf( WP_Error::class, $forbidden );
		$this->assertSame( 403, $forbidden->get_error_data()['status'] );

		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$this->assertTrue( bibliography_builder_rest_format_permissions_check() );
	}

	public function test_formatter_endpoint_returns_plain_text_entries(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		$request->set_body_params(
			array(
				'style'    => 'chicago-author-date',
				'cslItems' => array(
					array(
						'type'   => 'book',
						'title'  => 'Alpha <script>alert(1)</script> Book',
						'author' => array(
							array(
								'family' => 'Alpha',
								'given'  => 'Ada',
							),
						),
						'issued' => array(
							'date-parts' => array( array( 2024 ) ),
						),
					),
				),
			)
		);

		$response = bibliography_builder_rest_format_citations( $request );
		$data     = $response->get_data();

		$this->assertSame( 'chicago-author-date', $data['style'] );
		$this->assertCount( 1, $data['entries'] );
		$this->assertStringContainsString( 'Alpha', $data['entries'][0]['text'] );
		$this->assertStringNotContainsString( '<script>', $data['entries'][0]['text'] );
	}

	public function test_formatter_endpoint_reads_successful_responses_from_persistent_object_cache(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );
		bibliography_builder_test_use_ext_object_cache( true );

		$csl_items = array(
			array(
				'type'  => 'book',
				'title' => 'Cached formatter response',
			),
		);
		$style_key = 'apa-7';
		$style     = bibliography_builder_get_formatter_style_definition( $style_key );
		$cache_key = bibliography_builder_get_formatter_cache_key( $csl_items, $style_key, $style );

		wp_cache_set(
			$cache_key,
			array( 'Cached object-cache entry' ),
			'bibliography_builder_formatter',
			BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL
		);

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		$request->set_body_params(
			array(
				'style'    => $style_key,
				'cslItems' => $csl_items,
			)
		);

		$response = bibliography_builder_rest_format_citations( $request );
		$data     = $response->get_data();

		$this->assertSame( 'Cached object-cache entry', $data['entries'][0]['text'] );
	}

	public function test_formatter_endpoint_caches_successful_responses_only_when_persistent_object_cache_is_enabled(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );
		bibliography_builder_test_use_ext_object_cache( true );

		$csl_items = array(
			array(
				'type'   => 'book',
				'title'  => 'Cacheable formatter response',
				'author' => array(
					array(
						'family' => 'Cache',
						'given'  => 'Ada',
					),
				),
			),
		);
		$style_key = 'chicago-author-date';
		$style     = bibliography_builder_get_formatter_style_definition( $style_key );

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
		$request->set_body_params(
			array(
				'style'    => $style_key,
				'cslItems' => $csl_items,
			)
		);

		$response = bibliography_builder_rest_format_citations( $request );
		$cache_key = bibliography_builder_get_formatter_cache_key( $csl_items, $style_key, $style );
		$cached    = wp_cache_get( $cache_key, 'bibliography_builder_formatter' );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$this->assertIsArray( $cached );
		$this->assertSame(
			$response->get_data()['entries'][0]['text'],
			$cached[0]
		);
	}

	public function test_pmid_endpoint_requires_editor_capability(): void {
		$forbidden = bibliography_builder_rest_pmid_permissions_check();

		$this->assertInstanceOf( WP_Error::class, $forbidden );
		$this->assertSame( 'bibliography_builder_pmid_forbidden', $forbidden->get_error_code() );
		$this->assertSame( 403, $forbidden->get_error_data()['status'] );

		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$this->assertTrue( bibliography_builder_rest_pmid_permissions_check() );
	}

	public function test_pmid_endpoint_returns_csl_json_from_ncbi(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => wp_json_encode(
					array(
						'id'    => 'pmid:26673779',
						'type'  => 'article-journal',
						'title' => 'CRISPR-Cas9 for medical genetic screens: applications and future perspectives',
					)
				),
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/pmid/26673779' );
		$request['pmid'] = '26673779';

		$response = bibliography_builder_rest_resolve_pmid( $request );
		$data     = $response->get_data();
		$requests = bibliography_builder_test_get_http_requests();

		$this->assertSame( 'pmid:26673779', $data['id'] );
		$this->assertSame(
			'CRISPR-Cas9 for medical genetic screens: applications and future perspectives',
			$data['title']
		);
		$this->assertCount( 1, $requests );
		$this->assertStringContainsString( 'format=csl', $requests[0]['url'] );
		$this->assertStringContainsString( 'id=26673779', $requests[0]['url'] );
		$this->assertSame( 3, $requests[0]['args']['redirection'] );
		$this->assertArrayNotHasKey( 'headers', $requests[0]['args'] );

		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 404 ),
				'body'     => '',
			)
		);

		$cached = bibliography_builder_rest_resolve_pmid( $request );

		$this->assertSame( $data, $cached->get_data() );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests() );
	}

	public function test_pmid_endpoint_caches_successful_csl_json(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => wp_json_encode(
					array(
						'id'    => 'pmid:26673779',
						'type'  => 'article-journal',
						'title' => 'Cached PubMed Record',
					)
				),
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/pmid/26673779' );
		$request['pmid'] = '26673779';

		$first  = bibliography_builder_rest_resolve_pmid( $request )->get_data();
		$second = bibliography_builder_rest_resolve_pmid( $request )->get_data();

		$this->assertSame( 'Cached PubMed Record', $first['title'] );
		$this->assertSame( $first, $second );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests() );
	}

	public function test_formatter_endpoint_supports_all_registered_styles(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$style_keys = array_keys( bibliography_builder_get_formatter_style_definitions() );

		$this->assertSame(
			array(
				'chicago-notes-bibliography',
				'chicago-author-date',
				'apa-7',
				'mla-9',
				'harvard',
				'ieee',
				'vancouver',
				'oscola',
				'abnt',
			),
			$style_keys
		);

		foreach ( $style_keys as $style_key ) {
			$request = new WP_REST_Request( 'POST', '/bibliography/v1/format' );
			$request->set_body_params(
				array(
					'style'    => $style_key,
					'cslItems' => array(
						array(
							'type'   => 'article-journal',
							'title'  => 'Complete Style Coverage',
							'author' => array(
								array(
									'family' => 'Alpha',
									'given'  => 'Ada',
								),
							),
							'issued' => array(
								'date-parts' => array( array( 2024 ) ),
							),
						),
					),
				)
			);

			$response = bibliography_builder_rest_format_citations( $request );

			$this->assertInstanceOf( WP_REST_Response::class, $response, $style_key );
			$data = $response->get_data();
			$this->assertSame( $style_key, $data['style'] );
			$this->assertCount( 1, $data['entries'] );
			$this->assertNotSame( '', $data['entries'][0]['text'], $style_key );
		}
	}

	public function test_collection_endpoint_returns_bibliography_data(): void {
		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/101/bibliographies' );
		$request['post_id'] = $this->published_post_id;

		$response = bibliography_builder_rest_get_bibliographies( $request );
		$data     = $response->get_data();

		$this->assertSame( $this->published_post_id, $data['postId'] );
		$this->assertCount( 1, $data['bibliographies'] );
		$this->assertSame( 1, $data['bibliographies'][0]['entryCount'] );
		$this->assertSame( 'References', $data['bibliographies'][0]['headingText'] );
	}

	public function test_single_endpoint_supports_json_text_and_csl_json_formats(): void {
		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/101/bibliographies/0' );
		$request['post_id'] = $this->published_post_id;
		$request['index']   = 0;

		$json = bibliography_builder_rest_get_bibliography( $request );
		$this->assertSame( 0, $json->get_data()['index'] );

		$request['format'] = 'text';
		$text              = bibliography_builder_rest_get_bibliography( $request );
		$this->assertSame( "Alpha citation.\n", $text->get_data() );
		$this->assertSame( 'text/plain; charset=utf-8', $text->get_headers()['Content-Type'] );

		$request['format'] = 'csl-json';
		$csl_json          = bibliography_builder_rest_get_bibliography( $request );
		$this->assertSame( 'Alpha Book', $csl_json->get_data()[0]['title'] );
		$this->assertSame(
			'application/vnd.citationstyles.csl+json; charset=utf-8',
			$csl_json->get_headers()['Content-Type']
		);
	}

	public function test_single_endpoint_returns_404_for_missing_index(): void {
		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/101/bibliographies/99' );
		$request['post_id'] = $this->published_post_id;
		$request['index']   = 99;

		$response = bibliography_builder_rest_get_bibliography( $request );

		$this->assertInstanceOf( WP_Error::class, $response );
		$this->assertSame( 404, $response->get_error_data()['status'] );
	}

	public function test_outputJsonLd_defaults_to_true_when_absent_from_attrs(): void {
		$post_id = 201;
		$block_content = '<!-- wp:bibliography-builder/bibliography {} /-->';

		bibliography_builder_test_set_post( $post_id, 'publish', $block_content );
		bibliography_builder_test_set_parsed_blocks(
			$block_content,
			array(
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array(
						// outputJsonLd intentionally absent — block.json default is true.
						'citations' => array(),
					),
				),
			)
		);

		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/201/bibliographies' );
		$request['post_id'] = $post_id;

		$response = bibliography_builder_rest_get_bibliographies( $request );
		$data     = $response->get_data();

		$this->assertTrue(
			$data['bibliographies'][0]['outputJsonLd'],
			'outputJsonLd must default to true when the attribute is absent from stored block attrs'
		);
	}

	public function test_plain_text_pre_serve_outputs_sanitized_text_only(): void {
		$request = new WP_REST_Request( 'GET', '/bibliography/v1/posts/101/bibliographies/0' );
		$request->set_query_params( array( 'format' => 'text' ) );
		$response = new WP_REST_Response( '<strong>Alpha</strong> citation.', 200 );
		$response->header( 'Content-Type', 'text/plain; charset=utf-8' );
		$server = new WP_REST_Server();

		ob_start();
		$served = bibliography_builder_rest_pre_serve_request( false, $response, $request, $server );
		$output = ob_get_clean();

		$this->assertTrue( $served );
		$this->assertSame( 'Alpha citation.', $output );
		$this->assertSame( 'text/plain; charset=utf-8', $server->sent_headers['Content-Type'] );
	}
}
