<?php

use PHPUnit\Framework\TestCase;

/**
 * The PHP port of src/lib/repeated-authors.js, case for case with
 * src/lib/repeated-authors.test.js. The save-parity fixtures pin the markup;
 * these pin the matcher's branches the fixture list does not reach.
 */
final class RepeatedAuthorsTest extends TestCase {

	private static function entry( $id, $authors, $text, $extra = array() ) {
		return array_merge(
			array(
				'id'            => $id,
				'csl'           => array(
					'type'   => 'book',
					'author' => $authors,
				),
				'formattedText' => $text,
			),
			$extra
		);
	}

	private static function prefixes( $citations, $style = 'mla-9' ) {
		return bibliography_builder_save_repeated_author_prefixes( $citations, $style );
	}

	public function test_applies_to_mla_9_only() {
		$borges = array(
			array(
				'family' => 'Borges',
				'given'  => 'Jorge Luis',
			),
		);
		$list   = array(
			self::entry( 'a', $borges, 'Borges, Jorge Luis. Ficciones. 1944.' ),
			self::entry( 'b', $borges, 'Borges, Jorge Luis. Labyrinths. 1962.' ),
		);

		$this->assertSame( array( null, 'Borges, Jorge Luis' ), self::prefixes( $list ) );
		$this->assertSame( array( null, null ), self::prefixes( $list, 'chicago-notes-bibliography' ) );
	}

	public function test_writes_names_the_way_the_mla_style_does() {
		$org     = array( array( 'literal' => 'World Health Organization' ) );
		$nasa    = array(
			(object) array(
				'family' => 'Becker',
				'given'  => 'T.',
			),
			(object) array( 'literal' => 'NASA' ),
		);
		$beauvoir = array(
			array(
				'family'            => 'Beauvoir',
				'given'             => 'Simone',
				'dropping-particle' => 'de',
			),
		);
		$juniors  = array(
			array(
				'family' => 'Smith',
				'given'  => 'John',
				'suffix' => 'Jr.',
			),
			array(
				'family' => 'Doe',
				'given'  => 'James',
				'suffix' => 'Jr.',
			),
		);
		$three    = array(
			array( 'family' => 'Kim' ),
			array( 'family' => 'Lee' ),
			array( 'family' => 'Park' ),
		);
		$pair     = 'Smith, John, Jr., and James Doe Jr';

		$this->assertSame(
			array( null, 'World Health Organization', null, 'Becker, T., and NASA', null, 'Beauvoir, Simone de', null, $pair, null, 'Kim, et al' ),
			self::prefixes(
				array(
					self::entry( 'a', $org, 'World Health Organization. One.' ),
					self::entry( 'b', $org, 'World Health Organization. Two.' ),
					self::entry( 'c', $nasa, 'Becker, T., and NASA. Three.' ),
					self::entry( 'd', $nasa, 'Becker, T., and NASA. Four.' ),
					self::entry( 'e', $beauvoir, 'Beauvoir, Simone de. Five.' ),
					self::entry( 'f', $beauvoir, 'Beauvoir, Simone de. Six.' ),
					self::entry( 'g', $juniors, $pair . '. Seven.' ),
					self::entry( 'h', $juniors, $pair . '. Eight.' ),
					self::entry( 'i', $three, 'Kim, et al. Nine.' ),
					self::entry( 'j', $three, 'Kim, et al. Ten.' ),
				)
			)
		);
	}

	public function test_title_only_fallbacks_and_orcids_keep_full_names() {
		$lee        = array(
			array(
				'family' => 'Lee',
				'given'  => 'Kim',
			),
		);
		$title_only = static function ( $id, $title ) use ( $lee ) {
			return array(
				'id'            => $id,
				'csl'           => array(
					'type'   => 'article-journal',
					'title'  => $title,
					'author' => $lee,
				),
				'formattedText' => '',
			);
		};
		$orcid      = static function ( $id ) {
			return array(
				array(
					'family' => 'Lee',
					'given'  => 'Kim',
					'ORCID'  => $id,
				),
			);
		};

		$failed = static function ( $id, $text ) use ( $lee ) {
			return array(
				'id'            => $id,
				'csl'           => array(
					'type'   => 'article-journal',
					'title'  => $text,
					'author' => $lee,
				),
				'formattedText' => $text,
			);
		};

		// Formatting failed: formattedText holds the title itself.
		$this->assertSame(
			array( null, null ),
			self::prefixes( array( $failed( 'x', 'Lee, Kim. Part One' ), $failed( 'y', 'Lee, Kim. Part Two' ) ) )
		);

		$this->assertSame(
			array( null, null, null, null, null, null, 'Lee, Kim' ),
			self::prefixes(
				array(
					$title_only( 'a', 'Lee, Kim. Part One' ),
					$title_only( 'b', 'Lee, Kim. Part Two' ),
					self::entry( 'c', $lee, 'Lee, Kim. Part Three.' ),
					$title_only( 'd', 'Lee, Kim. Part Four' ),
					self::entry( 'e', $orcid( '0000-0001-0000-0001' ), 'Lee, Kim. Five.' ),
					self::entry( 'f', $orcid( '0000-0002-0000-0002' ), 'Lee, Kim. Six.' ),
					self::entry( 'g', $orcid( '0000-0002-0000-0002' ), 'Lee, Kim. Seven.' ),
				)
			)
		);
	}

