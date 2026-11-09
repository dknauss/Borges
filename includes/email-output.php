<?php
/**
 * Bibliographies in email and feeds.
 *
 * Email clients and feed readers show post content without the block's
 * stylesheet or view script. The markup save() writes reads correctly there
 * on its own, but posts saved before then carry each entry in a `<cite>`
 * (italic by default, which hides the titles' own italics) and the
 * Cite / Export panel itself (shown expanded, with a copy button and download
 * links that cannot work). This file renders the block for those places:
 *
 * - a `render_email_callback`, read by the email renderer that WooCommerce,
 *   MailPoet, Jetpack's newsletters, and Newspack Newsletters share; and
 * - a feed filter, for RSS and Atom.
 *
 * Both keep the bibliography (heading, entries, links, shown annotations)
 * and drop what only works on the site: the Cite / Export panel or its data,
 * the copy button, JSON-LD and CSL-JSON scripts, COinS spans, and the hidden
 * microformats data.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reduce a rendered bibliography block to markup that reads correctly without
 * the block's stylesheet and script.
 *
 * Works on the shapes save() writes, current and legacy; the patterns match
 * only elements save() itself produces.
 *
 * @param mixed $html Rendered block HTML; anything but a non-empty string is returned unchanged.
 * @return mixed
 */
function bibliography_builder_portable_markup( $html ) {
	if ( ! is_string( $html ) || '' === $html ) {
		return $html;
	}

	$html = (string) preg_replace(
		array(
			// A saved Cite / Export panel. save() never nests one in another.
			'#<details class="bibliography-builder-cite-export">.*?</details>#s',
			// JSON-LD and CSL-JSON.
			'#<script\b[^>]*>.*?</script>#s',
			// COinS: an empty span read only by browser reference managers.
			'#<span class="Z3988"[^>]*></span>#',
			// Microformats (includes/microformats.php): `<data>` elements,
			// some in an author's `h-card` span, in one hidden span.
			'#<span class="bibliography-builder-microformats" hidden>'
				. '(?:<data [^>]*></data>|<span class="p-author h-card">(?:<data [^>]*></data>)*</span>)*'
				. '</span>#',
			// The panel's data for view.js. Values are attribute-escaped, so
			// they contain no double quote.
			'# data-cite-[a-z-]+="[^"]*"#',
		),
		'',
		$html
	);

	// The default heading is a paragraph the block's stylesheet sets larger,
	// semibold, and centered (start-aligned with the `headingAlign: "start"`
	// class, since 1.20.0); without it, it reads as body text. Repeat those
	// styles inline (the only kind most email clients keep) and add <strong>
	// for feed readers that drop style attributes. A heading level other than
	// "paragraph" saves an <h2>-<h6>, which clients size on their own, so it
	// gets only the alignment.
	$html = (string) preg_replace_callback(
		'#<(p|h[2-6]) class="bibliography-builder-heading( bibliography-builder-heading-align-start)?"'
			. '( id="[^"]*")?>(.*?)</\1>#s',
		static function ( $parts ) {
			$align = '' !== $parts[2] ? 'start' : 'center';
			$open  = '<' . $parts[1] . ' class="bibliography-builder-heading' . $parts[2] . '"' . $parts[3];

			if ( 'p' !== $parts[1] ) {
				return $open . ' style="text-align:' . $align . '">' . $parts[4] . '</' . $parts[1] . '>';
			}

			return $open . ' style="margin:0 0 0.75em;font-size:1.25em;font-weight:600;text-align:' . $align . '">'
				. '<strong>' . $parts[4] . '</strong></p>';
		},
		$html,
		1
	);

	// Annotations are readable prose, so they stay; an inline style indents
	// them under their entry, as the stylesheet does. Their text is escaped,
	// so it holds no "<".
	$html = (string) preg_replace(
		'#<p class="bibliography-builder-annotation">#',
		'<p class="bibliography-builder-annotation" style="margin:0.4em 0 0 2em">',
		$html
	);

	// Unordered lists saved before 1.21.0 have no inline list style, so
	// email clients show bullets and an indent. Add the style save() now
	// writes (bibliography_builder_save_unordered_list_style()), after the
	// class, unless the list already has a style. Numeric lists keep their
	// numbers.
	$html = (string) preg_replace_callback(
		'#<ul\b([^>]*)>#',
		static function ( $tag ) {
			if (
				1 !== preg_match( '#\sclass="[^"]*\bbibliography-builder-list-unordered\b[^"]*"#', $tag[1], $class )
				|| 1 === preg_match( '#\sstyle=#', $tag[1] )
			) {
				return $tag[0];
			}

			return '<ul' . str_replace(
				$class[0],
				$class[0] . ' style="' . bibliography_builder_save_unordered_list_style() . '"',
				$tag[1]
			) . '>';
		},
		$html
	);

	// Legacy entries in <cite>; current ones are already spans, followed by
	// any annotations. Both get an inline style, the only kind of style most
	// email clients keep.
	return (string) preg_replace(
		'#<(?:cite|span) class="bibliography-builder-entry-text">(.*?)</(?:cite|span)>'
			. '(?=(?:<p class="bibliography-builder-annotation"[^>]*>[^<]*</p>)*</li>)#s',
		'<span class="bibliography-builder-entry-text" style="font-style:normal">$1</span>',
		$html
	);
}

/**
 * `render_email_callback` for the bibliography block.
 *
 * Called by the shared email renderer with the block's rendered content.
 * Wraps the result in the renderer's table helper when it is available, as
 * its fallback for blocks without a callback does.
 *
 * @param mixed  $block_content     Rendered block HTML.
 * @param array  $parsed_block      Parsed block.
 * @param object $rendering_context Email rendering context.
 * @return string
 */
function bibliography_builder_render_email( $block_content, $parsed_block = array(), $rendering_context = null ) {
	unset( $parsed_block, $rendering_context );

	$html   = bibliography_builder_portable_markup( $block_content );
	$render = array(
		'Automattic\WooCommerce\EmailEditor\Integrations\Utils\Table_Wrapper_Helper',
		'render_table_wrapper',
	);

	if ( ! is_string( $html ) || '' === $html || ! is_callable( $render ) ) {
		return $html;
	}

	return call_user_func(
		$render,
		$html,
		array(
			'style' => 'border-collapse: separate;',
			'width' => '100%',
		),
		array( 'align' => 'left' )
	);
}

/**
 * Render bibliographies for feeds the way email gets them.
 *
 * @param string $block_content Rendered block HTML.
 * @return string
 */
function bibliography_builder_render_feed( $block_content ) {
	return is_feed() ? bibliography_builder_portable_markup( $block_content ) : $block_content;
}

add_filter( 'render_block_bibliography-builder/bibliography', 'bibliography_builder_render_feed' );
