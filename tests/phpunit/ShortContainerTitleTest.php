<?php

use PHPUnit\Framework\TestCase;

/**
 * Journal abbreviations (`container-title-short`): kept by the sanitizer as
 * `sanitizeShortContainerTitle()` in src/lib/csl-sanitize.js keeps them, and
 * italicized by the save() port where IEEE and Vancouver print them. The CSL
 * goldens pin how the two styles print them.
 */
final class ShortContainerTitleTest extends TestCase {

	private static function short( array $fields ) {
		$csl = bibliography_builder_validate_and_sanitize_csl_item(
			array_merge(
				array(
					'type'  => 'article-journal',
					'title' => 'A Test Article',
				),
				$fields
			)
		);

		return $csl['container-title-short'] ?? null;
	}

	public function test_the_sanitizer_keeps_one_plain_string() {
		$this->assertSame( 'Phys. Rev. Lett.', self::short( array( 'container-title-short' => 'Phys. Rev. Lett.' ) ) );
		$this->assertSame( 'J Biol Chem', self::short( array( 'container-title-short' => array( 'J Biol Chem', 'JBC' ) ) ) );
		$this->assertSame( 'Nature', self::short( array( 'container-title-short' => ' <b>Nature</b> ' ) ) );
		$this->assertSame( 'J. Libr. Syst.', self::short( array( 'journalAbbreviation' => 'J. Libr. Syst.' ) ) );
		$this->assertNull( self::short( array( 'container-title-short' => 42 ) ) );
		$this->assertNull( self::short( array( 'container-title-short' => '' ) ) );
		$this->assertNull( self::short( array( 'container-title-short' => array() ) ) );

		$csl = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'                => 'article-journal',
				'title'               => 'A Test Article',
				'journalAbbreviation' => 'J. Libr. Syst.',
			)
		);
		$this->assertArrayNotHasKey( 'journalAbbreviation', $csl );
	}

	public function test_save_italicizes_the_abbreviation_only_when_the_full_title_is_absent() {
		$citation = array(
			'id'            => 'green',
			'csl'           => array(
				'type'                  => 'article-journal',
				'title'                 => 'Metadata Drift',
				'container-title'       => 'Journal of Library Systems',
				'container-title-short' => 'J. Libr. Syst.',
			),
			'formattedText' => 'S. Green, “Metadata Drift,” J. Libr. Syst., vol. 27, 2020.',
		);
		$italic   = static function ( array $citation ): array {
			return array_column(
				array_filter(
					bibliography_builder_save_display_segments( $citation ),
					static fn( $segment ) => $segment['italic']
				),
				'text'
			);
		};

		$this->assertSame( array( 'J. Libr. Syst.' ), $italic( $citation ) );

		$citation['formattedText'] = 'Green S. Metadata Drift. Journal of Library Systems. 2020;27.';
		$this->assertSame( array( 'Journal of Library Systems' ), $italic( $citation ) );

		$citation['csl']['type']   = 'book';
		$citation['formattedText'] = 'Green S. Metadata Drift. J. Libr. Syst.';
		$this->assertSame( array( 'Metadata Drift' ), $italic( $citation ) );
	}
}
