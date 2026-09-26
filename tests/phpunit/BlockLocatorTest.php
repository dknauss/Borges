<?php
/**
 * The byte-range locator and splicer behind the Phase 05 write routes,
 * checked against WordPress core's real block parser.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class BlockLocatorTest extends TestCase {

	private static function real_parse( $content ) {
		return ( new WP_Block_Parser() )->parse( $content );
	}

	private static function bib( $attrs, $inner = '' ) {
		return bibliography_builder_serialize_bibliography_block( $attrs, $inner );
	}

	/**
	 * A post with freeform text, multibyte characters, a nested bibliography,
	 * an empty (self-closing) one, and attribute strings that look like
	 * delimiters.
	 */
	private static function sample_post() {
		return "<!-- wp:paragraph -->\n<p>Zoë’s notes — “quoted” ✓</p>\n<!-- /wp:paragraph -->\n\n"
			. self::bib(
				array(
					'bibliographyId' => 'first-block',
					'headingText'    => 'Tricky } --> {"x"} <!-- wp:fake -->',
					'citations'      => array(
						array(
							'id'  => 'a1',
							'csl' => array(
								'type'  => 'book',
								'title' => 'Alpha',
							),
						),
					),
				),
				'<section class="wp-block-bibliography-builder-bibliography"><ol><li>Alpha</li></ol></section>'
			)
			. "\n\n<!-- wp:group -->\n<div class=\"wp-block-group\">"
			. self::bib( array( 'bibliographyId' => 'nested-block' ), '' )
			. "</div>\n<!-- /wp:group -->\n\nloose freeform text\n\n"
			. self::bib(
				array(
					'bibliographyId' => 'last-block',
					'citationStyle'  => 'apa-7',
					'citations'      => array(
						array(
							'id'  => 'z9',
							'csl' => array(
								'type'  => 'book',
								'title' => 'Zulu',
							),
						),
					),
				),
				'<section class="wp-block-bibliography-builder-bibliography"><ol><li>Zulu</li></ol></section>'
			)
			. "\n";
	}

	public function test_indexes_and_attributes_match_the_real_parser() {
		$content = self::sample_post();
		$ranges  = bibliography_builder_locate_bibliography_blocks( $content );
		$records = bibliography_builder_collect_blocks( self::real_parse( $content ) );

		$this->assertIsArray( $ranges );
		$this->assertCount( 3, $ranges );
		$this->assertCount( 3, $records );

		foreach ( $records as $index => $record ) {
			$this->assertSame( $record['bibliographyId'], $ranges[ $index ]['attrs']['bibliographyId'] );
		}

		$this->assertSame( 'Tricky } --> {"x"} <!-- wp:fake -->', $ranges[0]['attrs']['headingText'] );
	}

	public function test_each_range_is_exactly_one_whole_block() {
		$content = self::sample_post();

		foreach ( bibliography_builder_locate_bibliography_blocks( $content ) as $range ) {
			$slice  = substr( $content, $range['start'], $range['end'] - $range['start'] );
			$blocks = self::real_parse( $slice );

			$this->assertStringStartsWith( '<!-- wp:bibliography-builder/bibliography ', $slice );
			$this->assertMatchesRegularExpression( '#(/-->|<!-- /wp:bibliography-builder/bibliography -->)$#', $slice );
			$this->assertCount( 1, $blocks );
			$this->assertSame( 'bibliography-builder/bibliography', $blocks[0]['blockName'] );
			$this->assertSame( $range['attrs']['bibliographyId'], $blocks[0]['attrs']['bibliographyId'] );
		}
	}

	public function test_content_without_bibliographies_has_no_ranges() {
		$this->assertSame( array(), bibliography_builder_locate_bibliography_blocks( "<!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph -->" ) );
		$this->assertSame( array(), bibliography_builder_locate_bibliography_blocks( '' ) );
	}

	public function test_malformed_structure_is_refused() {
		$stray    = "<p>x</p><!-- /wp:paragraph -->\n" . self::bib( array( 'bibliographyId' => 'b' ) );
		$crossed  = "<!-- wp:group --><!-- wp:bibliography-builder/bibliography --><p>x</p><!-- /wp:group --><!-- /wp:bibliography-builder/bibliography -->";
		$unclosed = "<!-- wp:bibliography-builder/bibliography {\"bibliographyId\":\"b\"} --><section></section>";

		foreach ( array( $stray, $crossed, $unclosed ) as $content ) {
			$result = bibliography_builder_locate_bibliography_blocks( $content );
			$this->assertInstanceOf( WP_Error::class, $result );
			$this->assertSame( 'bibliography_builder_block_structure', $result->get_error_code() );
		}
	}

	public function test_splice_replaces_only_the_target_block() {
		$content     = self::sample_post();
		$ranges      = bibliography_builder_locate_bibliography_blocks( $content );
		$replacement = self::bib(
			array(
				'bibliographyId' => 'nested-block',
				'headingText'    => 'Now with --> content',
				'citations'      => array(
					array(
						'id'  => 'n1',
						'csl' => array(
							'type'  => 'book',
							'title' => 'New',
						),
					),
				),
			),
			'<section class="wp-block-bibliography-builder-bibliography"><ol><li>New</li></ol></section>'
		);

		$updated = bibliography_builder_splice_bibliography_block( $content, 1, $replacement );

		$this->assertIsString( $updated );
		$this->assertSame( substr( $content, 0, $ranges[1]['start'] ), substr( $updated, 0, $ranges[1]['start'] ) );
		$this->assertSame( substr( $content, $ranges[1]['end'] ), substr( $updated, $ranges[1]['start'] + strlen( $replacement ) ) );

		$records = bibliography_builder_collect_blocks( self::real_parse( $updated ) );
		$this->assertSame( array( 'first-block', 'nested-block', 'last-block' ), array_column( $records, 'bibliographyId' ) );
		$this->assertSame( 'Now with --> content', $records[1]['headingText'] );
		$this->assertSame( 'New', $records[1]['citations'][0]['csl']['title'] );

		$before = bibliography_builder_collect_blocks( self::real_parse( $content ) );
		$this->assertSame( $before[0], $records[0] );
		$this->assertSame( $before[2], $records[2] );
	}

	public function test_splice_can_empty_and_refill_a_block() {
		$content = self::sample_post();
		$emptied = bibliography_builder_splice_bibliography_block( $content, 2, self::bib( array( 'bibliographyId' => 'last-block' ), '' ) );

		$this->assertIsString( $emptied );
		$this->assertStringContainsString( '<!-- wp:bibliography-builder/bibliography {"bibliographyId":"last-block"} /-->', $emptied );
		$this->assertCount( 3, bibliography_builder_locate_bibliography_blocks( $emptied ) );
	}

	public function test_splice_refuses_a_replacement_that_changes_the_structure() {
		$content = self::sample_post();
		$two     = self::bib( array( 'bibliographyId' => 'x' ) ) . self::bib( array( 'bibliographyId' => 'y' ) );
		$broken  = '<!-- wp:bibliography-builder/bibliography {"bibliographyId":"x"} --><section>';

		foreach ( array( $two, $broken, '' ) as $replacement ) {
			$result = bibliography_builder_splice_bibliography_block( $content, 0, $replacement );
			$this->assertInstanceOf( WP_Error::class, $result );
		}
	}

	public function test_splice_reports_a_missing_block() {
		$result = bibliography_builder_splice_bibliography_block( self::sample_post(), 7, self::bib( array() ) );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_bibliography_not_found', $result->get_error_code() );
	}

	public function test_serialized_attributes_round_trip_through_the_real_parser() {
		$attrs = array(
			'bibliographyId' => 'round-trip',
			'headingText'    => 'A & B < C > D -- "E" \\ F',
			'outputCoins'    => true,
		);
		$block = self::real_parse( self::bib( $attrs, '<section></section>' ) );

		$this->assertSame( $attrs, $block[0]['attrs'] );
		$this->assertSame( '<!-- wp:bibliography-builder/bibliography /-->', self::bib( array() ) );
	}
}
