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
}
