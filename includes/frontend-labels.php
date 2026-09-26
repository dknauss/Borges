<?php
/**
 * Server-side localization of the saved Cite / Export labels.
 *
 * The block's save() writes the Cite / Export labels in fixed English so saved markup is
 * identical in every editor locale (the editor re-validates it in its own).
 * Visitors should still read them in their language. Translating them here,
 * as the block is rendered, keeps that off the client: the view script needs
 * no `wp-i18n` (or `wp-hooks`) on the page, and the labels are translated
 * even without JavaScript.
 *
 * Only exact, element-bounded strings that save() itself writes are touched,
 * so a label that older markup saved already translated, or a citation that
 * happens to contain the same words, is never rewritten. Nothing runs when
 * the site's language leaves the labels in English.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The saved labels in the current locale, keyed by their fixed English text.
 *
 * Mirrors `CITE_EXPORT_LABELS` and `LEGACY_LINK_FALLBACK_LABEL` in
 * src/lib/cite-export-labels.js.
 *
 * @return array<string, string>
 */
function bibliography_builder_get_frontend_labels() {
	return array(
		'Cite / Export'       => __( 'Cite / Export', 'borges-bibliography-builder' ),
		'Copy citation'       => __( 'Copy citation', 'borges-bibliography-builder' ),
		'Copied'              => __( 'Copied', 'borges-bibliography-builder' ),
		'RIS'                 => __( 'RIS', 'borges-bibliography-builder' ),
		'CSL-JSON'            => __( 'CSL-JSON', 'borges-bibliography-builder' ),
		'BibTeX'              => __( 'BibTeX', 'borges-bibliography-builder' ),
		'BibLaTeX'            => __( 'BibLaTeX', 'borges-bibliography-builder' ),
		'Link to publication' => __( 'Link to publication', 'borges-bibliography-builder' ),
	);
}

/**
 * Translate the fixed English labels in a rendered bibliography block.
 *
 * Hooked to `render_block_bibliography-builder/bibliography`, so it changes
 * what visitors receive, never the stored `post_content` the editor validates.
 *
 * @param string $block_content Rendered block HTML.
 * @return string
 */
function bibliography_builder_localize_rendered_labels( $block_content ) {
	if ( ! is_string( $block_content ) || '' === $block_content ) {
		return $block_content;
	}

	$labels     = bibliography_builder_get_frontend_labels();
	$translated = array_filter(
		$labels,
		static function ( $text, $english ) {
			return $text !== $english;
		},
		ARRAY_FILTER_USE_BOTH
	);

	if ( array() === $translated ) {
		return $block_content;
	}

	$toggle = '<summary class="bibliography-builder-cite-export-toggle">';
	$text   = 'bibliography_builder_escape_save_text';
	$attr   = 'bibliography_builder_escape_save_attribute';
	$pairs  = array(
		// The panel toggle and the copy button, exactly as save() writes them.
		$toggle . 'Cite / Export</summary>'  => $toggle . $text( $labels['Cite / Export'] ) . '</summary>',
		'>Copy citation</button>'            => '>' . $text( $labels['Copy citation'] ) . '</button>',
		// Older markup's accessible name for links in untitled citations.
		'aria-label="Link to publication — ' => 'aria-label="' . $attr( $labels['Link to publication'] ) . ' — ',
	);

	// Export links end with the `rel` save() gives them, then the label.
	foreach ( array( 'RIS', 'CSL-JSON', 'BibTeX', 'BibLaTeX' ) as $format ) {
		$pairs[ ' rel="noopener">' . $format . '</a>' ] = ' rel="noopener">' . $text( $labels[ $format ] ) . '</a>';
	}

	$block_content = strtr( $block_content, $pairs );

	// The copied-state label: current markup has none, so view.js would fall
	// back to English. Supply it on each copy button that lacks one.
	if ( isset( $translated['Copied'] ) ) {
		$block_content = (string) preg_replace_callback(
			'/<button\b[^>]*\bclass="bibliography-builder-cite-copy"[^>]*>/',
			static function ( $button ) use ( $attr, $labels ) {
				// Older markup saved the label: translate it only if it is the
				// English one, and leave a label saved in another language.
				if ( false !== strpos( $button[0], 'data-copied-label=' ) ) {
					return str_replace(
						'data-copied-label="Copied"',
						'data-copied-label="' . $attr( $labels['Copied'] ) . '"',
						$button[0]
					);
				}

				return substr( $button[0], 0, -1 ) . ' data-copied-label="' . $attr( $labels['Copied'] ) . '">';
			},
			$block_content
		);
	}

	return $block_content;
}

add_filter( 'render_block_bibliography-builder/bibliography', 'bibliography_builder_localize_rendered_labels' );