	public function test_keeps_full_names_whenever_in_doubt() {
		$lee        = array(
			array(
				'family' => 'Lee',
				'given'  => 'Kim',
			),
		);
		$given_only = array( array( 'given' => 'Kim' ) );
		$no_second  = array(
			array(
				'family' => 'Lee',
				'given'  => 'Kim',
			),
			array( 'given' => 'Ann' ),
		);

		$this->assertSame(
			array_fill( 0, 12, null ),
			self::prefixes(
				array(
					self::entry( 'a', $lee, 'Lee, Kim. One.' ),
					// Manual display text.
					self::entry( 'b', $lee, 'Lee, Kim. Two.', array( 'displayOverride' => 'Lee, Kim. Two.' ) ),
					// Titles alone that name the author.
					self::entry( 'c', $lee, 'About Lee, Kim. Three.' ),
					self::entry( 'd', $lee, 'About Lee, Kim. Four.' ),
					self::entry( 'e', $given_only, 'Kim. Five.' ),
					self::entry( 'f', $given_only, 'Kim. Six.' ),
					self::entry( 'g', $no_second, 'Lee, Kim, and Ann. Seven.' ),
					self::entry( 'h', $no_second, 'Lee, Kim, and Ann. Eight.' ),
					// No authors.
					self::entry( 'i', array(), 'Nine.' ),
					self::entry( 'j', array(), 'Ten.' ),
					'not a citation',
					self::entry( 'l', $lee, 'Lee, Kim. Twelve.' ),
				)
			)
		);
	}

	public function test_oscola_replaces_the_first_author_with_a_double_em_dash() {
		$hart   = array(
			'family' => 'Hart',
			'given'  => 'H. L. A.',
		);
		$honore = array(
			'family' => 'Honoré',
			'given'  => 'A. M.',
		);
		$gogh   = array(
			'family'                => 'Gogh',
			'non-dropping-particle' => 'van',
			'given'                 => 'Vincent',
		);

		$this->assertSame( "\u{2014}\u{2014}", bibliography_builder_save_repeated_author_mark( 'oscola' ) );
		$this->assertSame( "\u{2011}\u{2011}\u{2011}", bibliography_builder_save_repeated_author_mark( 'mla-9' ) );
		$this->assertSame(
			array( null, 'Hart HLA,', 'Hart HLA', null, 'van Gogh V' ),
			self::prefixes(
				array(
					self::entry( 'a', array( $hart ), 'Hart HLA, The Concept of Law (OUP 1961)' ),
					self::entry( 'b', array( $hart ), 'Hart HLA, Punishment and Responsibility (OUP 1968)' ),
					self::entry( 'c', array( $hart, $honore ), 'Hart HLA and Honoré AM, Causation in the Law (OUP 1959)' ),
					self::entry( 'd', array( $gogh ), 'van Gogh V, Letters (Penguin 1996)' ),
					self::entry( 'e', array( $gogh, $hart, $honore, $hart ), 'van Gogh V and others, Sketches (Penguin 1997)' ),
				),
				'oscola'
			)
		);
	}

	public function test_oscola_keeps_full_names_whenever_in_doubt() {
		$hart   = array(
			'family' => 'Hart',
			'given'  => 'H. L. A.',
		);
		$junior = array_merge( $hart, array( 'suffix' => 'Jr' ) );

		$this->assertSame(
			array( null, null, null, null, null, null ),
			self::prefixes(
				array(
					self::entry( 'a', array( $hart ), 'Hart HLA, The Concept of Law (OUP 1961)' ),
					self::entry(
						'b',
						array(
							array(
								'family' => 'Hart',
								'given'  => 'Jenifer',
							),
						),
						'Hart J, Law and Order (Blackwell 1950)'
					),
					self::entry( 'c', array( $junior ), 'Hart HLA Jr, One (OUP 1990)' ),
					self::entry( 'd', array( $junior ), 'Hart HLA Jr, Two (OUP 1991)' ),
					self::entry( 'e', array( $hart ), 'Hart HLA, Essays (OUP 1983)' ),
					self::entry( 'f', array( $hart ), 'H. L. A. Hart, Essays (OUP 1984)' ),
				),
				'oscola'
			)
		);
	}

