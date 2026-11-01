<?php
/**
 * Write routes keep year suffixes (2020a, 2020b) current.
 *
 * Adding, editing, or removing one entry can move its siblings' letters, so
 * the routes refresh every entry in a touched same-author, same-year group
 * and leave all other entries' stored text alone. See
 * bibliography_builder_write_refresh_year_suffixes().
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class WriteRoutesYearSuffixTest extends TestCase {

	const POST_ID = 43;
	const USER_ID = 7;

	protected function setUp(): void {
		bibliography_builder_test_reset_state();

		if ( ! bibliography_builder_can_render_save_markup() || ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) ) {
			$this->markTestSkipped( 'intl and citeproc-php are required.' );
		}

		$content = self::block(
			array(
				'bibliographyId' => 'apa-block',
				'citationStyle'  => 'apa-7',
				'citations'      => array(
					self::citation( 'alpha', 'Jones', 'Alpha study', 2020 ),
					self::citation( 'beta', 'Jones', 'Beta study', 2020 ),
					self::citation( 'smith', 'Smith', 'Gamma study', 2019 ),
				),
			)
		)
			. "\n\n"
			. self::block(
				array(
					'bibliographyId' => 'mla-block',
					'citationStyle'  => 'mla-9',
					'citations'      => array(
						self::citation( 'mla-alpha', 'Jones', 'Alpha study', 2020 ),
					),
				)
			)
			. "\n";

		bibliography_builder_test_set_post( self::POST_ID, 'publish', $content );
		bibliography_builder_test_set_parsed_blocks( $content, ( new WP_Block_Parser() )->parse( $content ) );
		bibliography_builder_test_set_current_user( self::USER_ID );
		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_post', self::POST_ID );
	}

	/**
	 * A stored citation whose text is a marker, so a test can see whether a
	 * route reformatted it.
	 *
	 * @param string $id     Citation ID.
	 * @param string $family Author family name.
	 * @param string $title  Title.
	 * @param int    $year   Year.
	 * @return array
	 */
	private static function citation( $id, $family, $title, $year ) {
		return array(
			'id'            => $id,
			'csl'           => self::csl( $family, $title, $year ),
			'formattedText' => 'STORED ' . $id,
		);
	}

	/**
	 * A CSL book by one author.
	 *
	 * @param string $family Author family name.
	 * @param string $title  Title.
	 * @param int    $year   Year.
	 * @return array
	 */
	private static function csl( $family, $title, $year ) {
		return array(
			'type'   => 'book',
			'title'  => $title,
			'author' => array(
				array(
					'family' => $family,
					'given'  => 'Taylor',
				),
			),
			'issued' => array( 'date-parts' => array( array( $year ) ) ),
		);
	}

	private static function block( $attrs ) {
		$html = bibliography_builder_render_save_markup( bibliography_builder_decode_save_attributes( wp_json_encode( $attrs ) ) );

		return bibliography_builder_serialize_bibliography_block( $attrs, $html );
	}

	private static function request( $method, $ref, $body = array() ) {
		$request = new WP_REST_Request( $method, '/bibliography/v1/posts/' . self::POST_ID . '/bibliographies/' . $ref . '/citations' );
		$request->set_query_params(
			array(
				'post_id' => self::POST_ID,
				'ref'     => (string) $ref,
				'dry_run' => false,
			)
		);
		$request->set_header( 'If-Match', bibliography_builder_post_etag( get_post( self::POST_ID ) ) );

		if ( array() !== $body ) {
			$request->set_body_params( $body );
		}

		return $request;
	}

	/**
	 * Saved citations' text by ID, after checking the saved markup is valid.
	 *
	 * @param int $index Bibliography block index.
	 * @return array<string, string>
	 */
	private function saved_texts( $index = 0 ) {
		$content = get_post( self::POST_ID )->post_content;

		foreach ( ( new WP_Block_Parser() )->parse( $content ) as $block ) {
			if ( 'bibliography-builder/bibliography' === $block['blockName'] ) {
				$attrs = bibliography_builder_decode_save_attributes( wp_json_encode( $block['attrs'] ) );
				$this->assertSame( bibliography_builder_render_save_markup( $attrs ), $block['innerHTML'] );
			}
		}

		$attrs = bibliography_builder_write_to_arrays( bibliography_builder_locate_bibliography_blocks( $content )[ $index ]['attrs'] );
		$texts = array();

		foreach ( $attrs['citations'] as $citation ) {
			$texts[ $citation['id'] ] = wp_strip_all_tags( $citation['formattedText'] );
		}

		return $texts;
	}

	public function test_adding_a_sibling_reletters_the_group_and_leaves_others_alone() {
		$data = bibliography_builder_rest_add_citations(
			self::request( 'POST', 'apa-block', array( 'items' => array( self::csl( 'Jones', 'An aardvark study', 2020 ) ) ) )
		)->get_data();
		$new  = $data['changes']['added'][0];

		$this->assertSame(
			array(
				$new    => 'Jones, T. (2020a). An aardvark study.',
				'alpha' => 'Jones, T. (2020b). Alpha study.',
				'beta'  => 'Jones, T. (2020c). Beta study.',
				'smith' => 'STORED smith',
			),
			$this->saved_texts()
		);
	}

	public function test_removing_a_sibling_drops_the_last_letter() {
		$request                = self::request( 'DELETE', 'apa-block' );
		$request['citation_id'] = 'beta';
		bibliography_builder_rest_delete_citation( $request );

		$this->assertSame(
			array(
				'alpha' => 'Jones, T. (2020). Alpha study.',
				'smith' => 'STORED smith',
			),
			$this->saved_texts()
		);
	}

	public function test_editing_the_year_refreshes_the_old_and_the_new_group() {
		$request                = self::request( 'PATCH', 'apa-block', array( 'issued' => array( 'date-parts' => array( array( 2019 ) ) ) ) );
		$request['citation_id'] = 'beta';
		bibliography_builder_rest_update_citation( $request );

		$this->assertSame(
			array(
				'beta'  => 'Jones, T. (2019). Beta study.',
				'alpha' => 'Jones, T. (2020). Alpha study.',
				'smith' => 'STORED smith',
			),
			$this->saved_texts()
		);
	}

	public function test_an_unrelated_addition_reformats_nothing_else() {
		$data = bibliography_builder_rest_add_citations(
			self::request( 'POST', 'apa-block', array( 'items' => array( self::csl( 'Brown', 'Delta study', 2018 ) ) ) )
		)->get_data();
		$texts = $this->saved_texts();

		$this->assertSame( 'STORED alpha', $texts['alpha'] );
		$this->assertSame( 'STORED beta', $texts['beta'] );
		$this->assertSame( 'Brown, T. (2018). Delta study.', $texts[ $data['changes']['added'][0] ] );
	}

	public function test_styles_without_year_suffixes_reformat_only_the_new_entry() {
		$data  = bibliography_builder_rest_add_citations(
			self::request( 'POST', 'mla-block', array( 'items' => array( self::csl( 'Jones', 'Beta study', 2020 ) ) ) )
		)->get_data();
		$texts = $this->saved_texts( 1 );

		$this->assertSame( 'STORED mla-alpha', $texts['mla-alpha'] );
		$this->assertStringNotContainsString( '2020a', $texts[ $data['changes']['added'][0] ] );
		$this->assertStringNotContainsString( '2020b', $texts[ $data['changes']['added'][0] ] );
	}
}
