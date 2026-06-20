<?php

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Guards the bundled CSL styles against silently dropping the publication year.
 *
 * A localized `<date variable="issued" form="text"/>` pulls its parts from the
 * active locale's `<date form="text">` block, which this plugin's deliberately
 * minimal locale does not define, so citeproc-php renders nothing (spec-correct,
 * not a library bug). Styles must use an explicit, locale-independent
 * `<date-part name="year"/>`. See docs/external-eccentricities.md. Three styles
 * (Chicago notes, OSCOLA, MLA) regressed this way and dropped the year.
 *
 * @package BibliographyBuilder
 */
final class StyleYearRenderingTest extends TestCase {

	/**
	 * Both the committed source package and the installed copy the formatter
	 * actually loads. `bibliography_builder_format_csl_items()` reads styles
	 * from `vendor/citation-style-language/styles/` (a non-symlinked Composer
	 * copy of `packages/`), so guarding only the source missed a stale vendor
	 * copy that still dropped the year. Glob both so drift in either fails.
	 */
	private static function styles_dirs() {
		$root = dirname( __DIR__, 2 );
		return array(
			'source'   => $root . '/packages/citation-style-language-styles',
			'rendered' => $root . '/vendor/citation-style-language/styles',
		);
	}

	public static function styleProvider() {
		$cases = array();
		foreach ( self::styles_dirs() as $label => $dir ) {
			foreach ( glob( $dir . '/*.csl' ) as $file ) {
				$cases[ $label . ': ' . basename( $file, '.csl' ) ] = array( $file );
			}
		}
		return $cases;
	}

	/**
	 * Static guard: no style may use the form="text" issued date that
	 * citeproc-php fails to render.
	 */
	#[DataProvider( 'styleProvider' )]
	public function test_style_does_not_use_unrenderable_issued_date( $style_path ) {
		$xml = file_get_contents( $style_path );
		$this->assertStringNotContainsString(
			'variable="issued" form="text"',
			$xml,
			basename( $style_path ) . ' uses an issued date form citeproc-php does not render; use <date-part name="year"/>'
		);
	}

	/**
	 * Behavioural guard: each style renders the publication year.
	 */
	#[DataProvider( 'styleProvider' )]
	public function test_style_renders_publication_year( $style_path ) {
		if ( ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) ) {
			$this->markTestSkipped( 'citeproc-php is not available.' );
		}

		$items = json_decode(
			'[{"id":"a","type":"article-journal","title":"Sample Article","author":[{"family":"Doe","given":"Jane"}],"container-title":"Journal of Tests","issued":{"date-parts":[[1963]]}}]'
		);

		$formatter = new \Seboettg\CiteProc\CiteProc( file_get_contents( $style_path ), 'en-US' );
		$output    = strip_tags( $formatter->render( $items, 'bibliography' ) );

		$this->assertStringContainsString(
			'1963',
			$output,
			basename( $style_path ) . ' should render the publication year'
		);
	}
}
