<?php
/**
 * Optional Google Books API key for the ISBN fallback.
 *
 * Without a key, Google Books lookups share Google's anonymous daily quota
 * with every other keyless caller, and that quota runs out. A site can supply
 * its own key with the `BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY` constant in
 * wp-config.php or the `bibliography_builder_google_books_api_key` filter,
 * which receives the constant's value.
 *
 * There is deliberately no stored option or settings screen: the plugin
 * persists no settings (see docs/current-metrics.md). The key is a server-side
 * secret, never sent to the browser and only added to requests to the fixed
 * Google Books host.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reduce a candidate API key to the characters Google API keys use.
 *
 * Google API keys are ASCII letters, digits, `-`, and `_`. Anything else is
 * stripped, so a pasted key with stray whitespace or quotes still works and
 * nothing unexpected reaches the request URL.
 *
 * @param mixed $value Candidate key.
 * @return string The cleaned key, or an empty string.
 */
function bibliography_builder_sanitize_google_books_api_key( $value ) {
	if ( ! is_string( $value ) ) {
		return '';
	}

	return substr( (string) preg_replace( '/[^A-Za-z0-9_-]/', '', $value ), 0, 100 );
}

/**
 * The Google Books API key to use, or an empty string for anonymous lookups.
 *
 * @return string
 */
function bibliography_builder_google_books_api_key() {
	$key = defined( 'BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY' )
		? (string) constant( 'BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY' )
		: '';

	/**
	 * Filters the Google Books API key used for the ISBN fallback.
	 *
	 * @param string $key The `BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY` value, or ''.
	 */
	return bibliography_builder_sanitize_google_books_api_key(
		apply_filters( 'bibliography_builder_google_books_api_key', $key )
	);
}
