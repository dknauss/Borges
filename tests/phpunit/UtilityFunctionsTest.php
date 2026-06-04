<?php

use PHPUnit\Framework\TestCase;

/**
 * Unit tests for pure utility functions in bibliography-builder.php.
 *
 * These tests do not depend on WordPress infrastructure beyond the stubs
 * already provided by tests/phpunit/bootstrap.php.
 *
 * @package BibliographyBuilder
 */
final class UtilityFunctionsTest extends TestCase {

	// ── bibliography_builder_sanitize_formatted_text ─────────────────────────

	public function test_sanitize_formatted_text_strips_html_tags() {
		$result = bibliography_builder_sanitize_formatted_text( '<b>Bold</b> <em>text</em>.' );
		$this->assertSame( 'Bold text.', $result );
	}

	public function test_sanitize_formatted_text_decodes_html_entities() {
		$result = bibliography_builder_sanitize_formatted_text( 'Author &amp; Editor &mdash; 2024' );
		$this->assertSame( 'Author & Editor — 2024', $result );
	}

	public function test_sanitize_formatted_text_collapses_whitespace() {
		$result = bibliography_builder_sanitize_formatted_text( "  line one\n   line two\t  end  " );
		$this->assertSame( 'line one line two end', $result );
	}

	public function test_sanitize_formatted_text_handles_empty_string() {
		$this->assertSame( '', bibliography_builder_sanitize_formatted_text( '' ) );
	}

	public function test_sanitize_formatted_text_casts_to_string() {
		// Passing a non-string should not fatal — the function casts via (string).
		$result = bibliography_builder_sanitize_formatted_text( 42 );
		$this->assertSame( '42', $result );
	}

	public function test_sanitize_formatted_text_strips_nested_tags() {
		$result = bibliography_builder_sanitize_formatted_text( '<a href="#"><b>Link text</b></a>' );
		$this->assertSame( 'Link text', $result );
	}

	// ── bibliography_builder_normalize_formatted_text ────────────────────────

	public function test_normalize_removes_ieee_bracket_prefix() {
		$style  = array( 'family' => 'numeric', 'template' => 'ieee' );
		$result = bibliography_builder_normalize_formatted_text( '[1] Some citation text.', $style );
		$this->assertSame( 'Some citation text.', $result );
	}

	public function test_normalize_removes_numeric_dot_prefix() {
		$style  = array( 'family' => 'numeric', 'template' => 'vancouver' );
		$result = bibliography_builder_normalize_formatted_text( '12. Some citation text.', $style );
		$this->assertSame( 'Some citation text.', $result );
	}

	public function test_normalize_does_not_strip_prefix_for_non_numeric_style() {
		$style  = array( 'family' => 'author-date', 'template' => 'apa' );
		$result = bibliography_builder_normalize_formatted_text( '[1] Should stay.', $style );
		$this->assertSame( '[1] Should stay.', $result );
	}

	public function test_normalize_abnt_collapses_duplicate_volume_marker() {
		$style  = array( 'family' => 'author-date', 'template' => 'abnt' );
		$result = bibliography_builder_normalize_formatted_text( 'Journal v. vol. 3', $style );
		$this->assertSame( 'Journal v. 3', $result );
	}

	public function test_normalize_abnt_collapses_duplicate_issue_marker() {
		$style  = array( 'family' => 'author-date', 'template' => 'abnt' );
		$result = bibliography_builder_normalize_formatted_text( 'n. no. 5', $style );
		$this->assertSame( 'n. 5', $result );
	}

	public function test_normalize_abnt_collapses_duplicate_page_marker() {
		$style  = array( 'family' => 'author-date', 'template' => 'abnt' );
		$result = bibliography_builder_normalize_formatted_text( 'p. p. 10–20', $style );
		$this->assertSame( 'p. 10–20', $result );
	}

