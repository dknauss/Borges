<?php

use PHPUnit\Framework\TestCase;

/**
 * The render filter that translates save()'s fixed English labels for
 * visitors (includes/frontend-labels.php).
 */
final class FrontendLabelsTest extends TestCase {
	private const PARITY = __DIR__ . '/../fixtures/save-parity';
	private const DEPRECATIONS = __DIR__ . '/../fixtures/deprecations';

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();
	}

	private function translate_to_french(): void {
		$GLOBALS['bibliography_builder_test_translations'] = array(
			'Cite / Export'       => 'Citer / Exporter',
			'Copy citation'       => 'Copier la citation',
			'Copied'              => 'Copié',
			'RIS'                 => 'RIS (fr)',
			'CSL-JSON'            => 'CSL-JSON (fr)',
			'BibTeX'              => 'BibTeX (fr)',
			'BibLaTeX'            => 'BibLaTeX (fr)',
			'Link to publication' => 'Lien vers la publication',
		);
	}

	private function golden( string $name ): string {
		return rtrim( (string) file_get_contents( self::PARITY . '/' . $name . '.html' ), "\n" );
	}

	public function test_english_sites_get_the_markup_untouched(): void {
		$markup = $this->golden( 'notes-full-metadata' );

		$this->assertSame( $markup, bibliography_builder_localize_rendered_labels( $markup ) );
	}

	public function test_translates_every_saved_label(): void {
		$this->translate_to_french();

		$markup = bibliography_builder_localize_rendered_labels( $this->golden( 'notes-full-metadata' ) );

		$this->assertStringNotContainsString( '>Cite / Export<', $markup );
		$this->assertStringNotContainsString( '>Copy citation<', $markup );
		$this->assertSame(
			substr_count( $this->golden( 'notes-full-metadata' ), 'class="bibliography-builder-cite-copy"' ),
			substr_count( $markup, 'data-copied-label="Copié"' )
		);

		foreach ( array( 'Citer / Exporter', 'Copier la citation', 'RIS (fr)', 'CSL-JSON (fr)', 'BibTeX (fr)', 'BibLaTeX (fr)' ) as $label ) {
			$this->assertStringContainsString( '>' . $label . '<', $markup, $label );
		}
	}

	public function test_only_the_labels_change(): void {
		$this->translate_to_french();
		$golden = $this->golden( 'notes-full-metadata' );
		$markup = bibliography_builder_localize_rendered_labels( $golden );

		// Undo exactly the label edits and the result is the saved markup.
		$restored = strtr(
			str_replace( ' data-copied-label="Copié"', '', $markup ),
			array(
				'>Citer / Exporter<'   => '>Cite / Export<',
				'>Copier la citation<' => '>Copy citation<',
				'>RIS (fr)<'           => '>RIS<',
				'>CSL-JSON (fr)<'      => '>CSL-JSON<',
				'>BibTeX (fr)<'        => '>BibTeX<',
				'>BibLaTeX (fr)<'      => '>BibLaTeX<',
			)
		);

		$this->assertSame( $golden, $restored );
	}

	public function test_translates_english_labels_in_older_markup(): void {
		$this->translate_to_french();
		$legacy = (string) file_get_contents( self::DEPRECATIONS . '/v07-deprecated.html' );
		$markup = bibliography_builder_localize_rendered_labels( $legacy );

		$this->assertStringContainsString( 'data-copied-label="Copié"', $markup );
		$this->assertStringNotContainsString( 'data-copied-label="Copied"', $markup );
		$this->assertStringContainsString( '>Citer / Exporter<', $markup );
		// One copied label per button: the saved one is translated, not duplicated.
		$this->assertSame(
			substr_count( $markup, 'class="bibliography-builder-cite-copy"' ),
			substr_count( $markup, 'data-copied-label=' )
		);

		$link = '<a href="https://e.org/x" rel="nofollow noopener noreferrer" aria-label="Link to publication — https://e.org/x">https://e.org/x</a>';
		$this->assertStringContainsString(
			'aria-label="Lien vers la publication — https://e.org/x"',
			bibliography_builder_localize_rendered_labels( $link )
		);
	}

	public function test_leaves_labels_saved_in_another_language_and_citation_text_alone(): void {
		$this->translate_to_french();

		$german = '<summary class="bibliography-builder-cite-export-toggle">Zitieren / Exportieren</summary>'
			. '<button type="button" class="bibliography-builder-cite-copy" data-copied-label="Kopiert">Zitat kopieren</button>'
			. '<a rel="nofollow noopener noreferrer" aria-label="Link zur Publikation — https://e.org">https://e.org</a>';
		$this->assertSame( $german, bibliography_builder_localize_rendered_labels( $german ) );

		$citation = '<cite class="bibliography-builder-entry-text">On the Cite / Export problem: Copy citation, RIS and BibTeX.</cite>';
		$this->assertSame( $citation, bibliography_builder_localize_rendered_labels( $citation ) );
	}

	public function test_escapes_translations(): void {
		$GLOBALS['bibliography_builder_test_translations'] = array(
			'Cite / Export' => 'Cite <&> "Export"',
			'Copied'        => 'Done "<ok>"',
		);

		$markup = bibliography_builder_localize_rendered_labels( $this->golden( 'notes-full-metadata' ) );

		$this->assertStringContainsString( '>Cite &lt;&amp;> "Export"</summary>', $markup );
		$this->assertStringContainsString( 'data-copied-label="Done &quot;&lt;ok&gt;&quot;"', $markup );
	}

	public function test_passes_through_empty_or_non_string_content(): void {
		$this->translate_to_french();

		$this->assertSame( '', bibliography_builder_localize_rendered_labels( '' ) );
		$this->assertNull( bibliography_builder_localize_rendered_labels( null ) );
	}

	public function test_leaves_real_legacy_french_markup_alone_on_a_german_site(): void {
		$GLOBALS['bibliography_builder_test_translations'] = array(
			'Cite / Export'       => 'Zitieren / Exportieren',
			'Copy citation'       => 'Zitat kopieren',
			'Copied'              => 'Kopiert',
			'Link to publication' => 'Link zur Publikation',
		);
		$legacy = (string) file_get_contents( __DIR__ . '/../fixtures/legacy-localized/fr-cite-export.html' );

		$this->assertSame( $legacy, bibliography_builder_localize_rendered_labels( $legacy ) );
	}
}
