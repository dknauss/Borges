<?php

use PHPUnit\Framework\TestCase;

/**
 * The render filter that sets the `rel` of citation links
 * (includes/citation-link-rel.php).
 */
final class CitationLinkRelTest extends TestCase {
	private const LEGACY_LINK = '<a href="https://doi.org/10.1/x" rel="nofollow noopener noreferrer" aria-label="X — https://doi.org/10.1/x">https://doi.org/10.1/x</a>';
	private const EXPORT_LINK = '<a href="data:application/x-research-info-systems;charset=utf-8,TY" download data-cite-export-filename="x.ris" rel="noopener">RIS</a>';

	protected function tearDown(): void {
		remove_all_filters( 'bibliography_builder_citation_link_rel' );
	}

	private function use_rel( $rel ): void {
		add_filter(
			'bibliography_builder_citation_link_rel',
			static function () use ( $rel ) {
				return $rel;
			}
		);
	}

	public function test_legacy_citation_links_lose_nofollow_and_noreferrer(): void {
		$this->assertSame(
			'<a href="https://doi.org/10.1/x" rel="noopener" aria-label="X — https://doi.org/10.1/x">https://doi.org/10.1/x</a>',
			bibliography_builder_filter_citation_link_rel( self::LEGACY_LINK )
		);
	}

	public function test_current_markup_is_unchanged_by_default(): void {
		foreach ( glob( __DIR__ . '/../fixtures/save-parity/*.html' ) as $path ) {
			$html = (string) file_get_contents( $path );
			$this->assertStringNotContainsString( 'nofollow', $html, basename( $path ) );
			$this->assertSame( $html, bibliography_builder_filter_citation_link_rel( $html ), basename( $path ) );
		}
	}

	public function test_a_site_can_restore_nofollow(): void {
		$this->use_rel( 'nofollow noopener' );

		$this->assertSame(
			'<p><a href="https://e.org" rel="nofollow noopener">e</a>' . self::EXPORT_LINK . '</p>',
			bibliography_builder_filter_citation_link_rel( '<p><a href="https://e.org" rel="noopener">e</a>' . self::EXPORT_LINK . '</p>' )
		);
	}

	public function test_an_empty_value_removes_the_attribute(): void {
		$this->use_rel( '' );

		$this->assertSame(
			'<a href="https://doi.org/10.1/x" aria-label="X — https://doi.org/10.1/x">https://doi.org/10.1/x</a>',
			bibliography_builder_filter_citation_link_rel( self::LEGACY_LINK )
		);
	}

	public function test_filtered_values_are_cleaned(): void {
		$this->use_rel( ' NoFollow  "onload=x  noopener nofollow ' );

		$this->assertSame( 'nofollow noopener', bibliography_builder_citation_link_rel() );
	}

	public function test_export_links_and_hand_edited_rels_are_left_alone(): void {
		$html = self::EXPORT_LINK . '<a href="https://e.org" rel="author">e</a>';

		$rendered = bibliography_builder_filter_citation_link_rel( $html . self::LEGACY_LINK );

		$this->assertStringStartsWith( $html . '<a href="https://doi.org/10.1/x" rel="noopener" ', $rendered );
	}

	public function test_non_strings_pass_through(): void {
		$this->assertNull( bibliography_builder_filter_citation_link_rel( null ) );
		$this->assertSame( '', bibliography_builder_filter_citation_link_rel( '' ) );
	}
}
