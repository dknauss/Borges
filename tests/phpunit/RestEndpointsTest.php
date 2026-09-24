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

		$this->assertCount( 7, $routes );
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

		// PMCID is registered last so the earlier route indices stay stable.
		$this->assertSame( '/pmcid/(?P<pmcid>(?:PMC)?\d{1,9})', $routes[4]['route'] );
		$this->assertSame( 'bibliography_builder_rest_resolve_pmcid', $routes[4]['args']['callback'] );
		$this->assertSame( 'bibliography_builder_rest_pmid_permissions_check', $routes[4]['args']['permission_callback'] );

		$pmcid_arg = $routes[4]['args']['args']['pmcid'];
		$this->assertSame( '3531190', $pmcid_arg['sanitize_callback']( 'PMC3531190' ) );
		$this->assertTrue( $pmcid_arg['validate_callback']( '3531190' ) );
		$this->assertTrue( $pmcid_arg['validate_callback']( 'pmc3531190' ) );
		$this->assertFalse( $pmcid_arg['validate_callback']( '1234567890' ) );
		$this->assertFalse( $pmcid_arg['validate_callback']( 'PMC' ) );
		$this->assertFalse( $pmcid_arg['validate_callback']( array( '3531190' ) ) );

		$this->assertSame( '/arxiv', $routes[5]['route'] );
		$this->assertSame( 'bibliography_builder_rest_resolve_arxiv', $routes[5]['args']['callback'] );
		$this->assertSame( 'bibliography_builder_rest_arxiv_permissions_check', $routes[5]['args']['permission_callback'] );

		$arxiv_arg = $routes[5]['args']['args']['id'];
		$this->assertTrue( $arxiv_arg['validate_callback']( '1706.03762' ) );
		$this->assertTrue( $arxiv_arg['validate_callback']( 'hep-th/9901001v2' ) );
		$this->assertFalse( $arxiv_arg['validate_callback']( '../../etc/passwd' ) );
		$this->assertFalse( $arxiv_arg['validate_callback']( array( '1706.03762' ) ) );

		$this->assertSame( '/isbn/(?P<isbn>[0-9]{9}[0-9Xx]|97[89][0-9]{10})', $routes[6]['route'] );
		$this->assertSame( 'bibliography_builder_rest_isbn_permissions_check', $routes[6]['args']['permission_callback'] );

		$isbn_arg = $routes[6]['args']['args']['isbn'];
		$this->assertTrue( $isbn_arg['validate_callback']( '9780140328721' ) );
		$this->assertTrue( $isbn_arg['validate_callback']( '080442957X' ) );
		$this->assertFalse( $isbn_arg['validate_callback']( '9780140328722' ) );
		$this->assertFalse( $isbn_arg['validate_callback']( array( '9780140328721' ) ) );
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

		// The resolver follows up to three redirects. wp_remote_get would follow
		// them anywhere, including a host on the site's own network; the safe
		// variant runs each hop through wp_http_validate_url first.
		$this->assertSame(
			'wp_safe_remote_get',
			$requests[0]['function'],
			'PMID resolution must use wp_safe_remote_get so redirect targets are validated.'
		);

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

	public function test_pmcid_endpoint_returns_csl_json_from_ncbi_pmc_exporter(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => wp_json_encode(
					array(
						'id'    => 'pmc:3531190',
						'type'  => 'article-journal',
						'title' => 'PubMed Central Record',
					)
				),
			)
		);

		$request          = new WP_REST_Request( 'GET', '/bibliography/v1/pmcid/PMC3531190' );
		$request['pmcid'] = '3531190';

		$response = bibliography_builder_rest_resolve_pmcid( $request );
		$requests = bibliography_builder_test_get_http_requests();

		$this->assertSame( 'PubMed Central Record', $response->get_data()['title'] );
		$this->assertCount( 1, $requests );
		$this->assertStringStartsWith( BIBLIOGRAPHY_BUILDER_PMC_CSL_API, $requests[0]['url'] );
		$this->assertStringContainsString( 'format=csl', $requests[0]['url'] );
		// NCBI's PMC exporter rejects `id=PMC…` with HTTP 400; it takes bare digits.
		$this->assertStringContainsString( 'id=3531190', $requests[0]['url'] );
		$this->assertStringNotContainsString( 'id=PMC', $requests[0]['url'] );
		$this->assertSame( 'wp_safe_remote_get', $requests[0]['function'] );
		$this->assertSame( 3, $requests[0]['args']['redirection'] );

		// Second call is served from cache.
		bibliography_builder_rest_resolve_pmcid( $request );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests() );
	}

	public function test_pmcid_and_pmid_caches_do_not_collide_on_equal_digits(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => wp_json_encode( array( 'title' => 'PubMed record 1234567' ) ),
			)
		);

		$pmid_request         = new WP_REST_Request( 'GET', '/bibliography/v1/pmid/1234567' );
		$pmid_request['pmid'] = '1234567';
		bibliography_builder_rest_resolve_pmid( $pmid_request );

		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => wp_json_encode( array( 'title' => 'PMC record 1234567' ) ),
			)
		);

		$pmcid_request          = new WP_REST_Request( 'GET', '/bibliography/v1/pmcid/1234567' );
		$pmcid_request['pmcid'] = '1234567';
		$pmcid_result           = bibliography_builder_rest_resolve_pmcid( $pmcid_request );

		$this->assertSame( 'PMC record 1234567', $pmcid_result->get_data()['title'] );
		$this->assertCount( 2, bibliography_builder_test_get_http_requests() );
	}

	public function test_pmcid_endpoint_uses_pmcid_error_codes(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 404 ),
				'body'     => '',
			)
		);

		$request          = new WP_REST_Request( 'GET', '/bibliography/v1/pmcid/99999999' );
		$request['pmcid'] = '99999999';

		$not_found = bibliography_builder_rest_resolve_pmcid( $request );

		$this->assertInstanceOf( WP_Error::class, $not_found );
		$this->assertSame( 'bibliography_builder_pmcid_not_found', $not_found->get_error_code() );
		$this->assertSame( 404, $not_found->get_error_data()['status'] );

		$invalid_request          = new WP_REST_Request( 'GET', '/bibliography/v1/pmcid/x' );
		$invalid_request['pmcid'] = 'PMC12';

		$invalid = bibliography_builder_rest_resolve_pmcid( $invalid_request );

		$this->assertInstanceOf( WP_Error::class, $invalid );
		$this->assertSame( 'bibliography_builder_pmcid_invalid', $invalid->get_error_code() );
		$this->assertSame( 400, $invalid->get_error_data()['status'] );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests() );
	}

	public function test_pmcid_endpoint_reports_unreachable_upstream(): void {
		$request          = new WP_REST_Request( 'GET', '/bibliography/v1/pmcid/3531190' );
		$request['pmcid'] = '3531190';

		$result = bibliography_builder_rest_resolve_pmcid( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_pmcid_upstream_error', $result->get_error_code() );
		$this->assertSame( 502, $result->get_error_data()['status'] );
	}

	public function test_pmcid_endpoint_rejects_non_json_response(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => '<html>maintenance</html>',
			)
		);

		$request          = new WP_REST_Request( 'GET', '/bibliography/v1/pmcid/3531190' );
		$request['pmcid'] = '3531190';

		$result = bibliography_builder_rest_resolve_pmcid( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_pmcid_invalid_response', $result->get_error_code() );
	}

	/**
	 * Atom response in the shape export.arxiv.org returns for one entry.
	 */
	private function arxiv_atom_fixture(): string {
		return '<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title type="html">ArXiv Query: id_list=1706.03762</title>
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <updated>2023-08-02T00:41:18Z</updated>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is All
      You Need</title>
    <summary>The dominant sequence transduction models...</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Ludwig van der Waals</name></author>
    <author><name>Martin Luther King Jr.</name></author>
    <author><name>ATLAS Collaboration</name></author>
    <arxiv:doi>10.5555/published.version</arxiv:doi>
    <link href="http://arxiv.org/abs/1706.03762v7" rel="alternate" type="text/html"/>
  </entry>
</feed>';
	}

	public function test_arxiv_endpoint_maps_atom_to_a_csl_preprint(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => $this->arxiv_atom_fixture(),
			)
		);

		$request       = new WP_REST_Request( 'GET', '/bibliography/v1/arxiv' );
		$request['id'] = 'arXiv:1706.03762';

		$data     = bibliography_builder_rest_resolve_arxiv( $request )->get_data();
		$requests = bibliography_builder_test_get_http_requests();

		$this->assertSame( 'article', $data['type'] );
		$this->assertSame( 'Attention Is All You Need', $data['title'] );
		$this->assertSame( 'arXiv', $data['publisher'] );
		$this->assertSame( 'arXiv:1706.03762', $data['number'] );
		// The preprint's own DataCite DOI, not the published version's DOI.
		$this->assertSame( '10.48550/arXiv.1706.03762', $data['DOI'] );
		$this->assertSame( 'https://arxiv.org/abs/1706.03762', $data['URL'] );
		$this->assertSame( array( array( 2017, 6, 12 ) ), $data['issued']['date-parts'] );
		$this->assertSame(
			array(
				array(
					'family' => 'Vaswani',
					'given'  => 'Ashish',
				),
				array(
					'family' => 'van der Waals',
					'given'  => 'Ludwig',
				),
				array(
					'family' => 'King',
					'given'  => 'Martin Luther',
					'suffix' => 'Jr.',
				),
				array( 'literal' => 'ATLAS Collaboration' ),
			),
			$data['author']
		);

		$this->assertCount( 1, $requests );
		$this->assertStringStartsWith( BIBLIOGRAPHY_BUILDER_ARXIV_API, $requests[0]['url'] );
		$this->assertStringContainsString( 'id_list=1706.03762', $requests[0]['url'] );
		$this->assertSame( 'wp_safe_remote_get', $requests[0]['function'] );

		bibliography_builder_rest_resolve_arxiv( $request );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests(), 'Second call is cached.' );
	}

	public function test_arxiv_endpoint_keeps_the_requested_version_in_the_url_only(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => $this->arxiv_atom_fixture(),
			)
		);

		$request       = new WP_REST_Request( 'GET', '/bibliography/v1/arxiv' );
		$request['id'] = 'https://arxiv.org/pdf/1706.03762v5.pdf';

		$data = bibliography_builder_rest_resolve_arxiv( $request )->get_data();

		$this->assertSame( 'https://arxiv.org/abs/1706.03762v5', $data['URL'] );
		$this->assertSame( 'arXiv:1706.03762', $data['number'] );
		$this->assertSame( '10.48550/arXiv.1706.03762', $data['DOI'] );
	}

	public function test_arxiv_endpoint_sends_legacy_ids_encoded_exactly_once(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => $this->arxiv_atom_fixture(),
			)
		);

		$request       = new WP_REST_Request( 'GET', '/bibliography/v1/arxiv' );
		$request['id'] = 'arXiv:hep-th/9901001';

		bibliography_builder_rest_resolve_arxiv( $request );
		$url = bibliography_builder_test_get_http_requests()[0]['url'];

		// add_query_arg() does not encode values (callers must), so the slash
		// is encoded once here and decoded by arXiv back to hep-th/9901001.
		$this->assertStringEndsWith( '?id_list=hep-th%2F9901001', $url );
		$this->assertStringNotContainsString( '%252F', $url );
	}

	public function test_arxiv_endpoint_reports_api_error_entries_as_not_found(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>'
					. '<id>http://arxiv.org/api/errors#incorrect_id_format_for_9999.99999</id>'
					. '<title>Error</title></entry></feed>',
			)
		);

		$request       = new WP_REST_Request( 'GET', '/bibliography/v1/arxiv' );
		$request['id'] = '9999.99999';

		$result = bibliography_builder_rest_resolve_arxiv( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_arxiv_not_found', $result->get_error_code() );
		$this->assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_arxiv_endpoint_reports_an_empty_feed_as_not_found(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>',
			)
		);

		$request       = new WP_REST_Request( 'GET', '/bibliography/v1/arxiv' );
		$request['id'] = '2301.00001';

		$result = bibliography_builder_rest_resolve_arxiv( $request );

		$this->assertSame( 'bibliography_builder_arxiv_not_found', $result->get_error_code() );
	}

	public function test_arxiv_endpoint_rejects_malformed_xml(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => '<html><body>Service unavailable</body',
			)
		);

		$request       = new WP_REST_Request( 'GET', '/bibliography/v1/arxiv' );
		$request['id'] = '2301.00001';

		$result = bibliography_builder_rest_resolve_arxiv( $request );

		$this->assertSame( 'bibliography_builder_arxiv_invalid_response', $result->get_error_code() );
	}

	public function test_arxiv_endpoint_refuses_responses_that_declare_entities(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => '<?xml version="1.0"?><!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]>'
					. '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2301.00001v1</id>'
					. '<title>&x;</title></entry></feed>',
			)
		);

		$request       = new WP_REST_Request( 'GET', '/bibliography/v1/arxiv' );
		$request['id'] = '2301.00001';

		$result = bibliography_builder_rest_resolve_arxiv( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_arxiv_invalid_response', $result->get_error_code() );
	}

	public function test_arxiv_endpoint_rejects_invalid_ids_without_a_request(): void {
		foreach ( array( '', 'not-an-id', '1706.037', 'http://evil.example/abs/1706.03762' ) as $bad_id ) {
			$request       = new WP_REST_Request( 'GET', '/bibliography/v1/arxiv' );
			$request['id'] = $bad_id;

			$result = bibliography_builder_rest_resolve_arxiv( $request );

			$this->assertSame( 'bibliography_builder_arxiv_invalid', $result->get_error_code(), $bad_id );
		}

		$this->assertCount( 0, bibliography_builder_test_get_http_requests() );
	}

	public function test_arxiv_endpoint_requires_editor_capability(): void {
		$forbidden = bibliography_builder_rest_arxiv_permissions_check();

		$this->assertInstanceOf( WP_Error::class, $forbidden );
		$this->assertSame( 'bibliography_builder_arxiv_forbidden', $forbidden->get_error_code() );

		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$this->assertTrue( bibliography_builder_rest_arxiv_permissions_check() );
	}

	/**
	 * Open Library Books API response (`jscmd=data`) for one ISBN.
	 */
	private function open_library_fixture(): string {
		return wp_json_encode(
			array(
				'ISBN:9780140328721' => array(
					'url'             => 'https://openlibrary.org/books/OL7353617M/Fantastic_Mr._Fox',
					'title'           => 'Fantastic Mr. Fox',
					'subtitle'        => 'A Story',
					'authors'         => array(
						array(
							'url'  => 'https://openlibrary.org/authors/OL34184A/Roald_Dahl',
							'name' => 'Roald Dahl',
						),
					),
					'number_of_pages' => 96,
					'publishers'      => array( array( 'name' => 'Puffin' ) ),
					'publish_places'  => array( array( 'name' => 'New York' ) ),
					'publish_date'    => 'October 1, 1988',
				),
			)
		);
	}

	public function test_isbn_endpoint_maps_open_library_to_a_csl_book(): void {
		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => $this->open_library_fixture(),
			)
		);

		// ISBN-10 input is normalized to the ISBN-13 used for lookup and cache.
		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/isbn/0140328726' );
		$request['isbn'] = '0140328726';

		$data     = bibliography_builder_rest_resolve_isbn( $request )->get_data();
		$requests = bibliography_builder_test_get_http_requests();

		$this->assertSame(
			array(
				'type'            => 'book',
				'title'           => 'Fantastic Mr. Fox: A Story',
				'ISBN'            => '9780140328721',
				'author'          => array(
					array(
						'family' => 'Dahl',
						'given'  => 'Roald',
					),
				),
				'publisher'       => 'Puffin',
				'publisher-place' => 'New York',
				'issued'          => array( 'date-parts' => array( array( 1988 ) ) ),
				'number-of-pages' => '96',
			),
			$data
		);
		$this->assertCount( 1, $requests );
		$this->assertStringStartsWith( BIBLIOGRAPHY_BUILDER_OPEN_LIBRARY_BOOKS_API, $requests[0]['url'] );
		// Both forms are requested: Open Library matches stored identifiers literally.
		$this->assertStringContainsString( 'bibkeys=ISBN:9780140328721,ISBN:0140328726', $requests[0]['url'] );
		$this->assertStringContainsString( 'jscmd=data', $requests[0]['url'] );
		$this->assertSame( 'wp_safe_remote_get', $requests[0]['function'] );

		$request13         = new WP_REST_Request( 'GET', '/bibliography/v1/isbn/9780140328721' );
		$request13['isbn'] = '9780140328721';
		bibliography_builder_rest_resolve_isbn( $request13 );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests(), 'ISBN-10 and ISBN-13 share one cache entry.' );
	}

	public function test_isbn13_to_isbn10_conversion(): void {
		$this->assertSame( '0140328726', bibliography_builder_isbn13_to_isbn10( '9780140328721' ) );
		$this->assertSame( '080442957X', bibliography_builder_isbn13_to_isbn10( '9780804429573' ) );
		$this->assertSame( '', bibliography_builder_isbn13_to_isbn10( '9791032300824' ) );
	}

	public function test_isbn_endpoint_accepts_a_record_keyed_by_the_isbn10_form(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => wp_json_encode(
					array( 'ISBN:0140328726' => array( 'title' => 'Fantastic Mr. Fox' ) )
				),
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/isbn/9780140328721' );
		$request['isbn'] = '9780140328721';

		$data = bibliography_builder_rest_resolve_isbn( $request )->get_data();

		$this->assertSame( 'Fantastic Mr. Fox', $data['title'] );
		$this->assertSame( '9780140328721', $data['ISBN'] );
	}

	public function test_isbn_endpoint_reports_an_unknown_isbn_as_not_found(): void {
		bibliography_builder_test_set_http_response(
			array(
				'response' => array( 'code' => 200 ),
				'body'     => '{}',
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/isbn/9780000000002' );
		$request['isbn'] = '9780000000002';

		$result = bibliography_builder_rest_resolve_isbn( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_isbn_not_found', $result->get_error_code() );
		$this->assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_isbn_endpoint_rejects_unusable_records_from_both_providers(): void {
		bibliography_builder_test_set_http_response_for(
			'openlibrary.org',
			array(
				'response' => array( 'code' => 200 ),
				'body'     => '{"ISBN:9780140328721":{"authors":[]}}',
			)
		);
		bibliography_builder_test_set_http_response_for(
			'googleapis.com',
			array(
				'response' => array( 'code' => 200 ),
				'body'     => 'not json',
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/isbn/9780140328721' );
		$request['isbn'] = '9780140328721';

		$result = bibliography_builder_rest_resolve_isbn( $request );

		$this->assertSame( 'bibliography_builder_isbn_invalid_response', $result->get_error_code() );
		$this->assertCount( 2, bibliography_builder_test_get_http_requests() );
	}

	/**
	 * Google Books volumes search response for one ISBN.
	 */
	private function google_books_fixture( string $identifier = '9780140328721' ): string {
		return wp_json_encode(
			array(
				'kind'       => 'books#volumes',
				'totalItems' => 1,
				'items'      => array(
					array(
						'volumeInfo' => array(
							'title'               => 'Fantastic Mr. Fox',
							'authors'             => array( 'Roald Dahl' ),
							'publisher'           => 'Puffin',
							'publishedDate'       => '1988-10-01',
							'pageCount'           => 96,
							'industryIdentifiers' => array(
								array(
									'type'       => 'ISBN_13',
									'identifier' => $identifier,
								),
							),
						),
					),
				),
			)
		);
	}

	public function test_isbn_endpoint_falls_back_to_google_books_when_open_library_fails(): void {
		bibliography_builder_test_set_http_response_for(
			'openlibrary.org',
			array(
				'response' => array( 'code' => 404 ),
				'body'     => '',
			)
		);
		bibliography_builder_test_set_http_response_for(
			'googleapis.com',
			array(
				'response' => array( 'code' => 200 ),
				'body'     => $this->google_books_fixture(),
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/isbn/9780140328721' );
		$request['isbn'] = '9780140328721';

		$data     = bibliography_builder_rest_resolve_isbn( $request )->get_data();
		$requests = bibliography_builder_test_get_http_requests();

		$this->assertSame(
			array(
				'type'            => 'book',
				'title'           => 'Fantastic Mr. Fox',
				'ISBN'            => '9780140328721',
				'author'          => array(
					array(
						'family' => 'Dahl',
						'given'  => 'Roald',
					),
				),
				'publisher'       => 'Puffin',
				'issued'          => array( 'date-parts' => array( array( 1988, 10, 1 ) ) ),
				'number-of-pages' => '96',
			),
			$data
		);
		$this->assertCount( 2, $requests );
		$this->assertStringStartsWith( BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API, $requests[1]['url'] );
		$this->assertStringEndsWith( '?q=isbn%3A9780140328721', $requests[1]['url'] );
		$this->assertSame( 'wp_safe_remote_get', $requests[1]['function'] );

		// Both providers' results are cached: a repeat lookup makes no request.
		bibliography_builder_rest_resolve_isbn( $request );
		$this->assertCount( 2, bibliography_builder_test_get_http_requests() );
	}

	public function test_isbn_endpoint_does_not_call_google_books_when_open_library_succeeds(): void {
		bibliography_builder_test_set_http_response_for(
			'openlibrary.org',
			array(
				'response' => array( 'code' => 200 ),
				'body'     => $this->open_library_fixture(),
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/isbn/9780140328721' );
		$request['isbn'] = '9780140328721';

		bibliography_builder_rest_resolve_isbn( $request );

		$this->assertCount( 1, bibliography_builder_test_get_http_requests() );
	}

	public function test_google_books_rejects_a_volume_for_a_different_isbn(): void {
		$this->assertSame(
			'not_found',
			bibliography_builder_google_books_to_csl( $this->google_books_fixture( '9780000000002' ), '9780140328721' )
		);
		$this->assertSame(
			'not_found',
			bibliography_builder_google_books_to_csl( '{"kind":"books#volumes","totalItems":0}', '9780140328721' )
		);
		$this->assertIsArray(
			bibliography_builder_google_books_to_csl( $this->google_books_fixture( '0140328726' ), '9780140328721' ),
			'An ISBN-10 identifier for the same book matches.'
		);
	}

	public function test_isbn_endpoint_rejects_invalid_checksums_without_a_request(): void {
		foreach ( array( '9780140328722', '0140328727', '1234567890123', 'ISBN' ) as $bad_isbn ) {
			$request         = new WP_REST_Request( 'GET', '/bibliography/v1/isbn/x' );
			$request['isbn'] = $bad_isbn;

			$result = bibliography_builder_rest_resolve_isbn( $request );

			$this->assertSame( 'bibliography_builder_isbn_invalid', $result->get_error_code(), $bad_isbn );
		}

		$this->assertCount( 0, bibliography_builder_test_get_http_requests() );
	}

	public function test_isbn_endpoint_requires_editor_capability(): void {
		$this->assertInstanceOf( WP_Error::class, bibliography_builder_rest_isbn_permissions_check() );

		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$this->assertTrue( bibliography_builder_rest_isbn_permissions_check() );
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