	public function test_normalize_abnt_collapses_pp_page_variant() {
		$style  = array( 'family' => 'author-date', 'template' => 'abnt' );
		$result = bibliography_builder_normalize_formatted_text( 'p. pp. 10–20', $style );
		$this->assertSame( 'p. 10–20', $result );
	}

	public function test_normalize_replaces_and_et_al() {
		$style  = array( 'family' => 'author-date', 'template' => 'apa' );
		$result = bibliography_builder_normalize_formatted_text( 'Smith and et al., 2020.', $style );
		$this->assertSame( 'Smith et al., 2020.', $result );
	}

	public function test_normalize_non_abnt_style_does_not_collapse_markers() {
		$style  = array( 'family' => 'author-date', 'template' => 'chicago-author-date' );
		$result = bibliography_builder_normalize_formatted_text( 'v. vol. 3', $style );
		$this->assertSame( 'v. vol. 3', $result );
	}

	public function test_normalize_handles_style_without_family_key() {
		// If 'family' key is absent the numeric prefix stripping is skipped.
		$result = bibliography_builder_normalize_formatted_text( '[1] Stay.', array() );
		$this->assertSame( '[1] Stay.', $result );
	}

	// ── bibliography_builder_get_citation_display_text ───────────────────────

	public function test_display_text_prefers_display_override() {
		$citation = array(
			'displayOverride' => 'Override text',
			'formattedText'   => 'Formatted text',
			'csl'             => array( 'title' => 'CSL title' ),
		);
		$this->assertSame( 'Override text', bibliography_builder_get_citation_display_text( $citation ) );
	}

	public function test_display_text_falls_back_to_formatted_text() {
		$citation = array(
			'displayOverride' => '',
			'formattedText'   => 'Formatted text',
			'csl'             => array( 'title' => 'CSL title' ),
		);
		$this->assertSame( 'Formatted text', bibliography_builder_get_citation_display_text( $citation ) );
	}

	public function test_display_text_falls_back_to_csl_title() {
		$citation = array(
			'formattedText' => '',
			'csl'           => array( 'title' => 'CSL title' ),
		);
		$this->assertSame( 'CSL title', bibliography_builder_get_citation_display_text( $citation ) );
	}

	public function test_display_text_returns_empty_string_when_nothing_available() {
		$this->assertSame( '', bibliography_builder_get_citation_display_text( array() ) );
	}

	public function test_display_text_ignores_non_string_display_override() {
		// Non-string displayOverride fails the is_string check, falls through.
		$citation = array(
			'displayOverride' => array( 'bad' ),
			'formattedText'   => 'Formatted',
		);
		$this->assertSame( 'Formatted', bibliography_builder_get_citation_display_text( $citation ) );
	}

	// ── bibliography_builder_build_plain_text ────────────────────────────────

	public function test_build_plain_text_joins_display_texts_with_newlines() {
		$bibliography = array(
			'citations' => array(
				array( 'formattedText' => 'First citation.' ),
				array( 'formattedText' => 'Second citation.' ),
			),
		);
		$result = bibliography_builder_build_plain_text( $bibliography );
		$this->assertSame( "First citation.\nSecond citation.\n", $result );
	}

	public function test_build_plain_text_strips_html_from_formatted_text() {
		$bibliography = array(
			'citations' => array(
				array( 'formattedText' => '<em>Italic</em> Title, 2024.' ),
			),
		);
		$result = bibliography_builder_build_plain_text( $bibliography );
		$this->assertSame( "Italic Title, 2024.\n", $result );
	}

	public function test_build_plain_text_empty_citations_produces_trailing_newline() {
		$bibliography = array( 'citations' => array() );
		$this->assertSame( "\n", bibliography_builder_build_plain_text( $bibliography ) );
	}

	// ── bibliography_builder_build_csl_json ──────────────────────────────────

