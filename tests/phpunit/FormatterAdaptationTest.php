<?php
/**
 * The formatter's workarounds for citeproc-php 2.7 behavior (see
 * docs/csl-styles.md): input adaptation before rendering and text cleanup
 * after.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class FormatterAdaptationTest extends TestCase {

	public function test_literal_names_become_family_only_names() {
		$item = bibliography_builder_prepare_csl_for_formatter(
			array(
				'author' => array(
					array( 'literal' => ' Open Research Alliance ' ),
					array(
						'family' => 'Green',
						'given'  => 'Samuel',
					),
				),
				'editor' => array( array( 'literal' => 'Board' ) ),
			)
		);

		$this->assertSame( array( 'family' => 'Open Research Alliance' ), $item['author'][0] );
		$this->assertSame(
			array(
				'family' => 'Green',
				'given'  => 'Samuel',
			),
			$item['author'][1]
		);
		$this->assertSame( array( 'family' => 'Board' ), $item['editor'][0] );
	}

	public function test_blank_literal_names_are_left_alone() {
		$item = bibliography_builder_prepare_csl_for_formatter(
			array( 'author' => array( array( 'literal' => '  ' ) ) )
		);

		$this->assertSame( array( array( 'literal' => '  ' ) ), $item['author'] );
	}

	public function test_page_first_is_derived_from_the_page_range() {
		$this->assertSame( '97', bibliography_builder_prepare_csl_for_formatter( array( 'page' => '97-111' ) )['page-first'] );
		$this->assertSame( '301', bibliography_builder_prepare_csl_for_formatter( array( 'page' => "301\u{2013}322" ) )['page-first'] );
		$this->assertSame( 'e1234', bibliography_builder_prepare_csl_for_formatter( array( 'page' => 'e1234' ) )['page-first'] );
		$this->assertSame(
			'5',
			bibliography_builder_prepare_csl_for_formatter(
				array(
					'page'       => '97-111',
					'page-first' => '5',
				)
			)['page-first']
		);
		$this->assertArrayNotHasKey( 'page-first', bibliography_builder_prepare_csl_for_formatter( array( 'title' => 'x' ) ) );
	}

	public function test_space_before_a_label_comma_is_removed() {
		$style = array( 'family' => 'notes' );

		$this->assertSame(
			'Okafor, Chidi, and Anna Lindqvist, eds.',
			bibliography_builder_normalize_formatted_text( 'Okafor, Chidi, and Anna Lindqvist , eds.', $style )
		);
	}

	public function test_hyphenated_given_names_are_fully_initialized() {
		$style = array( 'family' => 'author-date' );

		$this->assertSame( 'Kim, J.-W., Lopez, A.', bibliography_builder_normalize_formatted_text( 'Kim, J.- woo, Lopez, A.', $style ) );
		$this->assertSame( 'Kim J-W, Lopez A', bibliography_builder_normalize_formatted_text( 'Kim J- woo, Lopez A', $style ) );
		$this->assertSame( 'Jean-Paul Sartre', bibliography_builder_normalize_formatted_text( 'Jean-Paul Sartre', $style ) );
	}

	public function test_american_styles_move_commas_and_periods_inside_quotes() {
		$us = array(
			'family' => 'numeric',
			'locale' => 'en-US',
		);
		$gb = array(
			'family' => 'notes',
			'locale' => 'en-GB',
		);

		$this->assertSame( "S. Green, \u{201C}Title,\u{201D} Journal.", bibliography_builder_normalize_formatted_text( "S. Green, \u{201C}Title\u{201D}, Journal.", $us ) );
		$this->assertSame( "\u{2018}Title\u{2019}, Journal", bibliography_builder_normalize_formatted_text( "\u{2018}Title\u{2019}, Journal", $gb ) );
	}

	public function test_each_entry_is_rendered_on_its_own() {
		if ( ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) || ! class_exists( 'DOMDocument' ) ) {
			$this->markTestSkipped( 'citeproc-php and DOM are required.' );
		}

		$many  = array();
		$names = array( 'Ann', 'Bea', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal', 'Ida', 'Jay', 'Kit', 'Lee' );
		foreach ( $names as $given ) {
			$many[] = array(
				'family' => 'Author',
				'given'  => $given,
			);
		}

		$formatted = bibliography_builder_format_csl_items(
			array(
				array(
					'type'   => 'book',
					'title'  => 'First',
					'author' => $many,
				),
				array(
					'type'   => 'book',
					'title'  => 'Second',
					'author' => array(
						array(
							'family' => 'Weber',
							'given'  => 'Jonas',
						),
						array(
							'family' => 'Xu',
							'given'  => 'Li',
						),
					),
				),
			),
			'chicago-notes-bibliography'
		);

		// An "et al." entry must not strip the "and" from the entries after it.
		$this->assertStringContainsString( 'et al.', $formatted[0] );
		$this->assertStringStartsWith( 'Weber, Jonas, and Li Xu.', $formatted[1] );
	}
}
