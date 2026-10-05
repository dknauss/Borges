<?php
/**
 * Pins what every bundled CSL style renders for a corpus of reference types.
 *
 * The styles and locales in packages/ are project-authored (see
 * docs/csl-styles.md). tests/fixtures/csl-styles/items.json covers each
 * common CSL type and the author-count cases the manuals treat differently;
 * tests/fixtures/csl-styles/<style-key>.txt holds the reviewed output, one
 * `id<TAB>text` line per item.
 *
 * After an intended style change, rewrite the goldens and review the diff
 * against the style manual:
 *
 *   BORGES_WRITE_STYLE_GOLDENS=1 composer test:php -- --filter CslStyleGolden
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class CslStyleGoldenTest extends TestCase {

	private static function fixture_dir() {
		return dirname( __DIR__ ) . '/fixtures/csl-styles';
	}

	public static function styleProvider() {
		$cases = array();

		foreach ( array_keys( bibliography_builder_get_formatter_style_definitions() ) as $style_key ) {
			$cases[ $style_key ] = array( $style_key );
		}

		return $cases;
	}

	protected function setUp(): void {
		if ( ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) || ! class_exists( 'DOMDocument' ) ) {
			$this->markTestSkipped( 'citeproc-php and DOM are required.' );
		}
	}

	#[DataProvider( 'styleProvider' )]
	public function test_style_renders_the_reviewed_output( $style_key ) {
		$items     = json_decode( file_get_contents( self::fixture_dir() . '/items.json' ), true );
		$formatted = bibliography_builder_format_csl_items( $items, $style_key );

		$this->assertIsArray( $formatted, $style_key . ' failed to format' );

		$lines = array();
		foreach ( $items as $index => $item ) {
			$lines[] = $item['id'] . "\t" . $formatted[ $index ];
		}
		$actual = implode( "\n", $lines ) . "\n";
		$golden = self::fixture_dir() . '/' . $style_key . '.txt';

		if ( getenv( 'BORGES_WRITE_STYLE_GOLDENS' ) ) {
			file_put_contents( $golden, $actual );
		}

		$this->assertFileExists( $golden );
		$this->assertSame( file_get_contents( $golden ), $actual );
	}

	/**
	 * The formatter parses a style once and renders entry after entry on the
	 * same parsed tree, restoring its state in between. No entry may depend
	 * on the ones rendered before it: in reverse order, with the "et al." and
	 * APA 21+ entries now ahead of the short author lists, every entry must
	 * still match its golden line.
	 */
	#[DataProvider( 'styleProvider' )]
	public function test_each_entry_is_independent_of_the_entries_before_it( $style_key ) {
		$items   = array_reverse( json_decode( file_get_contents( self::fixture_dir() . '/items.json' ), true ) );
		$golden  = array();
		$results = bibliography_builder_format_csl_items( $items, $style_key );

		foreach ( file( self::fixture_dir() . '/' . $style_key . '.txt', FILE_IGNORE_NEW_LINES ) as $line ) {
			list( $id, $text )     = explode( "\t", $line, 2 );
			$golden[ $id ]         = $text;
		}

		$this->assertIsArray( $results, $style_key . ' failed to format' );

		foreach ( $items as $index => $item ) {
			$this->assertSame( $golden[ $item['id'] ], $results[ $index ], $style_key . ': ' . $item['id'] );
		}
	}

	/**
	 * Current-edition rules the corpus does not reach: Cite Them Right 13's
	 * "article" numbers, and OSCOLA 5 and NBR 6023:2025 dropping the access
	 * date when there is a DOI.
	 */
	public function test_current_edition_rules_outside_the_corpus() {
		$webpage = array(
			'type'            => 'webpage',
			'title'           => 'A Page',
			'author'          => array(
				array(
					'family' => 'Lee',
					'given'  => 'Kim',
				),
			),
			'container-title' => 'Site',
			'URL'             => 'https://example.org/a',
			'accessed'        => array( 'date-parts' => array( array( 2024, 5, 1 ) ) ),
			'issued'          => array( 'date-parts' => array( array( 2024, 4, 2 ) ) ),
		);
		$with_doi = array_merge( $webpage, array( 'DOI' => '10.5555/web.1' ) );
		$article  = array(
			'type'            => 'article-journal',
			'title'           => 'Numbered Article',
			'author'          => array(
				array(
					'family' => 'Moss',
					'given'  => 'Ann',
				),
			),
			'container-title' => 'Diabetes Research',
			'volume'          => '162',
			'number'          => '108125',
			'issued'          => array( 'date-parts' => array( array( 2020 ) ) ),
		);

		$text = static function ( $items, $style ) {
			return array_map( 'wp_strip_all_tags', bibliography_builder_format_csl_items( $items, $style ) );
		};

		$this->assertSame( array( 'Moss, A. (2020) ‘Numbered Article’, Diabetes Research, 162, article 108125.' ), $text( array( $article ), 'harvard' ) );
		// CrossRef also copies the article number into page; it is not a page.
		$this->assertSame(
			array( 'Moss, A. (2020) ‘Numbered Article’, Diabetes Research, 162, article 108125.' ),
			$text( array( array_merge( $article, array( 'page' => '108125' ) ) ), 'harvard' )
		);

		$this->assertSame(
			array(
				'Lee K, ‘A Page’ (Site, 2 April 2024) https://doi.org/10.5555/web.1',
				'Lee K, ‘A Page’ (Site, 2 April 2024) https://example.org/a accessed 1 May 2024',
			),
			$text( array( $with_doi, $webpage ), 'oscola' )
		);

		$this->assertSame(
			array(
				'LEE, Kim. A Page. Site, 2 abr. 2024. DOI: https://doi.org/10.5555/web.1.',
				'LEE, Kim. A Page. Site, 2 abr. 2024. Disponível em: https://example.org/a. Acesso em: 1 maio 2024.',
			),
			$text( array( $with_doi, $webpage ), 'abnt' )
		);
	}

	/**
	 * The formatter reads vendor/citation-style-language/, a Composer copy of
	 * packages/. A stale copy once hid a style regression; fail on any drift.
	 */
	public function test_installed_styles_and_locales_match_their_source() {
		$root = dirname( __DIR__, 2 );
		$dirs = array(
			'packages/citation-style-language-styles'  => 'vendor/citation-style-language/styles',
			'packages/citation-style-language-locales' => 'vendor/citation-style-language/locales',
		);

		foreach ( $dirs as $source => $installed ) {
			foreach ( glob( $root . '/' . $source . '/*.{csl,xml,json}', GLOB_BRACE ) as $file ) {
				$copy = $root . '/' . $installed . '/' . basename( $file );
				$this->assertFileExists( $copy, 'run composer install: ' . $copy . ' is missing' );
				$this->assertFileEquals( $file, $copy, 'run composer install: ' . basename( $file ) . ' is stale in ' . $installed );
			}
		}
	}
}
