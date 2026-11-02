<?php

use PHPUnit\Framework\TestCase;

/**
 * The render filter that names older bibliographies by their visible heading
 * (includes/heading-label.php).
 */
final class HeadingLabelTest extends TestCase {
	private const BLOCK = array( 'attrs' => array( 'bibliographyId' => 'bib-1' ) );

	private function legacy( string $label = 'References', string $heading = 'References', string $tag = 'h2', string $extra = '' ): string {
		return '<section class="wp-block-bibliography-builder-bibliography"' . $extra . ' role="doc-bibliography" aria-label="' . $label . '">'
			. '<' . $tag . ' class="bibliography-builder-heading">' . $heading . '</' . $tag . '>'
			. '<ul class="bibliography-builder-list"><li>A</li></ul></section>';
	}

	public function test_a_legacy_label_becomes_labelledby(): void {
		$this->assertSame(
			'<section class="wp-block-bibliography-builder-bibliography" id="refs" role="doc-bibliography" aria-labelledby="bibliography-heading-bib-1">'
				. '<h2 class="bibliography-builder-heading" id="bibliography-heading-bib-1">References</h2>'
				. '<ul class="bibliography-builder-list"><li>A</li></ul></section>',
			bibliography_builder_label_section_by_heading( $this->legacy( 'References', 'References', 'h2', ' id="refs"' ), self::BLOCK )
		);
	}

	public function test_paragraph_headings_and_escaped_text_match(): void {
		$rendered = bibliography_builder_label_section_by_heading(
			$this->legacy( 'Works &amp; &lt;Sources>', 'Works &amp; &lt;Sources>', 'p' ),
			self::BLOCK
		);

		$this->assertStringContainsString( 'aria-labelledby="bibliography-heading-bib-1"', $rendered );
		$this->assertStringContainsString( '<p class="bibliography-builder-heading" id="bibliography-heading-bib-1">Works &amp; &lt;Sources></p>', $rendered );
		$this->assertStringNotContainsString( 'aria-label=', $rendered );
	}

	public function test_it_matches_what_save_now_writes(): void {
		$cases = json_decode( (string) file_get_contents( __DIR__ . '/../fixtures/save-parity/cases.json' ), true );

		foreach ( $cases['cases'] as $case ) {
			$attrs = $case['attributes'];

			if ( ! isset( $attrs['bibliographyId'] ) || empty( $attrs['headingText'] ) ) {
				continue;
			}

			$current = rtrim( (string) file_get_contents( __DIR__ . '/../fixtures/save-parity/' . $case['name'] . '.html' ), "\n" );
			$heading = bibliography_builder_save_heading_id( $attrs );
			$legacy  = str_replace(
				array( ' aria-labelledby="' . $heading . '"', ' id="' . $heading . '"' ),
				array( ' aria-label="' . bibliography_builder_escape_save_attribute( $attrs['headingText'] ) . '"', '' ),
				$current
			);

			$this->assertNotSame( $current, $legacy, $case['name'] );
			$this->assertSame( $current, bibliography_builder_label_section_by_heading( $legacy, array( 'attrs' => $attrs ) ), $case['name'] );
			$this->assertSame( $current, bibliography_builder_label_section_by_heading( $current, array( 'attrs' => $attrs ) ), $case['name'] );
		}
	}

	public function test_blocks_without_a_usable_id_keep_their_label(): void {
		$html = $this->legacy();

		$this->assertSame( $html, bibliography_builder_label_section_by_heading( $html, array( 'attrs' => array() ) ) );
		$this->assertSame( $html, bibliography_builder_label_section_by_heading( $html, array( 'attrs' => array( 'bibliographyId' => '123' ) ) ) );
		$this->assertSame( $html, bibliography_builder_label_section_by_heading( $html ) );
	}

	public function test_a_label_that_differs_from_the_heading_is_kept(): void {
		$html = $this->legacy( 'Bibliography', 'Sources' );

		$this->assertSame( $html, bibliography_builder_label_section_by_heading( $html, self::BLOCK ) );
	}

	public function test_sections_without_a_heading_are_left_alone(): void {
		$html = '<section class="wp-block-bibliography-builder-bibliography" role="doc-bibliography" aria-label="Bibliography"><ul class="bibliography-builder-list"><li>A</li></ul></section>';

		$this->assertSame( $html, bibliography_builder_label_section_by_heading( $html, self::BLOCK ) );
	}

	public function test_non_strings_pass_through(): void {
		$this->assertNull( bibliography_builder_label_section_by_heading( null, self::BLOCK ) );
		$this->assertSame( '', bibliography_builder_label_section_by_heading( '', self::BLOCK ) );
	}
}
