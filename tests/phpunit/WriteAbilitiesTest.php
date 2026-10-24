<?php
/**
 * Bibliography write abilities (Phase 05, M5 / Tier 5).
 *
 * The abilities call the write routes' own callbacks, so these tests check
 * the wiring (input to request, response to output, the opt-in, permissions,
 * and the dry-run and ETag rules) rather than re-testing each mutation;
 * WriteRoutesTest covers those.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class WriteAbilitiesTest extends TestCase {

	const POST_ID = 42;
	const USER_ID = 7;

	private $content;

	protected function setUp(): void {
		bibliography_builder_test_reset_state();

		if ( ! bibliography_builder_can_render_save_markup() || ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) ) {
			$this->markTestSkipped( 'intl and citeproc-php are required.' );
		}

		$this->content = "<!-- wp:paragraph -->\n<p>Intro</p>\n<!-- /wp:paragraph -->\n\n"
			. self::block(
				array(
					'bibliographyId' => 'notes-block',
					'citationStyle'  => 'chicago-notes-bibliography',
					'citations'      => array(
						self::citation( 'c-knuth', 'Literate Programming', 'Knuth', 'Donald E.', 1984 ),
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

	private static function citation( $id, $title, $family, $given, $year ) {
		return array(
			'id'            => $id,
			'csl'           => array(
				'type'   => 'article-journal',
				'title'  => $title,
				'author' => array(
					array(
						'family' => $family,
						'given'  => $given,
					),
				),
				'issued' => array( 'date-parts' => array( array( $year ) ) ),
			),
			'formattedText' => $family . '. ' . $title . '.',
		);
	}

	private static function block( $attrs ) {
		$html = bibliography_builder_render_save_markup( bibliography_builder_decode_save_attributes( wp_json_encode( $attrs ) ) );

		return bibliography_builder_serialize_bibliography_block( $attrs, $html );
	}

	private static function etag() {
		return bibliography_builder_post_etag( get_post( self::POST_ID ) );
	}

	private static function citation_ids( $ref ) {
		$blocks = bibliography_builder_locate_bibliography_blocks( get_post( self::POST_ID )->post_content );
		$attrs  = bibliography_builder_write_to_arrays( $blocks[ $ref ]['attrs'] );

		return array_column( $attrs['citations'], 'id' );
	}

	private static function enable_and_register() {
		add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
		bibliography_builder_register_write_abilities();
	}

	public function test_abilities_are_off_unless_write_routes_are_enabled() {
		bibliography_builder_register_write_abilities();
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_abilities'] );

		self::enable_and_register();

		$this->assertSame(
			array(
				'borges/add-citations',
				'borges/update-citation',
				'borges/delete-citation',
				'borges/reorder-citations',
				'borges/update-bibliography-settings',
				'borges/reformat-bibliography',
				'borges/bulk-reformat',
				'borges/bulk-deduplicate',
			),
			array_keys( $GLOBALS['bibliography_builder_test_abilities'] )
		);

		// The bulk abilities take a list of posts; BulkRoutesTest and
		// BulkDeduplicateTest cover them.
		unset(
			$GLOBALS['bibliography_builder_test_abilities']['borges/bulk-reformat'],
			$GLOBALS['bibliography_builder_test_abilities']['borges/bulk-deduplicate']
		);

		foreach ( $GLOBALS['bibliography_builder_test_abilities'] as $name => $args ) {
			$this->assertSame( 'bibliography', $args['category'], $name );
			$this->assertFalse( $args['meta']['annotations']['readonly'], $name );
			$this->assertSame( 'borges/delete-citation' === $name, $args['meta']['annotations']['destructive'], $name );
			$this->assertSame( 'bibliography_builder_ability_can_write_post', $args['permission_callback'], $name );
			$this->assertTrue( is_callable( $args['execute_callback'] ), $name );
			$this->assertFalse( $args['input_schema']['additionalProperties'], $name );
			$this->assertSame( 'post_id', $args['input_schema']['required'][0], $name );
			$this->assertTrue( $args['input_schema']['properties']['dry_run']['default'], $name );
		}
	}

	public function test_permission_needs_edit_post() {
		$this->assertTrue( bibliography_builder_ability_can_write_post( array( 'post_id' => self::POST_ID ) ) );

		bibliography_builder_test_set_current_user( 99 );
		$this->assertSame(
			'bibliography_builder_write_forbidden',
			bibliography_builder_ability_can_write_post( array( 'post_id' => self::POST_ID ) )->get_error_code()
		);
		$this->assertSame(
			'bibliography_builder_post_not_found',
			bibliography_builder_ability_can_write_post( array( 'post_id' => 404 ) )->get_error_code()
		);
	}

	public function test_add_previews_by_default_and_saves_with_a_current_etag() {
		$input   = array(
			'post_id'         => self::POST_ID,
			'bibliography_id' => 'notes-block',
			'items'           => array( self::citation( 'x', 'Beta Study', 'Beta', 'Bea', 2010 )['csl'] ),
		);
		$preview = bibliography_builder_ability_add_citations( $input );

		$this->assertTrue( $preview['dryRun'] );
		$this->assertSame( 3, $preview['bibliography']['entryCount'] );
		$this->assertSame( self::etag(), $preview['etag'] );
		$this->assertSame( $this->content, get_post( self::POST_ID )->post_content );

		$input['dry_run'] = false;
		$this->assertSame( 428, bibliography_builder_ability_add_citations( $input )->get_error_data()['status'] );

		$input['etag'] = '"stale"';
		$this->assertSame( 412, bibliography_builder_ability_add_citations( $input )->get_error_data()['status'] );
		$this->assertSame( $this->content, get_post( self::POST_ID )->post_content );

		$input['etag'] = $preview['etag'];
		$saved         = bibliography_builder_ability_add_citations( $input );

		$this->assertFalse( $saved['dryRun'] );
		$this->assertSame( self::etag(), $saved['etag'] );
		$this->assertCount( 3, self::citation_ids( 0 ) );
		$this->assertSame( array( 'i-one', 'i-two' ), self::citation_ids( 1 ) );
	}

	public function test_output_matches_the_route_response() {
		$items   = array( self::citation( 'x', 'Beta Study', 'Beta', 'Bea', 2010 )['csl'] );
		$request = new WP_REST_Request( 'POST', '/bibliography/v1/posts/' . self::POST_ID . '/bibliographies/0/citations' );
		$request->set_query_params(
			array(
				'post_id' => self::POST_ID,
				'ref'     => '0',
				'dry_run' => true,
			)
		);
		$request->set_body_params( array( 'items' => $items ) );

		$route   = bibliography_builder_rest_add_citations( $request )->get_data();
		$ability = bibliography_builder_ability_add_citations(
			array(
				'post_id' => self::POST_ID,
				'items'   => $items,
			)
		);

		// Added IDs are random; everything else must agree.
		unset( $route['changes']['added'], $ability['changes']['added'], $route['bibliography'], $ability['bibliography'] );
		$this->assertSame( $route, $ability );
	}

	public function test_update_and_delete_address_a_citation() {
		$updated = bibliography_builder_ability_update_citation(
			array(
				'post_id'         => self::POST_ID,
				'bibliography_id' => 'notes-block',
				'citation_id'     => 'c-turing',
				'fields'          => array( 'title' => 'On Computable Numbers' ),
				'dry_run'         => false,
				'etag'            => self::etag(),
			)
		);

		$this->assertSame( array( 'c-turing' ), $updated['changes']['updated'] );
		$this->assertStringContainsString( 'On Computable Numbers', get_post( self::POST_ID )->post_content );

		$locked = bibliography_builder_ability_update_citation(
			array(
				'post_id'     => self::POST_ID,
				'citation_id' => 'c-turing',
				'fields'      => array( 'type' => 'book' ),
			)
		);
		$this->assertSame( 'bibliography_builder_locked_field', $locked->get_error_code() );

		$deleted = bibliography_builder_ability_delete_citation(
			array(
				'post_id'     => self::POST_ID,
				'index'       => 0,
				'citation_id' => 'c-knuth',
				'dry_run'     => false,
				'etag'        => self::etag(),
			)
		);

		$this->assertSame( 'c-knuth', $deleted['changes']['removed']['id'] );
		$this->assertSame( array( 'c-turing' ), self::citation_ids( 0 ) );

		$missing = bibliography_builder_ability_delete_citation(
			array(
				'post_id'     => self::POST_ID,
				'citation_id' => 'c-knuth',
			)
		);
		$this->assertSame( 404, $missing->get_error_data()['status'] );
	}

	public function test_reorder_settings_and_reformat() {
		$reordered = bibliography_builder_ability_reorder_citations(
			array(
				'post_id'         => self::POST_ID,
				'bibliography_id' => 'ieee-block',
				'ids'             => array( 'i-two', 'i-one' ),
				'dry_run'         => false,
				'etag'            => self::etag(),
			)
		);
		$this->assertSame( array( 'i-two', 'i-one' ), $reordered['changes']['order'] );
		$this->assertSame( array( 'i-two', 'i-one' ), self::citation_ids( 1 ) );

		$automatic = bibliography_builder_ability_reorder_citations(
			array(
				'post_id' => self::POST_ID,
				'ids'     => array( 'c-turing', 'c-knuth' ),
			)
		);
		$this->assertSame( 409, $automatic->get_error_data()['status'] );

		$settings = bibliography_builder_ability_update_bibliography_settings(
			array(
				'post_id'  => self::POST_ID,
				'settings' => array( 'headingText' => 'Sources' ),
			)
		);
		$this->assertSame( array( 'headingText' ), $settings['changes']['updated'] );
		$this->assertTrue( $settings['dryRun'] );

		$style = bibliography_builder_ability_update_bibliography_settings(
			array(
				'post_id'  => self::POST_ID,
				'settings' => array( 'citationStyle' => 'apa-7' ),
			)
		);
		$this->assertSame( 'bibliography_builder_style_needs_reformat', $style->get_error_code() );

		$reformat = bibliography_builder_ability_reformat_bibliography(
			array(
				'post_id' => self::POST_ID,
				'style'   => 'apa-7',
			)
		);
		$this->assertSame(
			array(
				'from' => 'chicago-notes-bibliography',
				'to'   => 'apa-7',
			),
			$reformat['changes']['citationStyle']
		);
		$this->assertSame( self::etag(), $reformat['etag'] );
	}
}
