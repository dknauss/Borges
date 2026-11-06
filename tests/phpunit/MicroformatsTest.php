<?php
/**
 * Render-time microformats (includes/microformats.php).
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class MicroformatsTest extends TestCase {
	protected function setUp(): void {
		bibliography_builder_test_reset_state();
		remove_all_filters( 'bibliography_builder_enrich_microformats' );
	}

	protected function tearDown(): void {
		remove_all_filters( 'bibliography_builder_enrich_microformats' );
		bibliography_builder_test_reset_state();
	}

	/**
	 * The current-markup fixture, parsed, with extra CSL on its citations.
	 */
	private function fixture(): array {
		$content = rtrim( (string) file_get_contents( __DIR__ . '/../fixtures/deprecations/v00-current.html' ), "\n" );
		$blocks  = array_values(
			array_filter(
				( new WP_Block_Parser() )->parse( $content ),
				static function ( $block ) {
					return ! empty( $block['blockName'] );
				}
			)
		);
		$block   = $blocks[0];

		foreach ( $block['attrs']['citations'] as &$citation ) {
			if ( 'zeta2020' === $citation['id'] ) {
				$citation['csl']['DOI']      = '10.1000/zeta<2020>';
				$citation['csl']['issued']   = array( 'date-parts' => array( array( 2020, 3, 9 ) ) );
				$citation['csl']['author'][] = array(
					'family'                => 'Waals',
					'given'                 => 'Johannes',
					'non-dropping-particle' => 'van der',
					'ORCID'                 => 'https://orcid.org/0000-0002-1825-009x',
				);
				$citation['csl']['author'][] = array( 'literal' => 'Test & Co.' );
			}
		}
		unset( $citation );

		return $block;
	}

	private function render( array $block ): string {
		return bibliography_builder_enrich_rendered_microformats( $block['innerHTML'], $block );
	}

	/**
	 * The markup inside one entry, from its start tag to the visible text.
	 */
	private function entry( string $html, string $id ): string {
		$this->assertSame( 1, preg_match( '#<li id="ref-' . $id . '"[^>]*>.*?<span class="bibliography-builder-entry-text"#s', $html, $match ) );

		return preg_replace( '#\sdata-cite-[a-z-]+="[^"]*"#', '', $match[0] );
	}

	public function test_each_entry_becomes_an_h_cite_with_its_fields(): void {
		$html = $this->render( $this->fixture() );

		$this->assertSame(
			'<li id="ref-alpha2018" class="h-cite"><span class="bibliography-builder-microformats" hidden>'
				. '<data class="p-name" value="Alpha: an earlier work that sorts first"></data>'
				. '<span class="p-author h-card"><data class="p-name" value="Ada Alpha"></data><data class="p-given-name" value="Ada"></data><data class="p-family-name" value="Alpha"></data></span>'
				. '<data class="dt-published" value="2018"></data>'
				. '<data class="p-publisher" value="Test University Press"></data>'
				. '</span><span class="bibliography-builder-entry-text"',
			$this->entry( $html, 'alpha2018' )
		);

		$this->assertSame(
			'<li id="ref-zeta2020" class="h-cite"><span class="bibliography-builder-microformats" hidden>'
				. '<data class="p-name" value="Zeta: a later work that sorts second"></data>'
				. '<span class="p-author h-card"><data class="p-name" value="Zoe Zeta"></data><data class="p-given-name" value="Zoe"></data><data class="p-family-name" value="Zeta"></data></span>'
				. '<span class="p-author h-card"><data class="p-name" value="Johannes van der Waals"></data><data class="p-given-name" value="Johannes"></data><data class="p-family-name" value="van der Waals"></data><data class="u-url" value="https://orcid.org/0000-0002-1825-009X"></data></span>'
				. '<span class="p-author h-card"><data class="p-name" value="Test &amp; Co."></data><data class="p-org" value="Test &amp; Co."></data></span>'
				. '<data class="dt-published" value="2020-03-09"></data>'
				. '<data class="u-uid u-url" value="https://doi.org/10.1000/zeta%3C2020%3E"></data>'
				. '<data class="u-url" value="https://example.com/zeta"></data>'
				. '<data class="p-publication" value="Journal of Block Testing"></data>'
				. '</span><span class="bibliography-builder-entry-text"',
			$this->entry( $html, 'zeta2020' )
		);
	}

	public function test_the_rest_of_the_markup_is_unchanged(): void {
		$block = $this->fixture();
		$html  = $this->render( $block );

		$stripped = preg_replace(
			array( '#<span class="bibliography-builder-microformats" hidden>(?:<data [^>]*></data>|<span class="p-author h-card">(?:<data [^>]*></data>)*</span>)*</span>#', '# class="h-cite"#' ),
			'',
			$html
		);

		$this->assertSame( $block['innerHTML'], $stripped );
		$this->assertSame( 2, substr_count( $html, 'class="h-cite"' ) );
	}

	public function test_an_existing_class_is_kept_and_a_marked_entry_is_left_alone(): void {
		$block = $this->fixture();

		$block['innerHTML'] = str_replace(
			array( '<li id="ref-alpha2018"', '<li id="ref-zeta2020"' ),
			array( '<li class="is-new" id="ref-alpha2018"', '<li class="h-cite custom" id="ref-zeta2020"' ),
			$block['innerHTML']
		);

		$html = $this->render( $block );

		$this->assertStringContainsString( '<li class="is-new h-cite" id="ref-alpha2018"', $html );
		$this->assertSame( 1, substr_count( $html, 'bibliography-builder-microformats' ) );
	}

	public function test_a_greater_than_sign_in_an_attribute_does_not_end_the_tag(): void {
		$block = $this->fixture();

		$block['innerHTML'] = str_replace(
			'<li id="ref-alpha2018"',
			'<li id="ref-alpha2018" title="a > b"',
			$block['innerHTML']
		);

		$this->assertStringContainsString(
			'<li id="ref-alpha2018" title="a > b"',
			$this->render( $block )
		);
		$this->assertStringContainsString(
			' class="h-cite"><span class="bibliography-builder-microformats" hidden><data class="p-name" value="Alpha',
			$this->render( $block )
		);
	}

	public function test_entries_without_a_citation_are_left_alone(): void {
		$block = $this->fixture();

		$block['attrs']['citations'] = array_values(
			array_filter(
				$block['attrs']['citations'],
				static function ( $citation ) {
					return 'zeta2020' === $citation['id'];
				}
			)
		);

		$html = (string) preg_replace( '#\sdata-cite-[a-z-]+="[^"]*"#', '', $this->render( $block ) );

		$this->assertStringNotContainsString( '<li id="ref-alpha2018" class="h-cite"', $html );
		$this->assertStringContainsString( '<li id="ref-zeta2020" class="h-cite"', $html );
	}

	public function test_the_filter_turns_it_off(): void {
		add_filter( 'bibliography_builder_enrich_microformats', '__return_false' );
		$block = $this->fixture();

		$this->assertSame( $block['innerHTML'], $this->render( $block ) );
	}

	public function test_feeds_and_other_values_are_left_alone(): void {
		$block = $this->fixture();

		$GLOBALS['bibliography_builder_test_is_feed'] = true;
		$this->assertSame( $block['innerHTML'], $this->render( $block ) );

		$this->assertNull( bibliography_builder_enrich_rendered_microformats( null, $block ) );
		$this->assertSame( '<p>Other</p>', bibliography_builder_enrich_rendered_microformats( '<p>Other</p>', $block ) );
	}

	public function test_email_markup_drops_the_microformats_data(): void {
		$html = bibliography_builder_portable_markup( $this->render( $this->fixture() ) );

		$this->assertStringNotContainsString( 'bibliography-builder-microformats', $html );
		$this->assertStringNotContainsString( '<data', $html );
		$this->assertStringContainsString( '<li id="ref-zeta2020" class="h-cite"><span class="bibliography-builder-entry-text"', $html );
	}

	public function test_dates_keep_only_the_parts_the_record_has(): void {
		$date = static function ( $issued ) {
			return bibliography_builder_microformats_date( array( 'issued' => $issued ) );
		};

		$this->assertSame( '2018', $date( array( 'date-parts' => array( array( 2018 ) ) ) ) );
		$this->assertSame( '2018-05', $date( array( 'date-parts' => array( array( '2018', '5' ) ) ) ) );
		$this->assertSame( '0850', $date( array( 'date-parts' => array( array( 850 ) ) ) ) );
		$this->assertSame( '2018', $date( array( 'date-parts' => array( array( 2018, 21 ) ) ) ) );
		$this->assertSame( '2019-02', $date( array( 'date-parts' => array( array( 2019, 2, 30 ) ) ) ) );
		$this->assertSame( '', $date( array( 'date-parts' => array( array( 'spring' ) ) ) ) );
		$this->assertSame( '2021-07-04', $date( array( 'raw' => '2021-07-04' ) ) );
		$this->assertSame( '', $date( array( 'raw' => 'July 2021' ) ) );
		$this->assertSame( '', bibliography_builder_microformats_date( array() ) );
	}

	public function test_names_and_records_with_nothing_to_mark(): void {
		$this->assertSame( '', bibliography_builder_microformats_author( array() ) );
		$this->assertSame( '', bibliography_builder_microformats_author( 'Plato' ) );
		$this->assertSame(
			'<span class="p-author h-card"><data class="p-name" value="Plato"></data></span>',
			bibliography_builder_microformats_author( array( 'given' => 'Plato' ) )
		);
		$this->assertSame( '', bibliography_builder_microformats_orcid_url( 'not an orcid' ) );
		$this->assertSame( '', bibliography_builder_microformats_entry( array( 'URL' => 'javascript:alert(1)' ) ) );
		$this->assertSame(
			'<span class="bibliography-builder-microformats" hidden><data class="p-name" value="A bold claim"></data><data class="p-publication" value="Italic Journal"></data></span>',
			bibliography_builder_microformats_entry(
				array(
					'title'           => 'A <b>bold</b> claim',
					'container-title' => '<i>Italic</i> Journal',
				)
			)
		);
	}
}