	private static function with_mark( $citations, $style, $setting ) {
		return bibliography_builder_save_repeated_author_prefixes( $citations, $style, $setting );
	}

	public function test_the_setting_picks_a_mark_the_style_offers() {
		$this->assertSame( 'dash', bibliography_builder_save_repeated_author_rule( 'chicago-notes-bibliography', 'dash' ) );
		$this->assertSame( 'dash', bibliography_builder_save_repeated_author_rule( 'chicago-author-date', 'dash' ) );
		$this->assertSame( '', bibliography_builder_save_repeated_author_rule( 'chicago-notes-bibliography', 'underscore' ) );
		$this->assertSame( 'underscore', bibliography_builder_save_repeated_author_rule( 'abnt', 'underscore' ) );
		$this->assertSame( 'allAuthors', bibliography_builder_save_repeated_author_rule( 'mla-9', 'dash' ) );
		$this->assertSame( '', bibliography_builder_save_repeated_author_rule( 'mla-9', 'none' ) );
		$this->assertSame( 'firstAuthor', bibliography_builder_save_repeated_author_rule( 'oscola', array( 'bogus' ) ) );
		$this->assertSame( '', bibliography_builder_save_repeated_author_rule( 'apa-7', 'dash' ) );

		$this->assertSame( "\u{2014}\u{2014}\u{2014}", bibliography_builder_save_repeated_author_mark( 'chicago-notes-bibliography', 'dash' ) );
		$this->assertSame( '______', bibliography_builder_save_repeated_author_mark( 'abnt', 'underscore' ) );
		$this->assertSame( "\u{2014}\u{2014}", bibliography_builder_save_repeated_author_mark( 'oscola' ) );
		$this->assertSame( "\u{2011}\u{2011}\u{2011}", bibliography_builder_save_repeated_author_mark( 'mla-9', 'dash' ) );
	}

	public function test_none_writes_the_names_out_even_in_mla() {
		$borges = array(
			array(
				'family' => 'Borges',
				'given'  => 'Jorge Luis',
			),
		);
		$list   = array(
			self::entry( 'a', $borges, 'Borges, Jorge Luis. Ficciones. 1944.' ),
			self::entry( 'b', $borges, 'Borges, Jorge Luis. Labyrinths. 1962.' ),
		);

		$this->assertSame( array( null, null ), self::with_mark( $list, 'mla-9', 'none' ) );
		$this->assertSame( array( null, 'Borges, Jorge Luis' ), self::with_mark( $list, 'mla-9', 'style' ) );
	}

