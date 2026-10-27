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

	public function test_particles_split_only_for_a_display_demoting_style() {
		$item = array(
			'author' => array(
				array(
					'family' => 'van Duijnhoven',
					'given'  => 'Elza',
				),
				array(
					'family' => 'Van Buren',
					'given'  => 'Martin',
				),
				array(
					'family'                => 'Neumann',
					'non-dropping-particle' => 'von',
				),
			),
		);

		$this->assertSame( $item, bibliography_builder_prepare_csl_for_formatter( $item ) );

		$prepared = bibliography_builder_prepare_csl_for_formatter( $item, true );

		$this->assertSame(
			array(
				'family'                => 'Duijnhoven',
				'given'                 => 'Elza',
				'non-dropping-particle' => 'van',
			),
			$prepared['author'][0]
		);
		$this->assertSame( $item['author'][1], $prepared['author'][1] );
		$this->assertSame( $item['author'][2], $prepared['author'][2] );
	}

	public function test_split_name_particle_matches_the_js_rules() {
		$this->assertSame(
			array(
				'particle' => 'van der',
				'family'   => 'Waals',
			),
			bibliography_builder_split_name_particle( 'van der Waals' )
		);
		$this->assertSame(
			array(
				'particle' => 'd’',
				'family'   => 'Alembert',
			),
			bibliography_builder_split_name_particle( 'd’Alembert' )
		);

		foreach ( array( 'Van Buren', 'van der', 'van gogh', "O'Brien", 'Duijnhoven', 42 ) as $family ) {
			$this->assertNull( bibliography_builder_split_name_particle( $family ), (string) $family );
		}
	}

	public function test_sort_family_follows_the_style_demote_setting() {
		$this->assertSame( 'Duijnhoven', bibliography_builder_sort_family( array( 'family' => 'van Duijnhoven' ), true ) );
		$this->assertSame( 'van Duijnhoven', bibliography_builder_sort_family( array( 'family' => 'van Duijnhoven' ), false ) );
		$this->assertSame( "d'Alembert", bibliography_builder_sort_family( array( 'family' => "d'Alembert" ), false ) );
		$this->assertSame(
			'von Neumann',
			bibliography_builder_sort_family(
				array(
					'family'                => 'Neumann',
					'non-dropping-particle' => 'von',
				),
				false
			)
		);
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

	public function test_early_dates_become_year_only_literals() {
		$this->assertSame( '334 BC', bibliography_builder_early_date_literal( array( 'date-parts' => array( array( -334 ) ) ), 'en-US' ) );
		$this->assertSame( '334 a.C.', bibliography_builder_early_date_literal( array( 'date-parts' => array( array( -334, 5, 1 ) ) ), 'pt-BR' ) );
		$this->assertSame( '731', bibliography_builder_early_date_literal( array( 'date-parts' => array( array( 731 ) ) ), 'en-US' ) );
		$this->assertSame(
			"100\u{2013}44 BC",
			bibliography_builder_early_date_literal( array( 'date-parts' => array( array( '-100', 7, 12 ), array( '-44', 3, 15 ) ) ), 'en-GB' )
		);
		$this->assertSame(
			"4 BC\u{2013}30",
			bibliography_builder_early_date_literal( array( 'date-parts' => array( array( -4 ), array( 30 ) ) ), 'en-US' )
		);
		$this->assertSame(
			"950\u{2013}1050",
			bibliography_builder_early_date_literal( array( 'date-parts' => array( array( 950 ), array( 1050 ) ) ), 'en-US' )
		);
		$this->assertSame( '44 BC', bibliography_builder_early_date_literal( array( 'date-parts' => array( array( -44 ), array( -44 ) ) ), 'en-US' ) );

		// Dates citeproc-php renders, and dates without parts, are left alone.
		$this->assertNull( bibliography_builder_early_date_literal( array( 'date-parts' => array( array( 1000 ) ) ), 'en-US' ) );
		$this->assertNull( bibliography_builder_early_date_literal( array( 'literal' => 'Spring 2026' ), 'en-US' ) );
		$this->assertNull( bibliography_builder_early_date_literal( 'not a date', 'en-US' ) );
	}

	public function test_prepare_replaces_only_early_dates() {
		$item = bibliography_builder_prepare_csl_for_formatter(
			array(
				'issued'        => array( 'date-parts' => array( array( -334 ) ) ),
				'original-date' => array( 'date-parts' => array( array( '-1' ) ) ),
				'accessed'      => array( 'date-parts' => array( array( 2026, 6, 20 ) ) ),
			),
			false,
			'en-US'
		);

		$this->assertSame( array( 'literal' => '334 BC' ), $item['issued'] );
		$this->assertSame( array( 'literal' => '1 BC' ), $item['original-date'] );
		$this->assertSame( array( 'date-parts' => array( array( 2026, 6, 20 ) ) ), $item['accessed'] );
	}

	/**
	 * Every bundled style prints a BC year and an AD year below 1000, which
	 * citeproc-php alone renders as nothing.
	 */
	public function test_every_style_renders_early_years() {
		$styles = json_decode( (string) file_get_contents( dirname( __DIR__, 2 ) . '/includes/styles.json' ), true );

		foreach ( array_keys( $styles['styles'] ) as $style_key ) {
			$bc        = 'abnt' === $style_key ? 'a.C.' : 'BC';
			$formatted = bibliography_builder_format_csl_items(
				array(
					array(
						'type'      => 'book',
						'title'     => 'Politics',
						'author'    => array( array( 'family' => 'Aristotle' ) ),
						'publisher' => 'Oxford University Press',
						'issued'    => array( 'date-parts' => array( array( -334 ) ) ),
					),
					array(
						'type'   => 'book',
						'title'  => 'Ecclesiastical History of the English People',
						'author' => array( array( 'family' => 'Bede' ) ),
						'issued' => array( 'date-parts' => array( array( 731 ) ) ),
					),
				),
				$style_key
			);

			$this->assertIsArray( $formatted, $style_key );
			$this->assertStringContainsString( '334 ' . $bc, wp_strip_all_tags( $formatted[0] ), $style_key );
			$this->assertStringContainsString( '731', wp_strip_all_tags( $formatted[1] ), $style_key );
			$this->assertStringNotContainsString( "\u{2013}", wp_strip_all_tags( $formatted[1] ), $style_key );
		}
	}

	/**
	 * Better CSL JSON's BC test items, from the reference-manager corpus,
	 * pass the PHP sanitizer and format with their years.
	 */
	public function test_corpus_bc_items_sanitize_and_format() {
		$path  = dirname( __DIR__, 2 ) . '/src/lib/__fixtures__/reference-manager-exports/public/better-bibtex/edtf-dates-811.csl.json';
		$items = array();

		foreach ( json_decode( (string) file_get_contents( $path ), true ) as $item ) {
			if ( in_array( $item['id'], array( 't5', 't6' ), true ) ) {
				$sanitized = bibliography_builder_validate_and_sanitize_csl_item( $item );
				$this->assertIsArray( $sanitized, $item['id'] );
				$items[] = $sanitized;
			}
		}

		$this->assertSame( array( array( -334 ) ), $items[0]['issued']['date-parts'] );
		$this->assertSame( array( array( -100, 7, 12 ), array( -44, 3, 15 ) ), $items[1]['issued']['date-parts'] );

		$formatted = array_map( 'wp_strip_all_tags', bibliography_builder_format_csl_items( $items, 'apa-7' ) );

		$this->assertStringContainsString( '(334 BC)', $formatted[0] );
		$this->assertStringContainsString( "(100\u{2013}44 BC)", $formatted[1] );
	}
}
