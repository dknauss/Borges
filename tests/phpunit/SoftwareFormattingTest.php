<?php
/**
 * Software entries print their version and access date in every style.
 *
 * Before the styles had a `software` branch, citeproc-php sent these entries
 * through each style's book form: the version was dropped everywhere, and an
 * undated online entry printed "n.d." with no access date or URL in Chicago,
 * IEEE, Vancouver, and ABNT. The full reviewed output is pinned by
 * CslStyleGoldenTest; this test states the rules it must keep.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SoftwareFormattingTest extends TestCase {

	private const UNDATED_ONLINE = array(
		'id'       => 'wpcom-migration',
		'type'     => 'software',
		'title'    => 'Migrate to WordPress.com',
		'author'   => array( array( 'literal' => 'WordPress.org' ) ),
		'version'  => '1.0',
		'URL'      => 'https://wordpress.org/plugins/wpcom-migration/',
		'accessed' => array( 'date-parts' => array( array( 2026, 11, 24 ) ) ),
	);

	/**
	 * The access date in each style's own form.
	 */
	private const ACCESSED = array(
		'abnt'                       => '24 nov. 2026',
		'apa-7'                      => 'November 24, 2026',
		'chicago-author-date'        => 'November 24, 2026',
		'chicago-notes-bibliography' => 'November 24, 2026',
		'harvard'                    => '24 November 2026',
		'ieee'                       => 'Nov. 24, 2026',
		'mla-9'                      => '24 Nov. 2026',
		'oscola'                     => '24 November 2026',
		'vancouver'                  => '2026 Nov 24',
	);

	protected function setUp(): void {
		if ( ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) ) {
			$this->markTestSkipped( 'citeproc-php is not available.' );
		}
	}

	public static function styleProvider() {
		$cases = array();

		foreach ( array_keys( bibliography_builder_get_formatter_style_definitions() ) as $style_key ) {
			$cases[ $style_key ] = array( $style_key );
		}

		return $cases;
	}

	private static function format_one( array $item, $style_key ) {
		$formatted = bibliography_builder_format_csl_items( array( $item ), $style_key );

		return is_array( $formatted ) ? $formatted[0] : '';
	}

	#[DataProvider( 'styleProvider' )]
	public function test_undated_online_software_prints_version_url_and_access_date( $style_key ) {
		$text = self::format_one( self::UNDATED_ONLINE, $style_key );

		$this->assertMatchesRegularExpression( '/\b(Version|version|Versão) 1\.0\b/u', $text );
		$this->assertStringContainsString( 'https://wordpress.org/plugins/wpcom-migration/', $text );
		$this->assertStringContainsString( self::ACCESSED[ $style_key ], $text );
	}

	public function test_chicago_notes_prints_the_access_date_in_place_of_no_date() {
		$text = self::format_one( self::UNDATED_ONLINE, 'chicago-notes-bibliography' );

		$this->assertSame(
			'WordPress.org. Migrate to WordPress.com. Version 1.0. Accessed November 24, 2026. https://wordpress.org/plugins/wpcom-migration/.',
			$text
		);
	}

	#[DataProvider( 'styleProvider' )]
	public function test_dated_software_prints_the_year_and_version( $style_key ) {
		$item              = self::UNDATED_ONLINE;
		$item['issued']    = array( 'date-parts' => array( array( 2025 ) ) );
		$item['publisher'] = 'WordPress.org';
		$text              = self::format_one( $item, $style_key );

		$this->assertStringContainsString( '2025', $text );
		$this->assertMatchesRegularExpression( '/\b(Version|version|Versão) 1\.0\b/u', $text );
		$this->assertStringNotContainsString( 'n.d.', $text );
		$this->assertStringNotContainsString( 'no date', $text );
	}

	#[DataProvider( 'styleProvider' )]
	public function test_software_without_a_version_prints_no_version_label( $style_key ) {
		$item = self::UNDATED_ONLINE;
		unset( $item['version'] );
		$text = self::format_one( $item, $style_key );

		$this->assertDoesNotMatchRegularExpression( '/\b(Version|version|Versão)\b/u', $text );
		$this->assertStringContainsString( self::ACCESSED[ $style_key ], $text );
	}

	public function test_undated_offline_software_still_says_it_has_no_date() {
		$item = array(
			'id'        => 'zotero',
			'type'      => 'software',
			'title'     => 'Zotero',
			'publisher' => 'Corporation for Digital Scholarship',
		);

		$this->assertStringContainsString( 'n.d.', self::format_one( $item, 'chicago-notes-bibliography' ) );
		$this->assertStringContainsString( 'n.d.', self::format_one( $item, 'ieee' ) );
	}
}