	public function test_dash_writes_names_as_chicago_does() {
		$two   = array(
			array(
				'family' => 'Becker',
				'given'  => 'Thomas J.',
			),
			array(
				'family' => 'Nakamura',
				'given'  => 'Yuki',
			),
		);
		$three = array(
			array(
				'family' => 'Hughes',
				'given'  => 'Rebecca',
			),
			array(
				'family' => 'Iqbal',
				'given'  => 'Omar',
			),
			array(
				'family' => 'Jensen',
				'given'  => 'Lars',
			),
		);
		$eight = array(
			array(
				'family' => 'Kim',
				'given'  => 'Ji-woo',
			),
			array(
				'family' => 'Lopez',
				'given'  => 'Ana',
			),
			array(
				'family' => 'Moreau',
				'given'  => 'Paul',
			),
		);

		foreach ( array( 'N', 'O', 'P', 'Q', 'R' ) as $family ) {
			$eight[] = array(
				'family' => $family,
				'given'  => 'X',
			);
		}

		$gogh       = array(
			array(
				'family'                => 'Gogh',
				'given'                 => 'Vincent',
				'non-dropping-particle' => 'van',
			),
		);
		$king       = array(
			array(
				'family' => 'King',
				'given'  => 'Martin Luther',
				'suffix' => 'Jr.',
			),
		);
		$two_text   = 'Becker, Thomas J., and Yuki Nakamura';
		$three_text = 'Hughes, Rebecca, Omar Iqbal, and Lars Jensen';
		$eight_text = 'Kim, Ji-woo, Ana Lopez, Paul Moreau, et al';

		$this->assertSame(
			array( null, $two_text, null, $three_text, null, $eight_text, null, 'Gogh, Vincent van', null, 'King, Martin Luther, Jr', null, null ),
			self::with_mark(
				array(
					self::entry( 'a', $two, $two_text . '. One. 2020.' ),
					self::entry( 'b', $two, $two_text . '. 2021. Two.' ),
					self::entry( 'c', $three, $three_text . '. Three.' ),
					self::entry( 'd', $three, $three_text . '. Four.' ),
					self::entry( 'e', $eight, $eight_text . '. Five.' ),
					self::entry( 'f', $eight, $eight_text . '. Six.' ),
					self::entry( 'g', $gogh, 'Gogh, Vincent van. Seven.' ),
					self::entry( 'h', $gogh, 'Gogh, Vincent van. Eight.' ),
					self::entry( 'i', $king, 'King, Martin Luther, Jr. Nine.' ),
					self::entry( 'j', $king, 'King, Martin Luther, Jr. Ten.' ),
					// Editors only: Chicago 17's "———, ed." is not applied.
					self::entry( 'k', array(), 'Okafor, Chidi, ed. Eleven.' ),
					self::entry( 'l', array(), 'Okafor, Chidi, ed. Twelve.' ),
				),
				'chicago-notes-bibliography',
				'dash'
			)
		);
	}

	public function test_underscore_writes_names_as_abnt_does() {
		$two      = array(
			array(
				'family' => 'Becker',
				'given'  => 'Thomas J.',
			),
			array(
				'family' => 'Nakamura',
				'given'  => 'Yuki',
			),
		);
		$four     = array(
			array(
				'family' => 'Kim',
				'given'  => 'Ji-woo',
			),
			array(
				'family' => 'Lopez',
				'given'  => 'Ana',
			),
			array(
				'family' => 'Moreau',
				'given'  => 'Paul',
			),
			array(
				'family' => 'Novak',
				'given'  => 'Eva',
			),
		);
		$org      = array( array( 'literal' => 'Open Research Alliance' ) );
		$accented = array(
			array(
				'family' => 'Álvarez',
				'given'  => 'Marta Inés',
			),
		);
		$gogh     = array(
			array(
				'family'                => 'Gogh',
				'given'                 => 'Vincent',
				'non-dropping-particle' => 'van',
			),
		);
		$two_text = 'BECKER, Thomas J.; NAKAMURA, Yuki';

		$this->assertSame(
			array( null, $two_text, null, 'KIM, Ji-woo et al', null, 'OPEN RESEARCH ALLIANCE', null, 'ÁLVAREZ, Marta Inés', null, null ),
			self::with_mark(
				array(
					self::entry( 'a', $two, $two_text . '. One.' ),
					self::entry( 'b', $two, $two_text . '. Two.' ),
					self::entry( 'c', $four, 'KIM, Ji-woo et al. Three.' ),
					self::entry( 'd', $four, 'KIM, Ji-woo et al. Four.' ),
					self::entry( 'e', $org, 'OPEN RESEARCH ALLIANCE. Five.' ),
					self::entry( 'f', $org, 'OPEN RESEARCH ALLIANCE. Six.' ),
					self::entry( 'g', $accented, 'ÁLVAREZ, Marta Inés. Seven.' ),
					self::entry( 'h', $accented, 'ÁLVAREZ, Marta Inés. Eight.' ),
					// Particles: the CSL processor decides their capitals.
					self::entry( 'i', $gogh, 'VAN GOGH, Vincent. Nine.' ),
					self::entry( 'j', $gogh, 'VAN GOGH, Vincent. Ten.' ),
				),
				'abnt',
				'underscore'
			)
		);
	}

	public function test_the_read_model_and_write_settings_carry_the_setting() {
		$blocks = bibliography_builder_collect_blocks(
			array(
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array( 'repeatedAuthorMark' => 'dash' ),
				),
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array(),
				),
			)
		);

		$this->assertSame( 'dash', $blocks[0]['repeatedAuthorMark'] );
		$this->assertSame( 'style', $blocks[1]['repeatedAuthorMark'] );
		$this->assertSame( 'style', bibliography_builder_write_setting_defaults()['repeatedAuthorMark'] );
		$this->assertSame( array( 'style', 'dash', 'underscore', 'none' ), bibliography_builder_repeated_author_mark_values() );
	}
}
