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
 * Both keep the bibliography (heading, entries, links) and drop what only
 * works on the site: the Cite / Export panel or its data, the copy button,
 * JSON-LD and CSL-JSON scripts, and COinS spans.
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
			// The panel's data for view.js. Values are attribute-escaped, so
			// they contain no double quote.
			'# data-cite-[a-z-]+="[^"]*"#',
		),
		'',
		$html
	);

	// The default heading is a paragraph the block's stylesheet sets larger,
	// semibold, and centered; without it, it reads as body text. Repeat those
	// styles inline (the only kind most email clients keep) and add <strong>
	// for feed readers that drop style attributes. A heading level other than
	// "paragraph" saves an <h2>-<h6>, which clients style on their own.
	$html = (string) preg_replace(
		'#<p class="bibliography-builder-heading">(.*?)</p>#s',
		'<p class="bibliography-builder-heading" style="'
			. 'margin:0 0 0.75em;font-size:1.25em;font-weight:600;text-align:center'
			. '"><strong>$1</strong></p>',
		$html,
		1
	);

	// Legacy entries in <cite>; current ones are already spans. Both get an
	// inline style, the only kind of style most email clients keep.
	return (string) preg_replace(
		'#<(?:cite|span) class="bibliography-builder-entry-text">(.*?)</(?:cite|span)>(?=</li>)#s',
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