	public function test_build_csl_json_extracts_csl_arrays() {
		$bibliography = array(
			'citations' => array(
				array( 'csl' => array( 'type' => 'book', 'title' => 'Alpha' ) ),
				array( 'csl' => array( 'type' => 'article-journal', 'title' => 'Beta' ) ),
			),
		);
		$result = bibliography_builder_build_csl_json( $bibliography );
		$this->assertCount( 2, $result );
		$this->assertSame( 'Alpha', $result[0]['title'] );
		$this->assertSame( 'Beta', $result[1]['title'] );
	}

	public function test_build_csl_json_returns_empty_array_for_missing_csl_key() {
		$bibliography = array(
			'citations' => array(
				array( 'formattedText' => 'No CSL here.' ),
			),
		);
		$result = bibliography_builder_build_csl_json( $bibliography );
		$this->assertSame( array( array() ), $result );
	}

	public function test_build_csl_json_is_reindexed() {
		$bibliography = array(
			'citations' => array(
				array( 'csl' => array( 'type' => 'book' ) ),
			),
		);
		$result = bibliography_builder_build_csl_json( $bibliography );
		$this->assertArrayHasKey( 0, $result );
	}

	// ── bibliography_builder_collect_blocks ──────────────────────────────────

	public function test_collect_blocks_returns_empty_for_no_blocks() {
		$this->assertSame( array(), bibliography_builder_collect_blocks( array() ) );
	}

	public function test_collect_blocks_extracts_bibliography_block() {
		$blocks = array(
			array(
				'blockName' => 'bibliography-builder/bibliography',
				'attrs'     => array(
					'citationStyle' => 'apa-7',
					'headingText'   => 'Works Cited',
					'citations'     => array(),
				),
			),
		);
		$result = bibliography_builder_collect_blocks( $blocks );
		$this->assertCount( 1, $result );
		$this->assertSame( 'apa-7', $result[0]['citationStyle'] );
		$this->assertSame( 'Works Cited', $result[0]['headingText'] );
	}

	public function test_collect_blocks_uses_default_citation_style_when_absent() {
		$blocks = array(
			array(
				'blockName' => 'bibliography-builder/bibliography',
				'attrs'     => array(),
			),
		);
		$result = bibliography_builder_collect_blocks( $blocks );
		$this->assertSame( 'chicago-notes-bibliography', $result[0]['citationStyle'] );
	}

	public function test_collect_blocks_recurses_into_inner_blocks() {
		$blocks = array(
			array(
				'blockName'   => 'core/group',
				'attrs'       => array(),
				'innerBlocks' => array(
					array(
						'blockName' => 'bibliography-builder/bibliography',
						'attrs'     => array( 'citationStyle' => 'mla-9' ),
					),
				),
			),
		);
		$result = bibliography_builder_collect_blocks( $blocks );
		$this->assertCount( 1, $result );
		$this->assertSame( 'mla-9', $result[0]['citationStyle'] );
	}

	public function test_collect_blocks_skips_non_array_citations_attr() {
		$blocks = array(
			array(
				'blockName' => 'bibliography-builder/bibliography',
				'attrs'     => array( 'citations' => 'not-an-array' ),
			),
		);
		$result = bibliography_builder_collect_blocks( $blocks );
		$this->assertSame( array(), $result[0]['citations'] );
	}

	public function test_collect_blocks_filters_non_array_citation_entries() {
		$blocks = array(
			array(
				'blockName' => 'bibliography-builder/bibliography',
				'attrs'     => array(
					'citations' => array(
						array( 'id' => 'good' ),
						'string-entry',
						null,
					),
				),
			),
		);
		$result = bibliography_builder_collect_blocks( $blocks );
		$this->assertCount( 1, $result[0]['citations'] );
	}

	public function test_collect_blocks_ignores_non_bibliography_blocks() {
		$blocks = array(
			array(
				'blockName' => 'core/paragraph',
				'attrs'     => array(),
			),
		);
		$result = bibliography_builder_collect_blocks( $blocks );
		$this->assertSame( array(), $result );
	}

