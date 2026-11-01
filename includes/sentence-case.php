<?php
/**
 * Sentence case for styles that print titles that way.
 *
 * APA 7, Vancouver (NLM), and IEEE print the titles of works in sentence
 * case ("The origin of species"), but resolved records and most imports
 * store them in title case ("The Origin of Species"), and none of the
 * bundled CSL files changes case. The formatter therefore converts a copy of
 * the title before citeproc-php renders it. The stored CSL is never changed,
 * so another style, the JSON-LD, COinS, and every export keep the title as
 * entered.
 *
 * A word's capitals cannot tell a proper noun from an ordinary word, so the
 * conversion is cautious:
 *
 * - It runs only on a title that reads as title case: some word after the
 *   first is capitalized, and no word of four or more letters is lowercase
 *   (a title already in sentence case keeps its proper nouns).
 * - It keeps acronyms and words with capitals inside (DNA, iPhone, McCarthy),
 *   words with digits (COVID-19), the pronoun "I", and single capitals other
 *   than "A" (vitamin D).
 * - It keeps the first word, and capitalizes the first word after a colon,
 *   question mark, exclamation mark, or dash where the style does (APA,
 *   IEEE; NLM lowercases it).
 * - It skips titles in another language, by the CSL `language` field, and
 *   entries whose `custom` field sets `borges-keep-title-case`, the editor's
 *   "Keep title capitalization as entered" checkbox.
 *
 * `styles.json` turns it on per style with `sentenceCase`: `scope` is
 * `works` (titles of every work but legal sources, periodicals, and
 * software, plus the book a chapter or entry appears in) or `parts` (only
 * the titles of articles, chapters, and papers, which IEEE quotes; book
 * titles keep title case), and `subtitle` is `capitalize` or `lowercase`.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Version of the conversion rules below, part of the formatter's cache keys:
 * raise it whenever a change to them changes any converted title.
 */
const BIBLIOGRAPHY_BUILDER_SENTENCE_CASE_VERSION = 1;

/**
 * The CSL `custom` key that keeps an entry's title as entered.
 */
const BIBLIOGRAPHY_BUILDER_KEEP_TITLE_CASE_KEY = 'borges-keep-title-case';

/**
 * Words title case leaves lowercase, which say nothing about the casing.
 *
 * @return string[]
 */
function bibliography_builder_sentence_case_minor_words() {
	return array(
		'a',
		'an',
		'and',
		'as',
		'at',
		'but',
		'by',
		'en',
		'for',
		'from',
		'if',
		'in',
		'into',
		'nor',
		'of',
		'off',
		'on',
		'onto',
		'or',
		'over',
		'per',
		'so',
		'the',
		'to',
		'up',
		'upon',
		'via',
		'vs',
		'with',
		'yet',
	);
}

/**
 * Types whose own title a `works` style leaves alone: legal sources (cited
 * by their own rules), periodicals (a journal's name), and software (a
 * product name).
 *
 * @return string[]
 */
function bibliography_builder_sentence_case_skipped_types() {
	return array( 'bill', 'hearing', 'legal_case', 'legislation', 'periodical', 'regulation', 'software', 'treaty' );
}

/**
 * Types whose container is a book (an edited volume or reference work), whose
 * title a `works` style also sentence-cases. Proceedings are left out: their
 * titles name a conference, a proper noun.
 *
 * @return string[]
 */
function bibliography_builder_sentence_case_book_container_types() {
	return array( 'chapter', 'entry-dictionary', 'entry-encyclopedia' );
}

/**
 * Whether a CSL item is in English, or says nothing about its language.
 *
 * @param array $csl CSL-JSON item.
 * @return bool
 */
function bibliography_builder_sentence_case_is_english( $csl ) {
	if ( ! isset( $csl['language'] ) || ! is_string( $csl['language'] ) || '' === trim( $csl['language'] ) ) {
		return true;
	}

	$language = strtolower( trim( $csl['language'] ) );

	return 'en' === $language || 0 === strpos( $language, 'en-' ) || 0 === strpos( $language, 'en_' )
		|| 'english' === $language || 'eng' === $language;
}

/**
 * Whether the entry asks to keep its title as entered.
 *
 * @param array $csl CSL-JSON item.
 * @return bool
 */
function bibliography_builder_keeps_title_case( $csl ) {
	return isset( $csl['custom'] ) && is_array( $csl['custom'] )
		&& ! empty( $csl['custom'][ BIBLIOGRAPHY_BUILDER_KEEP_TITLE_CASE_KEY ] );
}

/**
 * The CSL fields a style sentence-cases for one item.
 *
 * @param array      $csl           CSL-JSON item.
 * @param array|null $sentence_case The style's `sentenceCase` settings.
 * @return string[]
 */
function bibliography_builder_sentence_case_fields( $csl, $sentence_case ) {
	if ( ! is_array( $sentence_case ) || ! isset( $csl['type'] ) || ! is_string( $csl['type'] ) ) {
		return array();
	}

	$type = $csl['type'];

	if ( 'parts' === ( isset( $sentence_case['scope'] ) ? $sentence_case['scope'] : '' ) ) {
		return in_array( $type, bibliography_builder_save_container_title_types(), true ) ? array( 'title' ) : array();
	}

	if ( in_array( $type, bibliography_builder_sentence_case_skipped_types(), true ) ) {
		return array();
	}

	return in_array( $type, bibliography_builder_sentence_case_book_container_types(), true )
		? array( 'title', 'container-title' )
		: array( 'title' );
}

/**
 * Convert the titles a style prints in sentence case, on a copy of the item.
 *
 * @param array      $csl           CSL-JSON item, as prepared for the formatter.
 * @param array|null $sentence_case The style's `sentenceCase` settings.
 * @return array
 */
