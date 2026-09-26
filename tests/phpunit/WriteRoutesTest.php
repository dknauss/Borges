<?php
/**
 * Citation write routes (Phase 05, M2 / Tier 2).
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class WriteRoutesTest extends TestCase {

	const POST_ID = 42;
	const USER_ID = 7;

	private $content;

	protected function setUp(): void {
		bibliography_builder_test_reset_state();

		if ( ! bibliography_builder_can_render_save_markup() || ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) ) {
			$this->markTestSkipped( 'intl and citeproc-php are required.' );
		}

		$this->content = "<!-- wp:paragraph -->\n<p>Intro — ✓</p>\n<!-- /wp:paragraph -->\n\n"
			. self::block(
				array(
					'bibliographyId' => 'notes-block',
					'citationStyle'  => 'chicago-notes-bibliography',
					'headingText'    => 'Works Cited',
					'citations'      => array(
						self::citation( 'c-knuth', 'Literate Programming', 'Knuth', 'Donald E.', 1984, '10.1093/comjnl/27.2.97' ),
						self::citation( 'c-turing', 'Computing Machinery and Intelligence', 'Turing', 'A. M.', 1950 ),
					),
				)
			)
			. "\n\n"
			. self::block(
				array(
					'bibliographyId' => 'ieee-block',
					'citationStyle'  => 'ieee',
					'citations'      => array(
						self::citation( 'i-one', 'First Paper', 'Zed', 'Ann', 2001 ),
						self::citation( 'i-two', 'Second Paper', 'Abel', 'Bo', 2002 ),
					),
				)
			)
			. "\n";

		bibliography_builder_test_set_post( self::POST_ID, 'publish', $this->content );
		bibliography_builder_test_set_parsed_blocks( $this->content, ( new WP_Block_Parser() )->parse( $this->content ) );
		bibliography_builder_test_set_current_user( self::USER_ID );
		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_post', self::POST_ID );
	}

	private static function citation( $id, $title, $family, $given, $year, $doi = null ) {
		$csl = array(
			'type'   => 'article-journal',
			'title'  => $title,
			'author' => array(
				array(
					'family' => $family,
					'given'  => $given,
				),
			),
			'issued' => array( 'date-parts' => array( array( $year ) ) ),
		);

		if ( null !== $doi ) {
			$csl['DOI'] = $doi;
		}

		return array(
			'id'            => $id,
			'csl'           => $csl,
			'formattedText' => $family . '. ' . $title . '.',
		);
	}

	private static function block( $attrs ) {
		$html = bibliography_builder_render_save_markup( bibliography_builder_decode_save_attributes( wp_json_encode( $attrs ) ) );

		return bibliography_builder_serialize_bibliography_block( $attrs, $html );
	}

	private static function request( $method, $ref, $body = array(), $params = array() ) {
		$request = new WP_REST_Request( $method, '/bibliography/v1/posts/' . self::POST_ID . '/bibliographies/' . $ref . '/citations' );
		$request->set_query_params(
			array_merge(
				array(
					'post_id' => self::POST_ID,
					'ref'     => (string) $ref,
					'dry_run' => true,
				),
				$params
			)
		);

		if ( array() !== $body ) {
			$request->set_body_params( $body );
		}

		return $request;
	}

	private static function commit( WP_REST_Request $request, $etag = null ) {
		$request['dry_run'] = false;
		$request->set_header( 'If-Match', null === $etag ? bibliography_builder_post_etag( get_post( self::POST_ID ) ) : $etag );

		return $request;
	}

	private function saved_blocks() {
		return bibliography_builder_locate_bibliography_blocks( get_post( self::POST_ID )->post_content );
	}

	/**
	 * Every saved bibliography block must hold exactly the markup save()
	 * renders for its attributes, or the editor would call it invalid.
	 */
	private function assert_blocks_are_valid() {
		$content = get_post( self::POST_ID )->post_content;

		foreach ( ( new WP_Block_Parser() )->parse( $content ) as $block ) {
			if ( 'bibliography-builder/bibliography' !== $block['blockName'] ) {
				continue;
			}

			$attrs = bibliography_builder_decode_save_attributes( wp_json_encode( $block['attrs'] ) );
			$this->assertSame( bibliography_builder_render_save_markup( $attrs ), $block['innerHTML'] );
		}
	}

	public function test_routes_are_off_unless_enabled() {
		bibliography_builder_register_write_routes();
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_rest_routes'] );

		add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
		bibliography_builder_register_write_routes();

		$routes = array_column( $GLOBALS['bibliography_builder_test_rest_routes'], 'route' );
		$this->assertCount( 3, $routes );
		$this->assertStringEndsWith( '/citations/order', $routes[0] );
		$this->assertStringEndsWith( '/citations', $routes[1] );
		$this->assertStringContainsString( '(?P<citation_id>', $routes[2] );
	}

	public function test_permission_needs_edit_post() {
		$request = self::request( 'POST', 0 );
		$this->assertTrue( bibliography_builder_rest_write_permissions_check( $request ) );

		bibliography_builder_test_set_current_user( 99 );
		$this->assertSame( 'bibliography_builder_write_forbidden', bibliography_builder_rest_write_permissions_check( $request )->get_error_code() );

		$missing            = self::request( 'POST', 0 );
		$missing['post_id'] = 404;
		$this->assertSame( 'bibliography_builder_post_not_found', bibliography_builder_rest_write_permissions_check( $missing )->get_error_code() );
	}

	public function test_add_is_a_dry_run_by_default() {
		$response = bibliography_builder_rest_add_citations(
			self::request( 'POST', 'notes-block', array( 'items' => array( self::citation( 'x', 'Beta Study', 'Beta', 'Bea', 2010 )['csl'] ) ) )
		);

		$data = $response->get_data();
		$this->assertTrue( $data['dryRun'] );
		$this->assertCount( 1, $data['changes']['added'] );
		$this->assertSame( 3, $data['bibliography']['entryCount'] );
		$this->assertSame( bibliography_builder_post_etag( get_post( self::POST_ID ) ), $response->get_headers()['ETag'] );
		$this->assertSame( $this->content, get_post( self::POST_ID )->post_content );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );
	}

	public function test_a_write_needs_a_current_etag() {
		$request = self::request( 'POST', 0, array( 'items' => array( self::citation( 'x', 'Beta Study', 'Beta', 'Bea', 2010 )['csl'] ) ) );

		$missing = self::commit( $request, '' );
		$this->assertSame( 428, bibliography_builder_rest_add_citations( $missing )->get_error_data()['status'] );

		$stale = self::commit( $request, '"stale"' );
		$error = bibliography_builder_rest_add_citations( $stale );
		$this->assertSame( 412, $error->get_error_data()['status'] );
		$this->assertSame( bibliography_builder_post_etag( get_post( self::POST_ID ) ), $error->get_error_data()['etag'] );

		$this->assertSame( $this->content, get_post( self::POST_ID )->post_content );
	}

	public function test_add_writes_only_the_target_block() {
		$before   = $this->saved_blocks();
		$response = bibliography_builder_rest_add_citations(
			self::commit( self::request( 'POST', 'notes-block', array( 'items' => array( self::citation( 'x', 'Beta Study', 'Beta', 'Bea', 2010 )['csl'] ) ) ) )
		);

		$data    = $response->get_data();
		$content = get_post( self::POST_ID )->post_content;
		$after   = $this->saved_blocks();

		$this->assertFalse( $data['dryRun'] );
		$this->assertCount( 1, $GLOBALS['bibliography_builder_test_post_updates'] );
		$this->assertSame( bibliography_builder_post_etag( get_post( self::POST_ID ) ), $data['etag'] );
		$this->assertNotSame( bibliography_builder_post_etag( (object) array( 'post_content' => $this->content ) ), $data['etag'] );

		// Everything before the first block and the whole second block are untouched.
		$this->assertSame( substr( $this->content, 0, $before[0]['start'] ), substr( $content, 0, $after[0]['start'] ) );
		$this->assertSame(
			substr( $this->content, $before[1]['start'] ),
			substr( $content, $after[1]['start'] )
		);

		// Stored in display order (Chicago sorts by author), and valid.
		$citations = bibliography_builder_write_to_arrays( $after[0]['attrs'] )['citations'];
		$this->assertSame( array( 'Beta', 'Knuth', 'Turing' ), array_map( static fn( $c ) => $c['csl']['author'][0]['family'], $citations ) );
		$this->assertStringContainsString( 'Beta Study', $citations[0]['formattedText'] );
		$this->assertSame( $data['changes']['added'][0], $citations[0]['id'] );
		$this->assert_blocks_are_valid();
	}

	public function test_add_skips_duplicates() {
		$dupe_doi   = self::citation( 'x', 'Other Title', 'Other', 'O', 1999, '10.1093/comjnl/27.2.97' )['csl'];
		$new        = self::citation( 'y', 'Fresh', 'Fresh', 'F', 2020 )['csl'];
		$data       = bibliography_builder_rest_add_citations(
			self::request( 'POST', 0, array( 'items' => array( $dupe_doi, $new, $new ) ) )
		)->get_data();

		$this->assertCount( 1, $data['changes']['added'] );
		$this->assertSame(
			array(
				array(
					'item'        => 0,
					'duplicateOf' => 'c-knuth',
				),
				array(
					'item'        => 2,
					'duplicateOf' => $data['changes']['added'][0],
				),
			),
			$data['changes']['skipped']
		);
	}

	public function test_add_rejects_bad_items() {
		$this->assertSame( 400, bibliography_builder_rest_add_citations( self::request( 'POST', 0, array( 'items' => array() ) ) )->get_error_data()['status'] );
		$this->assertSame( 400, bibliography_builder_rest_add_citations( self::request( 'POST', 0, array( 'other' => 1 ) ) )->get_error_data()['status'] );
		$this->assertSame( 400, bibliography_builder_rest_add_citations( self::request( 'POST', 0, array( 'items' => array_fill( 0, 51, array( 'type' => 'book', 'title' => 'x' ) ) ) ) )->get_error_data()['status'] );
		$this->assertInstanceOf( WP_Error::class, bibliography_builder_rest_add_citations( self::request( 'POST', 0, array( 'items' => array( 'not an object' ) ) ) ) );
	}

	public function test_patch_updates_one_citation_like_the_field_editor() {
		$request                = self::request( 'PATCH', 'notes-block', array( 'title' => 'Literate Programming, Revisited' ) );
		$request['citation_id'] = 'c-knuth';

		$data      = bibliography_builder_rest_update_citation( self::commit( $request ) )->get_data();
		$citations = bibliography_builder_write_to_arrays( $this->saved_blocks()[0]['attrs'] )['citations'];
		$knuth     = $citations[0];

		$this->assertSame( array( 'c-knuth' ), $data['changes']['updated'] );
		$this->assertSame( 'Literate Programming, Revisited', $knuth['csl']['title'] );
		$this->assertStringContainsString( 'Revisited', $knuth['formattedText'] );
		$this->assertSame( '10.1093/comjnl/27.2.97', $knuth['csl']['DOI'] );
		$this->assert_blocks_are_valid();
	}

	public function test_patch_null_removes_a_field_and_locked_fields_are_refused() {
		$request                = self::request( 'PATCH', 0, array( 'DOI' => null ) );
		$request['citation_id'] = 'c-knuth';
		$citation               = bibliography_builder_rest_update_citation( $request )->get_data()['bibliography']['citations'];
		$this->assertArrayNotHasKey( 'DOI', $citation[0]['csl'] );

		foreach ( array( 'id', 'type' ) as $field ) {
			$locked                = self::request( 'PATCH', 0, array( $field => 'x' ) );
			$locked['citation_id'] = 'c-knuth';
			$this->assertSame( 'bibliography_builder_locked_field', bibliography_builder_rest_update_citation( $locked )->get_error_code() );
		}

		$unknown                = self::request( 'PATCH', 0, array( 'title' => 'x' ) );
		$unknown['citation_id'] = 'nope';
		$this->assertSame( 404, bibliography_builder_rest_update_citation( $unknown )->get_error_data()['status'] );
	}

	public function test_delete_returns_the_removed_entry_and_can_empty_a_block() {
		foreach ( array( 'c-knuth', 'c-turing' ) as $id ) {
			$request                = self::request( 'DELETE', 'notes-block' );
			$request['citation_id'] = $id;
			$data                   = bibliography_builder_rest_delete_citation( self::commit( $request ) )->get_data();
			$this->assertSame( $id, $data['changes']['removed']['id'] );
		}

		$content = get_post( self::POST_ID )->post_content;
		$this->assertStringContainsString( '"bibliographyId":"notes-block","citationStyle":"chicago-notes-bibliography","headingText":"Works Cited","citations":[]} /-->', $content );
		$this->assertCount( 2, $this->saved_blocks() );
		$this->assert_blocks_are_valid();
	}

	public function test_reorder_applies_to_numeric_styles_only() {
		$request = self::request( 'PUT', 'ieee-block', array( 'ids' => array( 'i-two', 'i-one' ) ) );
		$data    = bibliography_builder_rest_reorder_citations( self::commit( $request ) )->get_data();

		$this->assertSame( array( 'i-two', 'i-one' ), $data['changes']['order'] );
		$this->assertSame( array( 'i-two', 'i-one' ), array_column( bibliography_builder_write_to_arrays( $this->saved_blocks()[1]['attrs'] )['citations'], 'id' ) );
		$this->assert_blocks_are_valid();

		$bad = self::request( 'PUT', 'ieee-block', array( 'ids' => array( 'i-two' ) ) );
		$this->assertSame( 400, bibliography_builder_rest_reorder_citations( $bad )->get_error_data()['status'] );

		$dupe = self::request( 'PUT', 'ieee-block', array( 'ids' => array( 'i-two', 'i-two' ) ) );
		$this->assertSame( 400, bibliography_builder_rest_reorder_citations( $dupe )->get_error_data()['status'] );

		$alpha = self::request( 'PUT', 'notes-block', array( 'ids' => array( 'c-turing', 'c-knuth' ) ) );
		$this->assertSame( 409, bibliography_builder_rest_reorder_citations( $alpha )->get_error_data()['status'] );
	}

	public function test_unknown_refs_and_malformed_posts_are_refused() {
		$this->assertSame( 404, bibliography_builder_rest_add_citations( self::request( 'POST', 'no-such-block', array( 'items' => array( array( 'type' => 'book', 'title' => 'x' ) ) ) ) )->get_error_data()['status'] );
		$this->assertSame( 404, bibliography_builder_rest_add_citations( self::request( 'POST', 5, array( 'items' => array( array( 'type' => 'book', 'title' => 'x' ) ) ) ) )->get_error_data()['status'] );

		bibliography_builder_test_set_post( self::POST_ID, 'publish', $this->content . '<!-- wp:bibliography-builder/bibliography {"bibliographyId":"open"} --><section>' );
		$this->assertSame( 409, bibliography_builder_rest_add_citations( self::request( 'POST', 0, array( 'items' => array( array( 'type' => 'book', 'title' => 'x' ) ) ) ) )->get_error_data()['status'] );
	}

	public function test_read_routes_carry_the_etag_only_when_writes_are_on() {
		$request = new WP_REST_Request( 'GET', '/bibliography/v1/posts/' . self::POST_ID . '/bibliographies' );
		$request->set_query_params(
			array(
				'post_id' => self::POST_ID,
				'index'   => 0,
				'id'      => null,
			)
		);

		$this->assertArrayNotHasKey( 'ETag', bibliography_builder_rest_get_bibliographies( $request )->get_headers() );

		add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
		$etag = bibliography_builder_post_etag( get_post( self::POST_ID ) );

		$this->assertSame( $etag, bibliography_builder_rest_get_bibliographies( $request )->get_headers()['ETag'] );
		$this->assertSame( $etag, bibliography_builder_rest_get_bibliography( $request )->get_headers()['ETag'] );
	}

	public function test_a_failed_save_is_reported() {
		$GLOBALS['bibliography_builder_test_update_error'] = new WP_Error( 'db_update_error', 'Could not update post in the database.', array( 'status' => 500 ) );

		$result = bibliography_builder_rest_add_citations(
			self::commit( self::request( 'POST', 0, array( 'items' => array( array( 'type' => 'book', 'title' => 'x' ) ) ) ) )
		);

		$this->assertSame( 'db_update_error', $result->get_error_code() );
		$this->assertSame( $this->content, get_post( self::POST_ID )->post_content );
	}
}
