<?php
/**
 * Annotations (CSL `annote`): kept by the sanitizer as plain text, printed by
 * the save() port only when the block shows them, kept in email and feeds,
 * and reported by the read model and write routes. The save-parity fixtures
 * `annotations-*` pin the markup itself to the JS save().
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class AnnotationsTest extends TestCase {
	private const PARITY = __DIR__ . '/../fixtures/save-parity';

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();
	}

	/**
	 * The sanitized `annote` of a book carrying the given value, or null.
	 *
	 * @param mixed $annote Value to sanitize.
	 * @return mixed
	 */
	private static function annote( $annote ) {
		$csl = bibliography_builder_validate_and_sanitize_csl_item(
			array(
				'type'   => 'book',
				'title'  => 'Ugly Feelings',
				'annote' => $annote,
			)
		);

		self::assertIsArray( $csl );

		return $csl['annote'] ?? null;
	}

	private static function fixture( string $name ): string {
		return rtrim( (string) file_get_contents( self::PARITY . '/' . $name . '.html' ), "\n" );
	}

	public function test_the_sanitizer_keeps_plain_text_paragraphs(): void {
		$this->assertSame( "Read it.\n\nTwice.", self::annote( "Read it.\n\nTwice." ) );
		$this->assertSame(
			"Read it.\n\nTwice,\nslowly.",
			self::annote( "  <p>Read <b>it</b>.</p>\r\n \r\n\r\n<p>Twice,\nslowly.</p> " )
		);
	}

	public function test_the_sanitizer_drops_what_is_not_an_annotation(): void {
		$this->assertNull( self::annote( 42 ) );
		$this->assertNull( self::annote( array( 'text' => 'x' ) ) );
		$this->assertNull( self::annote( " \n\n " ) );
		$this->assertNull( self::annote( '<b></b>' ) );
	}

	public function test_the_sanitizer_matches_the_js_cleaning(): void {
		// Same input and output as src/lib/annotation.test.js.
		$this->assertSame(
			"First bold idea.\n\nSecond,\nwith a break.",
			self::annote( "  First <b>bold</b> idea.\r\n\r\n\r\n  Second,\nwith a break.  " )
		);
	}

	public function test_paragraphs_and_ris_value(): void {
		$csl = array( 'annote' => " One.\r\n \r\nTwo,\nstill two.\n\n\n\nThree. " );

		$this->assertSame(
			array( 'One.', "Two,\nstill two.", 'Three.' ),
			bibliography_builder_save_annotation_paragraphs( $csl )
		);
		$this->assertSame( 'One. Two, still two. Three.', bibliography_builder_save_ris_annotation( $csl ) );
		$this->assertSame( array(), bibliography_builder_save_annotation_paragraphs( array( 'annote' => 7 ) ) );
		$this->assertNull( bibliography_builder_save_ris_annotation( array() ) );
	}

	public function test_ris_entry_adds_n1_only_when_asked(): void {
		$csl = array(
			'type'   => 'book',
			'title'  => 'Ugly Feelings',
			'annote' => 'A note.',
		);

		$this->assertStringNotContainsString( 'N1', bibliography_builder_save_ris_entry( $csl ) );
		$this->assertStringEndsWith( "N1  - A note.\nER  - ", bibliography_builder_save_ris_entry( $csl, true ) );
	}

	public function test_hidden_annotations_render_what_older_blocks_saved(): void {
		$attrs = array(
			'citationStyle' => 'apa-7',
			'citations'     => array(
				array(
					'id'            => 'ngai',
					'csl'           => array(
						'type'   => 'book',
						'title'  => 'Ugly Feelings',
						'annote' => 'A note.',
					),
					'formattedText' => 'Ngai, S. (2005). <i>Ugly feelings</i>.',
				),
			),
		);

		$hidden = bibliography_builder_render_save_markup( $attrs );
		$this->assertStringNotContainsString( 'bibliography-builder-annotation', $hidden );
		$this->assertSame(
			$hidden,
			bibliography_builder_render_save_markup( array_merge( $attrs, array( 'showAnnotations' => false ) ) )
		);
		$this->assertStringContainsString(
			'</span><p class="bibliography-builder-annotation">A note.</p></li>',
			bibliography_builder_render_save_markup( array_merge( $attrs, array( 'showAnnotations' => true ) ) )
		);
	}

	public function test_email_and_feeds_keep_annotations_indented(): void {
		$html = bibliography_builder_portable_markup( self::fixture( 'annotations-shown' ) );

		$this->assertStringContainsString(
			'<li id="ref-ngai"><span class="bibliography-builder-entry-text" style="font-style:normal">Ngai, Sianne. Ugly Feelings. Harvard University Press, 2005.</span>'
				. '<p class="bibliography-builder-annotation" style="margin:0.4em 0 0 2em">A one-paragraph note.</p></li>',
			$html
		);
		$this->assertSame( 4, substr_count( $html, '<p class="bibliography-builder-annotation" style=' ) );
		$this->assertSame( 4, substr_count( $html, 'style="font-style:normal"' ) );
		$this->assertStringNotContainsString( 'data-cite-', $html );
		$this->assertStringNotContainsString( 'Z3988', $html );
	}

	public function test_read_model_reports_the_setting_and_keeps_annote_in_csl_json(): void {
		$attrs = array(
			'showAnnotations' => true,
			'citations'       => array(
				array(
					'id'            => 'ngai',
					'csl'           => array(
						'type'   => 'book',
						'title'  => 'Ugly Feelings',
						'annote' => 'A note.',
					),
					'formattedText' => 'Ngai, Sianne. Ugly Feelings. 2005.',
				),
			),
		);
		$blocks = bibliography_builder_collect_blocks(
			array(
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => $attrs,
				),
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array( 'citations' => array() ),
				),
			)
		);

		$this->assertTrue( $blocks[0]['showAnnotations'] );
		$this->assertFalse( $blocks[1]['showAnnotations'] );
		$this->assertSame( 'A note.', bibliography_builder_build_csl_json( $blocks[0] )[0]['annote'] );
		// Plain text matches the editor's "Copy bibliography": citations only.
		$this->assertSame( "Ngai, Sianne. Ugly Feelings. 2005.\n", bibliography_builder_build_plain_text( $blocks[0] ) );
	}

	public function test_show_annotations_is_a_write_setting(): void {
		$this->assertFalse( bibliography_builder_write_setting_defaults()['showAnnotations'] );
	}
}
