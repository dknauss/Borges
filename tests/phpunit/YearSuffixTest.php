<?php
/**
 * Year suffixes for same-author, same-year works (2020a, 2020b).
 *
 * The formatter assigns CSL's `year-suffix` in the order save() lists the
 * entries, and the author-date styles flagged `yearSuffix` in styles.json
 * print it after the year. See bibliography_builder_assign_year_suffixes().
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class YearSuffixTest extends TestCase {

	/**
	 * A CSL book.
	 *
	 * @param string   $family Author family name.
	 * @param string   $title  Title.
	 * @param int|null $year   Year, or null for an undated work.
	 * @param string   $given  Author given name.
	 * @return array
	 */
	private static function book( $family, $title, $year, $given = 'Taylor' ) {
		$item = array(
			'type'   => 'book',
			'title'  => $title,
			'author' => array(
				array(
					'family' => $family,
					'given'  => $given,
				),
			),
		);

		if ( null !== $year ) {
			$item['issued'] = array( 'date-parts' => array( array( $year ) ) );
		}

		return $item;
	}

	/**
	 * Formatted plain text, in request order.
	 *
	 * @param array  $items CSL items.
	 * @param string $style Style key.
	 * @return string[]
	 */
	private static function text( $items, $style ) {
		$formatted = bibliography_builder_format_csl_items( $items, $style );

		return array_map( 'wp_strip_all_tags', is_array( $formatted ) ? $formatted : array() );
	}

	public function test_letters_run_a_to_z_then_double_letters() {
		$this->assertSame( 'a', bibliography_builder_year_suffix_letters( 0 ) );
		$this->assertSame( 'b', bibliography_builder_year_suffix_letters( 1 ) );
		$this->assertSame( 'z', bibliography_builder_year_suffix_letters( 25 ) );
		$this->assertSame( 'aa', bibliography_builder_year_suffix_letters( 26 ) );
		$this->assertSame( 'ab', bibliography_builder_year_suffix_letters( 27 ) );
		$this->assertSame( 'zz', bibliography_builder_year_suffix_letters( 701 ) );
		$this->assertSame( 'aaa', bibliography_builder_year_suffix_letters( 702 ) );
	}

	public function test_apa_letters_follow_the_saved_order_not_the_request_order() {
		$this->assertSame(
			array(
				'Jones, T. (2020b). Beta Study.',
				'Jones, T. (2020a). Alpha Study.',
			),
			self::text(
				array(
					self::book( 'Jones', 'Beta Study', 2020 ),
					self::book( 'Jones', 'Alpha Study', 2020 ),
				),
				'apa-7'
			)
		);
	}

	public function test_a_leading_article_is_skipped_as_the_sorter_skips_it() {
		$this->assertSame(
			array(
				'Jones, T. (2020b). Alpha Study.',
				'Jones, T. (2020a). An Aardvark Study.',
				'Jones, T. (2020c). The Zebra Study.',
			),
			self::text(
				array(
					self::book( 'Jones', 'Alpha Study', 2020 ),
					self::book( 'Jones', 'An Aardvark Study', 2020 ),
					self::book( 'Jones', 'The Zebra Study', 2020 ),
				),
				'apa-7'
			)
		);
	}

	public function test_only_same_authors_in_the_same_year_get_letters() {
		$this->assertSame(
			array(
				'Jones, T. (2020). Alpha Study.',
				'Jones, T. (2021). Beta Study.',
				'Jones, R. (2020). Gamma Study.',
				'Smith, T. (2020). Delta Study.',
			),
			self::text(
				array(
					self::book( 'Jones', 'Alpha Study', 2020 ),
					self::book( 'Jones', 'Beta Study', 2021 ),
					self::book( 'Jones', 'Gamma Study', 2020, 'Robin' ),
					self::book( 'Smith', 'Delta Study', 2020 ),
				),
				'apa-7'
			)
		);
	}

	public function test_a_shared_first_author_with_different_coauthors_gets_no_letter() {
		$with_coauthor             = self::book( 'Jones', 'Beta Study', 2020 );
		$with_coauthor['author'][] = array(
			'family' => 'Brown',
			'given'  => 'Sam',
		);

		$texts = self::text( array( self::book( 'Jones', 'Alpha Study', 2020 ), $with_coauthor ), 'apa-7' );

		$this->assertStringContainsString( '(2020).', $texts[0] );
		$this->assertStringContainsString( '(2020).', $texts[1] );
	}

	public function test_undated_works_get_no_letter() {
		$texts = self::text(
			array(
				self::book( 'Jones', 'Alpha Study', null ),
				self::book( 'Jones', 'Beta Study', null ),
			),
			'apa-7'
		);

		$this->assertSame( array( 'Jones, T. (n.d.). Alpha Study.', 'Jones, T. (n.d.). Beta Study.' ), $texts );
	}

	public function test_the_other_author_date_styles_print_the_letter_after_the_year() {
		$items = array(
			self::book( 'Jones', 'Beta Study', 2020 ),
			self::book( 'Jones', 'Alpha Study', 2020 ),
		);

		foreach ( array( 'chicago-author-date', 'harvard', 'abnt' ) as $style ) {
			$texts = self::text( $items, $style );

			$this->assertStringContainsString( '2020b', $texts[0], $style );
			$this->assertStringContainsString( '2020a', $texts[1], $style );
		}
	}

	public function test_styles_without_year_suffixes_are_unchanged() {
		$items = array(
			self::book( 'Jones', 'Beta Study', 2020 ),
			self::book( 'Jones', 'Alpha Study', 2020 ),
		);

		foreach ( array( 'mla-9', 'chicago-notes-bibliography', 'oscola', 'ieee', 'vancouver' ) as $style ) {
			foreach ( self::text( $items, $style ) as $text ) {
				$this->assertStringNotContainsString( '2020a', $text, $style );
				$this->assertStringNotContainsString( '2020b', $text, $style );
			}
		}
	}

	public function test_a_sent_suffix_is_replaced_and_a_lone_work_loses_its_letter() {
		$alone                = self::book( 'Jones', 'Alpha Study', 2020 );
		$alone['year-suffix'] = 'q';

		$this->assertSame( array( 'Jones, T. (2020). Alpha Study.' ), self::text( array( $alone ), 'apa-7' ) );
	}

	public function test_the_entry_cache_does_not_keep_a_letter_after_its_sibling_is_removed() {
		$alpha = self::book( 'Jones', 'Alpha Study', 2020 );
		$beta  = self::book( 'Jones', 'Beta Study', 2020 );

		$this->assertSame(
			array( 'Jones, T. (2020a). Alpha Study.', 'Jones, T. (2020b). Beta Study.' ),
			self::text( array( $alpha, $beta ), 'apa-7' )
		);
		$this->assertSame( array( 'Jones, T. (2020). Alpha Study.' ), self::text( array( $alpha ), 'apa-7' ) );
	}

	public function test_assignment_keeps_request_order_and_other_fields() {
		$items = bibliography_builder_assign_year_suffixes(
			array(
				self::book( 'Jones', 'Beta Study', 2020 ),
				self::book( 'Jones', 'Alpha Study', 2020 ),
				self::book( 'Smith', 'Gamma Study', 2020 ),
			),
			'apa-7'
		);

		$this->assertSame( array( 'Beta Study', 'Alpha Study', 'Gamma Study' ), array_column( $items, 'title' ) );
		$this->assertSame( 'b', $items[0]['year-suffix'] );
		$this->assertSame( 'a', $items[1]['year-suffix'] );
		$this->assertArrayNotHasKey( 'year-suffix', $items[2] );
	}
}