function bibliography_builder_sentence_case_item( $csl, $sentence_case ) {
	if ( bibliography_builder_keeps_title_case( $csl ) || ! bibliography_builder_sentence_case_is_english( $csl ) ) {
		return $csl;
	}

	$capitalize_subtitle = ! is_array( $sentence_case )
		|| ! isset( $sentence_case['subtitle'] )
		|| 'lowercase' !== $sentence_case['subtitle'];

	foreach ( bibliography_builder_sentence_case_fields( $csl, $sentence_case ) as $field ) {
		if ( isset( $csl[ $field ] ) && is_string( $csl[ $field ] ) ) {
			$csl[ $field ] = bibliography_builder_sentence_case( $csl[ $field ], $capitalize_subtitle );
		}
	}

	return $csl;
}

/**
 * Convert a title-case title to sentence case.
 *
 * A title that does not read as title case (see the file comment) is
 * returned unchanged.
 *
 * @param string $title               Title.
 * @param bool   $capitalize_subtitle Capitalize the first word after a colon,
 *                                    question mark, exclamation mark, or dash.
 * @return string
 */
function bibliography_builder_sentence_case( $title, $capitalize_subtitle = true ) {
	// A word: letters, marks, and digits, with apostrophes inside.
	$pattern = "/[\\p{L}\\p{N}][\\p{L}\\p{M}\\p{N}'\u{2019}]*/u";

	if ( (int) preg_match_all( $pattern, $title, $matches, PREG_OFFSET_CAPTURE ) < 1 ) {
		return $title;
	}

	$words  = array();
	$cursor = 0;

	foreach ( $matches[0] as $match ) {
		$text   = $match[0];
		$offset = $match[1];
		$gap    = substr( $title, $cursor, $offset - $cursor );

		$words[] = array(
			'text'   => $text,
			'offset' => $offset,
			// A colon, question or exclamation mark, or a spaced or em dash
			// before the word starts a subtitle. A period does not: "U.S.".
			'break'  => array() !== $words
				&& 1 === preg_match( "/[:?!\u{2014}]|\\s[\u{2013}-]\\s/u", $gap ),
		);
		$cursor  = $offset + strlen( $text );
	}

	if ( ! bibliography_builder_is_title_case( $words ) ) {
		return $title;
	}

	$result = $title;

	// Replace from the end, so earlier byte offsets stay valid.
	foreach ( array_reverse( $words, true ) as $index => $word ) {
		$text = $word['text'];

		$lowercase_article = $word['break'] && ! $capitalize_subtitle;

		if ( 0 === $index || bibliography_builder_sentence_case_keeps_word( $text, $lowercase_article ) ) {
			continue;
		}

		$first = mb_substr( $text, 0, 1, 'UTF-8' );
		$rest  = mb_substr( $text, 1, null, 'UTF-8' );
		$cased = $word['break'] && $capitalize_subtitle
			? mb_strtoupper( $first, 'UTF-8' )
			: mb_strtolower( $first, 'UTF-8' );

		$result = substr_replace( $result, $cased . $rest, $word['offset'], strlen( $text ) );
	}

	return $result;
}

/**
 * Whether a title's words read as title case: a word after the first is
 * capitalized, and no word of four or more letters, other than a minor word
 * or one that keeps its capitals, starts lowercase.
 *
 * @param array<int, array{text: string, offset: int, break: bool}> $words Words.
 * @return bool
 */
function bibliography_builder_is_title_case( $words ) {
	$capitalized = false;
	$minor       = bibliography_builder_sentence_case_minor_words();

	foreach ( $words as $index => $word ) {
		$text  = $word['text'];
		$first = mb_substr( $text, 0, 1, 'UTF-8' );

		// The first word is capitalized in either case, and a word that keeps
		// its capitals (iPhone) says nothing either.
		if (
			0 === $index
			|| ! preg_match( '/\p{L}/u', $first )
			|| bibliography_builder_sentence_case_keeps_word( $text )
		) {
			continue;
		}

		if ( mb_strtolower( $first, 'UTF-8' ) === $first && mb_strtoupper( $first, 'UTF-8' ) !== $first ) {
			if ( mb_strlen( $text, 'UTF-8' ) >= 4 && ! in_array( mb_strtolower( $text, 'UTF-8' ), $minor, true ) ) {
				return false;
			}

			continue;
		}

		$capitalized = true;
	}

	return $capitalized;
}

/**
 * Whether a word keeps its capitals: an acronym or a word with a capital
 * after its first letter (DNA, iPhone, McCarthy, O'Brien), a word with a
 * digit (COVID-19's "COVID", "3D"), the pronoun "I" and its contractions
 * (I'm, I've), or a single capital (vitamin A, hepatitis B). Title case
 * lowercases the article "a" inside a title, so a capital A there is a name;
 * only at the start of a subtitle, where title case capitalizes the article,
 * does it lowercase for NLM's lowercase subtitles.
 *
 * @param string $word             Word.
 * @param bool   $lowercase_article Whether a lone "A" is a subtitle's first
 *                                  word that the style lowercases.
 * @return bool
 */
function bibliography_builder_sentence_case_keeps_word( $word, $lowercase_article = false ) {
	if ( preg_match( '/\p{N}/u', $word ) ) {
		return true;
	}

	if ( 1 === mb_strlen( $word, 'UTF-8' ) ) {
		return mb_strtoupper( $word, 'UTF-8' ) === $word && ! ( $lowercase_article && 'A' === $word );
	}

	if ( 1 === preg_match( "/^I['\x{2019}]\p{L}+$/u", $word ) ) {
		return true;
	}

	return 1 === preg_match( '/\p{Lu}/u', mb_substr( $word, 1, null, 'UTF-8' ) );
}
