<?php
/**
 * Bibliographies in email and feeds (includes/email-output.php).
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class EmailOutputTest extends TestCase {
	private const PARITY       = __DIR__ . '/../fixtures/save-parity';
	private const DEPRECATIONS = __DIR__ . '/../fixtures/deprecations';

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();
	}

	private static function current_markup(): string {
		return rtrim( (string) file_get_contents( self::PARITY . '/notes-full-metadata.html' ), "\n" );
	}

	/**
	 * Block HTML from a deprecation fixture, without the block comment.
	 *
	 * @param string $version Fixture version, e.g. "14".
	 */
	private static function legacy_markup( string $version ): string {
		$fixture = (string) file_get_contents( self::DEPRECATIONS . '/v' . $version . '-deprecated.html' );

		return trim( (string) preg_replace( '/<!-- \/?wp:[^>]*-->/', '', $fixture ) );
	}

	private static function assert_portable( string $html ): void {
		foreach ( array( '<details', '<button', '<script', '<cite', 'data-cite-', 'Z3988', 'data:' ) as $needle ) {
			self::assertStringNotContainsString( $needle, $html, $needle );
		}
	}

	public function test_registers_the_email_callback(): void {
		bibliography_builder_block_init();

		$this->assertSame(
			'bibliography_builder_render_email',
			$GLOBALS['bibliography_builder_test_registered_block_args'][0]['render_email_callback']
		);
		$this->assertTrue( is_callable( 'bibliography_builder_render_email' ) );
	}

	public function test_current_markup_keeps_the_bibliography_and_drops_site_only_parts(): void {
		$html = bibliography_builder_portable_markup( self::current_markup() );

		self::assert_portable( $html );
		$this->assertStringContainsString( '<p class="bibliography-builder-heading">Works &amp; &lt;Sources></p>', $html );
		$this->assertStringContainsString(
			'<li id="ref-thesis-1"><span class="bibliography-builder-entry-text" style="font-style:normal">Solo. <i>A Thesis</i>. PhD, Uni, 2019.</span></li>',
			$html
		);
		$this->assertSame(
			substr_count( self::current_markup(), '<li id="ref-' ),
			substr_count( $html, 'style="font-style:normal"' )
		);
	}

	public function test_legacy_markup_loses_the_saved_panel_and_italic_cite(): void {
		foreach ( array( '13', '14', '07' ) as $version ) {
			$legacy = self::legacy_markup( $version );
			$this->assertStringContainsString( '<details class="bibliography-builder-cite-export">', $legacy, $version );

			$html = bibliography_builder_portable_markup( $legacy );

			self::assert_portable( $html );
			$this->assertSame(
				substr_count( $legacy, '<cite class="bibliography-builder-entry-text">' ),
				substr_count( $html, '<span class="bibliography-builder-entry-text" style="font-style:normal">' ),
				$version
			);
			// Entry links survive.
			$this->assertSame(
				substr_count( $legacy, 'rel="nofollow noopener noreferrer"' ),
				substr_count( $html, 'rel="nofollow noopener noreferrer"' ),
				$version
			);
		}
	}

	public function test_repeated_author_spans_stay_inside_the_entry(): void {
		$golden = rtrim( (string) file_get_contents( self::PARITY . '/mla-repeated-authors.html' ), "\n" );
		$html   = bibliography_builder_portable_markup( $golden );

		$this->assertStringContainsString( '<span class="bibliography-builder-repeated-author">', $html );
		$this->assertSame( substr_count( $golden, '<span' ) - substr_count( $golden, 'class="Z3988"' ), substr_count( $html, '<span' ) );
		$this->assertSame( substr_count( $html, '<span' ), substr_count( $html, '</span>' ) );
	}

	public function test_email_callback_returns_portable_markup_without_the_renderer(): void {
		$this->assertSame(
			bibliography_builder_portable_markup( self::current_markup() ),
			bibliography_builder_render_email( self::current_markup(), array(), null )
		);
		$this->assertSame( '', bibliography_builder_render_email( '', array(), null ) );
	}

	public function test_feeds_get_portable_markup_and_pages_do_not(): void {
		$markup = self::current_markup();

		$this->assertSame( $markup, bibliography_builder_render_feed( $markup ) );

		$GLOBALS['bibliography_builder_test_is_feed'] = true;
		$this->assertSame( bibliography_builder_portable_markup( $markup ), bibliography_builder_render_feed( $markup ) );
	}
}