	// ── bibliography_builder_prepare_bibliographies ──────────────────────────

	public function test_prepare_bibliographies_adds_index_and_entry_count() {
		$bibliographies = array(
			array( 'citationStyle' => 'apa-7', 'citations' => array( array(), array() ) ),
			array( 'citationStyle' => 'mla-9', 'citations' => array() ),
		);
		$result = bibliography_builder_prepare_bibliographies( $bibliographies );
		$this->assertSame( 0, $result[0]['index'] );
		$this->assertSame( 2, $result[0]['entryCount'] );
		$this->assertSame( 1, $result[1]['index'] );
		$this->assertSame( 0, $result[1]['entryCount'] );
	}

	public function test_prepare_bibliographies_reindexes_output() {
		// Input keyed from 5 — output must be 0-indexed.
		$bibliographies = array(
			5 => array( 'citations' => array() ),
		);
		$result = bibliography_builder_prepare_bibliographies( $bibliographies );
		$this->assertArrayHasKey( 0, $result );
		$this->assertArrayNotHasKey( 5, $result );
	}

	// ── bibliography_builder_get_formatter_style_definition ──────────────────

	public function test_get_formatter_style_definition_returns_known_style() {
		$style = bibliography_builder_get_formatter_style_definition( 'apa-7' );
		$this->assertSame( 'apa', $style['template'] );
		$this->assertSame( 'en-US', $style['locale'] );
		$this->assertSame( 'author-date', $style['family'] );
	}

	public function test_get_formatter_style_definition_returns_default_for_unknown_key() {
		$style = bibliography_builder_get_formatter_style_definition( 'not-a-real-style' );
		$this->assertSame( 'chicago-notes-bibliography', $style['template'] );
	}

	public function test_get_formatter_style_definition_ieee_is_numeric() {
		$style = bibliography_builder_get_formatter_style_definition( 'ieee' );
		$this->assertSame( 'numeric', $style['family'] );
	}

	public function test_get_formatter_style_definition_oscola_uses_gb_locale() {
		$style = bibliography_builder_get_formatter_style_definition( 'oscola' );
		$this->assertSame( 'en-GB', $style['locale'] );
	}

	public function test_get_formatter_style_definition_abnt_uses_pt_br_locale() {
		$style = bibliography_builder_get_formatter_style_definition( 'abnt' );
		$this->assertSame( 'pt-BR', $style['locale'] );
	}

	public function test_formatter_cache_key_is_stable_for_equivalent_csl_shapes() {
		$style = bibliography_builder_get_formatter_style_definition( 'apa-7' );
		$left  = array(
			array(
				'type'   => 'book',
				'title'  => 'Cacheable Work',
				'author' => array(
					array(
						'family' => 'Alpha',
						'given'  => 'Ada',
					),
				),
			),
		);
		$right = array(
			array(
				'author' => array(
					array(
						'given'  => 'Ada',
						'family' => 'Alpha',
					),
				),
				'title'  => 'Cacheable Work',
				'type'   => 'book',
			),
		);

		$this->assertSame(
			bibliography_builder_get_formatter_cache_key( $left, 'apa-7', $style ),
			bibliography_builder_get_formatter_cache_key( $right, 'apa-7', $style )
		);
	}

	public function test_format_csl_items_returns_warm_cache_without_formatter_bootstrap() {
		$style_key = 'apa-7';
		$style     = bibliography_builder_get_formatter_style_definition( $style_key );
		$csl_items = array(
			array(
				'type'  => 'book',
				'title' => 'Cached Work',
			),
		);
		$cache_key = bibliography_builder_get_formatter_cache_key( $csl_items, $style_key, $style );

		bibliography_builder_cache_set(
			$cache_key,
			array( 'Cached formatted entry.' ),
			'bibliography_builder_formatter',
			BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL
		);

		$this->assertSame(
			array( 'Cached formatted entry.' ),
			bibliography_builder_format_csl_items( $csl_items, $style_key )
		);
	}

