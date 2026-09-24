<?php

use PHPUnit\Framework\TestCase;

final class AbilitiesTest extends TestCase {
	private $published_post_id = 201;
	private $draft_post_id     = 202;

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();

		$block_content = '<!-- wp:bibliography-builder/bibliography {"abilities":1} /-->';

		bibliography_builder_test_set_post( $this->published_post_id, 'publish', $block_content );
		bibliography_builder_test_set_post( $this->draft_post_id, 'draft', $block_content );
		bibliography_builder_test_set_parsed_blocks(
			$block_content,
			array(
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array(
						'citationStyle' => 'apa-7',
						'headingText'   => 'Works Cited',
						'citations'     => array(
							array(
								'id'            => 'beta-1',
								'formattedText' => 'Beta, B. (2020). <em>Beta Book</em>.',
								'csl'           => array(
									'type'  => 'book',
									'title' => 'Beta Book',
								),
							),
						),
					),
				),
			)
		);

		bibliography_builder_register_ability_category();
		bibliography_builder_register_abilities();
	}

	private function ability( string $name ): array {
		$this->assertArrayHasKey( $name, $GLOBALS['bibliography_builder_test_abilities'] );

		return $GLOBALS['bibliography_builder_test_abilities'][ $name ];
	}

	public function test_registers_three_readonly_abilities_in_one_category(): void {
		$this->assertArrayHasKey( 'bibliography', $GLOBALS['bibliography_builder_test_ability_categories'] );
		$this->assertSame(
			array( 'borges/get-bibliographies', 'borges/export-bibliography', 'borges/validate-citations' ),
			array_keys( $GLOBALS['bibliography_builder_test_abilities'] )
		);

		foreach ( $GLOBALS['bibliography_builder_test_abilities'] as $name => $args ) {
			$this->assertSame( 'bibliography', $args['category'], $name );
			$this->assertNotSame( '', $args['label'], $name );
			$this->assertNotSame( '', $args['description'], $name );
			$this->assertTrue( is_callable( $args['execute_callback'] ), $name );
			$this->assertTrue( is_callable( $args['permission_callback'] ), $name );
			$this->assertTrue( $args['meta']['annotations']['readonly'], $name );
			$this->assertFalse( $args['meta']['annotations']['destructive'], $name );
			$this->assertTrue( $args['meta']['show_in_rest'], $name );
			$this->assertSame( 'object', $args['input_schema']['type'], $name );
			$this->assertFalse( $args['input_schema']['additionalProperties'], $name );
		}
	}

	public function test_joins_an_existing_category_instead_of_reregistering(): void {
		$GLOBALS['bibliography_builder_test_ability_categories'] = array(
			'bibliography' => array( 'label' => 'Registered elsewhere' ),
		);

		bibliography_builder_register_ability_category();

		$this->assertSame(
			'Registered elsewhere',
			$GLOBALS['bibliography_builder_test_ability_categories']['bibliography']['label']
		);
	}

	public function test_read_permission_mirrors_the_public_rest_route(): void {
		$can_read = $this->ability( 'borges/get-bibliographies' )['permission_callback'];

		$this->assertTrue( $can_read( array( 'post_id' => $this->published_post_id ) ) );

		$draft = $can_read( array( 'post_id' => $this->draft_post_id ) );
		$this->assertInstanceOf( WP_Error::class, $draft );
		$this->assertSame( 403, $draft->get_error_data()['status'] );

		bibliography_builder_test_grant_cap( 9, 'edit_post', $this->draft_post_id );
		bibliography_builder_test_set_current_user( 9 );
		$this->assertTrue( $can_read( array( 'post_id' => $this->draft_post_id ) ) );

		$missing = $can_read( array( 'post_id' => 999 ) );
		$this->assertInstanceOf( WP_Error::class, $missing );
		$this->assertSame( 404, $missing->get_error_data()['status'] );

		$this->assertInstanceOf( WP_Error::class, $can_read( null ) );
	}

	public function test_export_uses_the_same_read_permission(): void {
		$this->assertSame(
			'bibliography_builder_ability_can_read_post',
			$this->ability( 'borges/export-bibliography' )['permission_callback']
		);
	}

	public function test_get_bibliographies_returns_the_rest_collection_shape(): void {
		$execute = $this->ability( 'borges/get-bibliographies' )['execute_callback'];
		$result  = $execute( array( 'post_id' => $this->published_post_id ) );

		$this->assertSame( $this->published_post_id, $result['postId'] );
		$this->assertCount( 1, $result['bibliographies'] );
		$this->assertSame( 'apa-7', $result['bibliographies'][0]['citationStyle'] );
		$this->assertSame( 'Works Cited', $result['bibliographies'][0]['headingText'] );
		$this->assertSame( 1, $result['bibliographies'][0]['entryCount'] );
	}

	public function test_export_returns_csl_json_by_default_and_plain_text_on_request(): void {
		$execute = $this->ability( 'borges/export-bibliography' )['execute_callback'];

		$csl = $execute( array( 'post_id' => $this->published_post_id ) );
		$this->assertSame( 'csl-json', $csl['format'] );
		$this->assertSame( 0, $csl['index'] );
		$this->assertSame( 'Beta Book', $csl['content'][0]['title'] );

		$text = $execute(
			array(
				'post_id' => $this->published_post_id,
				'format'  => 'text',
			)
		);
		$this->assertSame( 'text', $text['format'] );
		$this->assertSame( "Beta, B. (2020). Beta Book.\n", $text['content'] );
	}

	public function test_export_reports_a_missing_block_index(): void {
		$execute = $this->ability( 'borges/export-bibliography' )['execute_callback'];
		$result  = $execute(
			array(
				'post_id' => $this->published_post_id,
				'index'   => 3,
			)
		);

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_not_found', $result->get_error_code() );
		$this->assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_validate_citations_reports_each_item_independently(): void {
		$execute = $this->ability( 'borges/validate-citations' )['execute_callback'];
		$result  = $execute(
			array(
				'items' => array(
					array(
						'type'  => 'book',
						'title' => '<script>x</script>Clean Title',
					),
					array( 'type' => 'not-a-csl-type' ),
					array(
						'type'  => 'article-journal',
						'title' => 'Second Valid',
					),
				),
			)
		);

		$this->assertFalse( $result['valid'] );
		$this->assertCount( 3, $result['results'] );

		$this->assertTrue( $result['results'][0]['valid'] );
		$this->assertNull( $result['results'][0]['error'] );
		$this->assertSame( 'Clean Title', $result['results'][0]['sanitized']['title'] );

		$this->assertFalse( $result['results'][1]['valid'] );
		$this->assertSame( 'Invalid CSL type.', $result['results'][1]['error'] );
		$this->assertNull( $result['results'][1]['sanitized'] );

		$this->assertTrue( $result['results'][2]['valid'] );
		$this->assertSame( 2, $result['results'][2]['index'] );
	}

	public function test_validate_citations_is_valid_when_every_item_passes(): void {
		$execute = $this->ability( 'borges/validate-citations' )['execute_callback'];
		$result  = $execute(
			array(
				'items' => array(
					array(
						'type'  => 'book',
						'title' => 'Only Item',
					),
				),
			)
		);

		$this->assertTrue( $result['valid'] );
	}

	public function test_validate_citations_requires_edit_posts_and_caps_batch_size(): void {
		$args = $this->ability( 'borges/validate-citations' );

		$this->assertInstanceOf( WP_Error::class, $args['permission_callback']() );

		bibliography_builder_test_grant_cap( 9, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 9 );
		$this->assertTrue( $args['permission_callback']() );

		$this->assertSame(
			BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS,
			$args['input_schema']['properties']['items']['maxItems']
		);
	}

	public function test_registration_hooks_are_added(): void {
		$hooks = array_column( $GLOBALS['bibliography_builder_test_added_actions'], 'hook_name' );

		$this->assertContains( 'wp_abilities_api_categories_init', $hooks );
		$this->assertContains( 'wp_abilities_api_init', $hooks );
	}
}
