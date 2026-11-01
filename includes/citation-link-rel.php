<?php
/**
 * The `rel` on citation links.
 *
 * Borges 1.17.0 and earlier saved every link in an entry (a DOI, a URL) with
 * `rel="nofollow noopener noreferrer"`. A bibliography links to the works it
 * cites on purpose, so `nofollow` told search engines not to trust the very
 * sources the author relies on, and `noreferrer` hid each citation from the
 * publisher's referrer logs. save() now writes `rel="noopener"`.
 *
 * This filter brings already-saved blocks into line as they render, so stored
 * posts and save() stay as they are and no deprecation is involved. It also
 * lets a site choose its own value through the
 * `bibliography_builder_citation_link_rel` filter: return
 * `'nofollow noopener'` to restore the old advice to search engines, or an
 * empty string to drop the attribute. Only the two values Borges ever saved on
 * entry links are replaced; the Cite / Export links of older markup (which
 * carry `download`) and any `rel` edited by hand are left alone.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The `rel` value citation links render with.
 *
 * Tokens are lowercased, deduplicated, and limited to letters, digits, and
 * `-`, so a filter cannot break out of the attribute.
 *
 * @return string Space-separated link types; empty for no `rel`.
 */
function bibliography_builder_citation_link_rel() {
	/**
	 * Filter the `rel` attribute of links in bibliography entries.
	 *
	 * @param string $rel Space-separated link types. Default 'noopener'.
	 */
	$rel    = apply_filters( 'bibliography_builder_citation_link_rel', 'noopener' );
	$tokens = preg_split( '/\s+/', strtolower( is_string( $rel ) ? $rel : '' ), -1, PREG_SPLIT_NO_EMPTY );
	$tokens = array_filter(
		false === $tokens ? array() : $tokens,
		static function ( $token ) {
			return 1 === preg_match( '/^[a-z0-9-]+$/', $token );
		}
	);

	return implode( ' ', array_values( array_unique( $tokens ) ) );
}

/**
 * Give the citation links in a rendered block the filtered `rel`.
 *
 * Hooked to `render_block_bibliography-builder/bibliography`.
 *
 * @param mixed $block_content Rendered block HTML; filters can pass any value.
 * @return mixed
 */
function bibliography_builder_filter_citation_link_rel( $block_content ) {
	if ( ! is_string( $block_content ) || false === strpos( $block_content, '<a ' ) ) {
		return $block_content;
	}

	$rel = bibliography_builder_citation_link_rel();

	if ( 'noopener' === $rel && false === strpos( $block_content, 'rel="nofollow noopener noreferrer"' ) ) {
		return $block_content;
	}

	$replacement = '' === $rel ? '' : ' rel="' . $rel . '"';
	$result      = preg_replace_callback(
		'/<a\s[^>]*>/',
		static function ( $tag ) use ( $replacement ) {
			if ( preg_match( '/\sdownload[\s>=]/', $tag[0] ) ) {
				return $tag[0];
			}

			$replaced = preg_replace( '/ rel="(?:nofollow noopener noreferrer|noopener)"/', $replacement, $tag[0], 1 );

			return null === $replaced ? $tag[0] : $replaced;
		},
		$block_content
	);

	return null === $result ? $block_content : $result;
}

add_filter( 'render_block_bibliography-builder/bibliography', 'bibliography_builder_filter_citation_link_rel' );
