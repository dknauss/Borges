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