	// ── bibliography_builder_extract_citeproc_entries ────────────────────────

	public function test_extract_citeproc_entries_parses_csl_entry_elements() {
		$style = array( 'family' => 'author-date', 'template' => 'apa' );
		$html  = '<div class="csl-bib-body"><div class="csl-entry">Smith, J. (2024). <em>A Book</em>.</div></div>';

		$entries = bibliography_builder_extract_citeproc_entries( $html, $style );

		$this->assertCount( 1, $entries );
		$this->assertStringContainsString( 'Smith', $entries[0]['text'] );
	}

	public function test_extract_citeproc_entries_extracts_borges_csl_id_attribute() {
		$style = array( 'family' => 'author-date', 'template' => 'apa' );
		$html  = '<div class="csl-bib-body"><div class="csl-entry">'
			. '<span data-borges-csl-id="ref-42"></span>Author Name (2020). Title.</div></div>';

		$entries = bibliography_builder_extract_citeproc_entries( $html, $style );

		$this->assertCount( 1, $entries );
		$this->assertSame( 'ref-42', $entries[0]['id'] );
	}

	public function test_extract_citeproc_entries_strips_html_from_text() {
		$style = array( 'family' => 'author-date', 'template' => 'apa' );
		$html  = '<div class="csl-bib-body"><div class="csl-entry"><em>Italic Title</em>, 2024.</div></div>';

		$entries = bibliography_builder_extract_citeproc_entries( $html, $style );

		$this->assertStringNotContainsString( '<em>', $entries[0]['text'] );
		$this->assertStringContainsString( 'Italic Title', $entries[0]['text'] );
	}

	public function test_extract_citeproc_entries_removes_numeric_prefix_for_ieee() {
		$style = array( 'family' => 'numeric', 'template' => 'ieee' );
		$html  = '<div class="csl-bib-body"><div class="csl-entry">[1] Smith, J. et al.</div></div>';

		$entries = bibliography_builder_extract_citeproc_entries( $html, $style );

		$this->assertStringStartsWith( 'Smith', $entries[0]['text'] );
	}

	public function test_extract_citeproc_entries_handles_multiple_entries() {
		$style = array( 'family' => 'author-date', 'template' => 'chicago-author-date' );
		$html  = '<div class="csl-bib-body">'
			. '<div class="csl-entry">Alpha 2020.</div>'
			. '<div class="csl-entry">Beta 2021.</div>'
			. '</div>';

		$entries = bibliography_builder_extract_citeproc_entries( $html, $style );

		$this->assertCount( 2, $entries );
	}

	public function test_extract_citeproc_entries_returns_empty_array_for_no_entries() {
		$style = array( 'family' => 'author-date', 'template' => 'apa' );
		$html  = '<div class="csl-bib-body"></div>';

		$entries = bibliography_builder_extract_citeproc_entries( $html, $style );

		$this->assertSame( array(), $entries );
	}

	public function test_extract_citeproc_entries_id_defaults_to_empty_string_when_no_marker() {
		$style = array( 'family' => 'author-date', 'template' => 'apa' );
		$html  = '<div class="csl-bib-body"><div class="csl-entry">No marker here.</div></div>';

		$entries = bibliography_builder_extract_citeproc_entries( $html, $style );

		$this->assertSame( '', $entries[0]['id'] );
	}

	// ── bibliography_builder_json_encode ─────────────────────────────────────

	public function test_json_encode_returns_valid_json_string() {
		$result = bibliography_builder_json_encode( array( 'type' => 'book', 'title' => 'Alpha' ) );
		$this->assertIsString( $result );
		$decoded = json_decode( $result, true );
		$this->assertSame( 'book', $decoded['type'] );
	}

	public function test_json_encode_handles_empty_array() {
		$this->assertSame( '[]', bibliography_builder_json_encode( array() ) );
	}
}
