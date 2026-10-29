<?php
/**
 * Entry display for the save() port: display text and inline markup, italic
 * fields, display segments, author names and repeated-author prefixes, and
 * link splitting, mirroring the display helpers `src/save-markup.js` calls.
 *
 * Moved unchanged from save-markup.php (refactor memo, Phase E). The parity
 * fixtures in `tests/fixtures/save-parity/` pin it to the JS output.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * A citation's `csl` value exactly as stored, for re-serialization: an empty
 * object stays `stdClass` so it is written back as `{}`.
 *
 * @param mixed $citation Citation record.
 * @return mixed
 */
function bibliography_builder_citation_raw_csl( $citation ) {
	return is_array( $citation ) && array_key_exists( 'csl', $citation ) ? $citation['csl'] : null;
}

/**
 * A citation's CSL-JSON object, or an empty array.
 *
 * @param mixed $citation Citation record.
 * @return array
 */
function bibliography_builder_citation_csl( $citation ) {
	return is_array( $citation ) && isset( $citation['csl'] ) && is_array( $citation['csl'] )
		? $citation['csl']
		: array();
}

// ── Display text: src/lib/formatting/index.js ────────────────────────────────

/**
 * `getDisplayText()`.
 *
 * @param array $citation Citation record.
 * @return string
 */
function bibliography_builder_save_display_text( $citation ) {
	foreach ( array( 'displayOverride', 'formattedText' ) as $field ) {
		if ( isset( $citation[ $field ] ) && bibliography_builder_js_truthy( $citation[ $field ] ) ) {
			return bibliography_builder_js_string( $citation[ $field ] );
		}
	}

	$title = bibliography_builder_csl_field( bibliography_builder_citation_csl( $citation ), 'title' );

	return bibliography_builder_js_truthy( $title ) ? bibliography_builder_js_string( $title ) : '';
}

/**
 * `parseInlineMarkup()`: plain text, and the ranges `<i>`/`<em>` italicize.
 * Every other tag is dropped. Offsets are bytes.
 *
 * @param mixed $text Text that may contain inline HTML.
 * @return array{text: string, ranges: array<int, array{start: int, end: int}>}
 */
function bibliography_builder_save_parse_inline_markup( $text ) {
	$value  = (string) $text;
	$plain  = '';
	$ranges = array();
	$cursor = 0;
	$depth  = 0;
	$start  = 0;

	// Mirrors INLINE_TAG_PATTERN in src/lib/formatting/index.js.
	$pattern = '/<\/?([A-Za-z][A-Za-z0-9]*)\b[^<>]*>/';

	if ( 0 < (int) preg_match_all( $pattern, $value, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE ) ) {
		foreach ( $matches as $match ) {
			$tag    = $match[0][0];
			$offset = $match[0][1];
			$plain .= substr( $value, $cursor, $offset - $cursor );
			$cursor = $offset + strlen( $tag );

			if ( ! in_array( strtolower( $match[1][0] ), array( 'i', 'em' ), true ) ) {
				continue;
			}

			if ( '/' === $tag[1] ) {
				if ( $depth > 0 ) {
					--$depth;

					if ( 0 === $depth && strlen( $plain ) > $start ) {
						$ranges[] = array(
							'start' => $start,
							'end'   => strlen( $plain ),
						);
					}
				}
			} elseif ( '/>' !== substr( $tag, -2 ) ) {
				if ( 0 === $depth ) {
					$start = strlen( $plain );
				}

				++$depth;
			}
		}
	}

	$plain .= substr( $value, $cursor );

	// An unclosed <i> runs to the end, as it would in a browser.
	if ( $depth > 0 && strlen( $plain ) > $start ) {
		$ranges[] = array(
			'start' => $start,
			'end'   => strlen( $plain ),
		);
	}

	return array(
		'text'   => $plain,
		'ranges' => $ranges,
	);
}

/**
 * `stripInlineMarkup()`.
 *
 * @param mixed $text Text that may contain inline HTML.
 * @return string
 */
function bibliography_builder_save_strip_inline_markup( $text ) {
	$parsed = bibliography_builder_save_parse_inline_markup( $text );

	return $parsed['text'];
}

/**
 * `getPlainDisplayText()`.
 *
 * @param array $citation Citation record.
 * @return string
 */
function bibliography_builder_save_plain_display_text( $citation ) {
	return bibliography_builder_save_strip_inline_markup( bibliography_builder_save_display_text( $citation ) );
}

/**
 * `CONTAINER_TITLE_TYPES`: types whose container title, not their own title,
 * is italicized.
 *
 * @return string[]
 */
function bibliography_builder_save_container_title_types() {
	return array(
		'article-journal',
		'article-magazine',
		'article-newspaper',
		'chapter',
		'entry',
		'paper-conference',
		'post',
		'post-weblog',
		'review',
		'review-book',
	);
}

/**
 * `getItalicizedFields()`.
 *
 * @param array $csl CSL-JSON item.
 * @return array
 */
function bibliography_builder_save_italic_fields( $csl ) {
	$title_types     = array(
		'book',
		'broadcast',
		'collection',
		'dataset',
		'entry-dictionary',
		'entry-encyclopedia',
		'graphic',
		'interview',
		'legal_case',
		'legislation',
		'manuscript',
		'map',
		'motion_picture',
		'musical_score',
		'pamphlet',
		'patent',
		'performance',
		'periodical',
		'regulation',
		'report',
		'software',
		'song',
		'speech',
		'standard',
		'thesis',
		'treaty',
		'webpage',
	);
	$container_types = bibliography_builder_save_container_title_types();
	$type            = bibliography_builder_csl_field( $csl, 'type' );

	if ( in_array( $type, $title_types, true ) ) {
		return array( bibliography_builder_csl_field( $csl, 'title' ) );
	}

	if ( in_array( $type, $container_types, true ) ) {
		return array( bibliography_builder_csl_field( $csl, 'container-title' ) );
	}

	return array();
}

/**
 * `getShortContainerTitle()`: the journal abbreviation, for a type whose
 * container title is italicized, without inline markup; null when there is
 * none.
 *
 * @param array $csl CSL-JSON item.
 * @return string|null
 */
function bibliography_builder_save_short_container_title( $csl ) {
	$short = bibliography_builder_csl_field( $csl, 'container-title-short' );
	$type  = bibliography_builder_csl_field( $csl, 'type' );

	if ( ! in_array( $type, bibliography_builder_save_container_title_types(), true )
		|| ! bibliography_builder_js_truthy( $short ) ) {
		return null;
	}

	$needle = bibliography_builder_save_strip_inline_markup( bibliography_builder_js_string( $short ) );

	return '' === $needle ? null : $needle;
}

/**
 * `isQuotedAt()`: the match is wrapped in straight or curly double quotes,
 * allowing punctuation before the closing quote (Chicago's `"Title."`), as
 * save() does with `quoteAwareItalics`.
 *
 * @param string $text  Display text.
 * @param int    $start Byte offset.
 * @param int    $end   Byte offset.
 * @return bool
 */
function bibliography_builder_save_is_quoted( $text, $start, $end ) {
	$before = substr( $text, 0, $start );
	$after  = substr( $text, $end );
	$after  = substr( $after, strspn( $after, '.,;:!?' ) );

	$opens  = '"' === substr( $before, -1 ) || "\u{201C}" === substr( $before, -3 );
	$closes = '"' === substr( $after, 0, 1 ) || "\u{201D}" === substr( $after, 0, 3 );

	return $opens && $closes;
}

/**
 * `getUrlRanges()`: where the text's URLs are, matched as
 * `splitTextIntoLinkParts()` matches them, so a title is never italicized
 * inside a link (eLife is part of its own DOIs). Offsets are bytes.
 *
 * @param string $text Display text.
 * @return array<int, array{start: int, end: int}>
 */
function bibliography_builder_save_url_ranges( $text ) {
	preg_match_all(
		'#https?://[^' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']+#u',
		$text,
		$matches,
		PREG_OFFSET_CAPTURE
	);

	$ranges = array();
	foreach ( $matches[0] as $match ) {
		$ranges[] = array(
			'start' => $match[1],
			'end'   => $match[1] + strlen( $match[0] ),
		);
	}

	return $ranges;
}

/**
 * `foldQuotes()`: ‘ and ’ as ', “ and ” as ", so a stored straight apostrophe
 * still finds the curly one citeproc printed. In UTF-8 a curly mark is three
 * bytes and a straight one one, so folding moves every later byte; the map
 * gives, for each byte offset in the folded text (and its end), the offset of
 * the same byte in the original. JS needs no map: each mark is one UTF-16 unit.
 *
 * @param string $text Text.
 * @return array{text: string, offsets: array<int, int>}
 */
function bibliography_builder_save_fold_quotes( $text ) {
	$folds   = array(
		"\u{2018}" => "'",
		"\u{2019}" => "'",
		"\u{201C}" => '"',
		"\u{201D}" => '"',
	);
	$folded  = '';
	$offsets = array();
	$cursor  = 0;
	$length  = strlen( $text );

	// Copy the text between curly marks whole; only the marks shrink. A
	// \xE2\x80 that starts another character (an en dash, say) is copied.
	while ( $cursor < $length ) {
		$next = strpos( $text, "\xE2\x80", $cursor );
		$mark = false === $next ? '' : substr( $text, $next, 3 );

		if ( false === $next || ! isset( $folds[ $mark ] ) ) {
			$stop    = false === $next ? $length : $next + 2;
			$folded .= substr( $text, $cursor, $stop - $cursor );
			$cursor  = bibliography_builder_save_append_offsets( $offsets, $cursor, $stop );
			continue;
		}

		if ( $next > $cursor ) {
			$folded .= substr( $text, $cursor, $next - $cursor );
			bibliography_builder_save_append_offsets( $offsets, $cursor, $next );
		}

		$folded   .= $folds[ $mark ];
		$offsets[] = $next;
		$cursor    = $next + 3;
	}

	$offsets[] = $length;

	return array(
		'text'    => $folded,
		'offsets' => $offsets,
	);
}

/**
 * `foldCase()`, on text `bibliography_builder_save_fold_quotes()` folded:
 * each character whose lowercase is one character is lowercased. A few
 * change their UTF-8 length (the Kelvin sign is three bytes, k one), so the
 * offset map is carried through: each byte of a folded character maps to the
 * original offset of the matching byte, or the character's last byte.
 *
 * @param array{text: string, offsets: array<int, int>} $folded Text folded by
 *                                                              bibliography_builder_save_fold_quotes().
 * @return array{text: string, offsets: array<int, int>}
 */
function bibliography_builder_save_fold_case( $folded ) {
	$text    = '';
	$offsets = array();
	$cursor  = 0;

	foreach ( (array) preg_split( '//u', $folded['text'], -1, PREG_SPLIT_NO_EMPTY ) as $character ) {
		$character = (string) $character;
		$lower     = mb_strtolower( $character, 'UTF-8' );
		$lower     = 1 === mb_strlen( $lower, 'UTF-8' ) ? $lower : $character;
		$bytes     = strlen( $character );
		$length    = strlen( $lower );

		for ( $byte = 0; $byte < $length; $byte++ ) {
			$offsets[] = $folded['offsets'][ $cursor + min( $byte, $bytes - 1 ) ];
		}

		$text   .= $lower;
		$cursor += $bytes;
	}

	$offsets[] = $folded['offsets'][ $cursor ];

	return array(
		'text'    => $text,
		'offsets' => $offsets,
	);
}

/**
 * Append each byte offset from $from up to, not including, $to.
 *
 * @param array<int, int> $offsets Offset map, appended to in place.
 * @param int             $from    First offset.
 * @param int             $to      Offset to stop before.
 * @return int $to, where the copy stopped.
 */
function bibliography_builder_save_append_offsets( &$offsets, $from, $to ) {
	for ( $offset = $from; $offset < $to; $offset++ ) {
		$offsets[] = $offset;
	}

	return $to;
}

/**
 * `findLastRange()` with `quoteFoldedItalics`: the last occurrence of a value
 * that is neither quoted, inside a URL, nor overlapping a range already
 * found, with quotation marks folded on both sides. The search runs on the
 * folded text; offsets returned and checked are the original text's bytes.
 * UTF-8 substring search finds the same occurrences as JavaScript's UTF-16
 * search.
 *
 * With `$fold_case`, case is folded too (`caseFoldedItalics`).
 *
 * @param string $text       Display text.
 * @param string $value      Field value.
 * @param array  $ranges     Ranges found so far.
 * @param array  $url_ranges URL ranges in the text.
 * @param bool   $fold_case  Match without regard to case.
 * @return array|null
 */
function bibliography_builder_save_find_last_range(
	$text,
	$value,
	$ranges,
	$url_ranges = array(),
	$fold_case = false
) {
	$folded = bibliography_builder_save_fold_quotes( $text );
	$needle = bibliography_builder_save_fold_quotes( $value );

	if ( $fold_case ) {
		$folded = bibliography_builder_save_fold_case( $folded );
		$needle = bibliography_builder_save_fold_case( $needle );
	}

	$needle = $needle['text'];
	$search = $folded['text'];
	$at     = strrpos( $search, $needle );

	while ( false !== $at ) {
		$start    = $folded['offsets'][ $at ];
		$end      = $folded['offsets'][ $at + strlen( $needle ) ];
		$overlaps = false;

		foreach ( array_merge( $ranges, $url_ranges ) as $range ) {
			$overlaps = $overlaps || ( $start < $range['end'] && $end > $range['start'] );
		}

		if ( ! bibliography_builder_save_is_quoted( $text, $start, $end ) && ! $overlaps ) {
			return array(
				'start' => $start,
				'end'   => $end,
			);
		}

		if ( 0 === $at ) {
			return null;
		}

		// lastIndexOf( value, at - 1 ): the last match starting before $at.
		$at = strrpos( substr( $search, 0, $at - 1 + strlen( $needle ) ), $needle );
	}

	return null;
}

/**
 * `getDisplaySegments()`.
 *
 * With `$roman_titles` no title is italicized, only inline `<i>`/`<em>` in
 * the text: case names in OSCOLA's table of cases (OSCOLA 5 §1.6.2).
 *
 * @param array $citation     Citation record.
 * @param bool  $roman_titles Leave titles roman (`romanTitles`).
 * @return array<int, array{text: string, italic: bool}>
 */
function bibliography_builder_save_display_segments( $citation, $roman_titles = false ) {
	$raw_text      = bibliography_builder_save_display_text( $citation );
	$parsed        = bibliography_builder_save_parse_inline_markup( $raw_text );
	$text          = $parsed['text'];
	$markup_ranges = $parsed['ranges'];

	$override = isset( $citation['displayOverride'] ) && bibliography_builder_js_truthy( $citation['displayOverride'] );

	if ( '' === $text || $override ) {
		return array() !== $markup_ranges
			? bibliography_builder_save_build_segments( $text, $markup_ranges )
			: array(
				array(
					'text'   => $text,
					'italic' => false,
				),
			);
	}

	$title_ranges = array();
	$url_ranges   = bibliography_builder_save_url_ranges( $text );

	$fields = $roman_titles
		? array()
		: bibliography_builder_save_italic_fields( bibliography_builder_citation_csl( $citation ) );

	foreach ( $fields as $value ) {
		if ( ! bibliography_builder_js_truthy( $value ) ) {
			continue;
		}

		$needle = bibliography_builder_save_strip_inline_markup( bibliography_builder_js_string( $value ) );

		if ( '' === $needle ) {
			continue;
		}

		// `caseFoldedItalics`: not as stored, perhaps as the style cased it
		// ("The origin of species" for a stored "The Origin of Species").
		$range = bibliography_builder_save_find_last_range( $text, $needle, $title_ranges, $url_ranges );
		$range = null === $range
			? bibliography_builder_save_find_last_range( $text, $needle, $title_ranges, $url_ranges, true )
			: $range;

		if ( null !== $range ) {
			$title_ranges[] = $range;
		}
	}

	// `shortContainerItalics`: a container title not in the text is looked
	// for as its abbreviation, which IEEE and Vancouver print.
	$short = $roman_titles || array() !== $title_ranges
		? null
		: bibliography_builder_save_short_container_title( bibliography_builder_citation_csl( $citation ) );

	// As stored ("J. Libr. Syst."), else without its periods, as Vancouver
	// prints NLM abbreviations ("J Libr Syst").
	foreach ( null === $short ? array() : array( $short, str_replace( '.', '', $short ) ) as $needle ) {
		$range = array() === $title_ranges && '' !== $needle
			? bibliography_builder_save_find_last_range( $text, $needle, $title_ranges, $url_ranges )
			: null;

		if ( null !== $range ) {
			$title_ranges[] = $range;
		}
	}

	$ranges = bibliography_builder_save_merge_ranges( array_merge( $title_ranges, $markup_ranges ) );

	if ( array() === $ranges ) {
		return array(
			array(
				'text'   => $text,
				'italic' => false,
			),
		);
	}

	return bibliography_builder_save_build_segments( $text, $ranges );
}

/**
 * `mergeRanges()`: sorted, with overlapping ranges joined. Ranges that only
 * touch stay apart.
 *
 * @param array<int, array{start: int, end: int}> $ranges Ranges.
 * @return array<int, array{start: int, end: int}>
 */
function bibliography_builder_save_merge_ranges( $ranges ) {
	usort(
		$ranges,
		static function ( $left, $right ): int {
			return $left['start'] - $right['start'];
		}
	);

	$merged = array();
	$start  = null;
	$end    = 0;

	foreach ( $ranges as $range ) {
		if ( null !== $start && $range['start'] < $end ) {
			$end = max( $end, $range['end'] );
			continue;
		}

		if ( null !== $start ) {
			$merged[] = array(
				'start' => $start,
				'end'   => $end,
			);
		}

		$start = $range['start'];
		$end   = $range['end'];
	}

	if ( null !== $start ) {
		$merged[] = array(
			'start' => $start,
			'end'   => $end,
		);
	}

	return $merged;
}

/**
 * `buildSegments()`.
 *
 * @param string                                  $text   Plain display text.
 * @param array<int, array{start: int, end: int}> $ranges Sorted italic ranges.
 * @return array<int, array{text: string, italic: bool}>
 */
function bibliography_builder_save_build_segments( $text, $ranges ) {
	$segments = array();
	$cursor   = 0;

	foreach ( $ranges as $range ) {
		if ( $range['start'] > $cursor ) {
			$segments[] = array(
				'text'   => substr( $text, $cursor, $range['start'] - $cursor ),
				'italic' => false,
			);
		}

		$segments[] = array(
			'text'   => substr( $text, $range['start'], $range['end'] - $range['start'] ),
			'italic' => true,
		);
		$cursor     = $range['end'];
	}

	if ( $cursor < strlen( $text ) ) {
		$segments[] = array(
			'text'   => substr( $text, $cursor ),
			'italic' => false,
		);
	}

	return $segments;
}

// ── MLA and OSCOLA repeated authors: src/lib/repeated-authors.js ────────────

/**
 * `getRepeatedAuthorMark()`: three U+2011 non-breaking hyphens (MLA), or
 * OSCOLA's double em dash.
 *
 * @param mixed $style_key Citation style.
 * @return string
 */
function bibliography_builder_save_repeated_author_mark( $style_key ) {
	return 'oscola' === $style_key ? "\u{2014}\u{2014}" : "\u{2011}\u{2011}\u{2011}";
}

/**
 * `namePart()`.
 *
 * @param mixed  $name CSL name.
 * @param string $key  Name part.
 * @return string
 */
function bibliography_builder_save_name_part( $name, $key ) {
	if ( is_object( $name ) ) {
		$name = get_object_vars( $name );
	}

	return is_array( $name ) && isset( $name[ $key ] ) && is_string( $name[ $key ] ) ? $name[ $key ] : '';
}

/**
 * `getAuthorKey()`.
 *
 * @param mixed $citation   Citation record.
 * @param bool  $first_only Key only the first author.
 * @return string|null
 */
function bibliography_builder_save_author_key( $citation, $first_only = false ) {
	$csl     = bibliography_builder_citation_csl( $citation );
	$authors = isset( $csl['author'] ) ? $csl['author'] : null;

	if ( ! is_array( $authors ) || ! bibliography_builder_is_list_array( $authors ) || array() === $authors ) {
		return null;
	}

	$keys  = array( 'family', 'given', 'literal', 'suffix', 'dropping-particle', 'non-dropping-particle', 'ORCID' );
	$names = array();

	if ( $first_only ) {
		$authors = array_slice( $authors, 0, 1 );
	}

	foreach ( $authors as $name ) {
		$parts = array();

		foreach ( $keys as $key ) {
			$parts[] = bibliography_builder_save_name_part( $name, $key );
		}

		$names[] = implode( "\u{0001}", $parts );
	}

	return implode( "\u{0002}", $names );
}

/**
 * `joinParts()`: the non-empty parts, joined with spaces.
 *
 * @param array $parts Strings.
 * @return string
 */
function bibliography_builder_save_join_name_parts( $parts ) {
	return implode(
		' ',
		array_filter(
			$parts,
			static function ( $part ) {
				return '' !== $part;
			}
		)
	);
}

/**
 * `getInvertedName()`: a name as the MLA style writes the first author.
 *
 * @param mixed $name CSL name.
 * @return string
 */
function bibliography_builder_save_inverted_name( $name ) {
	$literal = bibliography_builder_save_name_part( $name, 'literal' );

	if ( '' !== $literal ) {
		return $literal;
	}

	if ( '' === bibliography_builder_save_name_part( $name, 'family' ) ) {
		return '';
	}

	$parts = array(
		bibliography_builder_save_join_name_parts(
			array(
				bibliography_builder_save_name_part( $name, 'non-dropping-particle' ),
				bibliography_builder_save_name_part( $name, 'family' ),
			)
		),
		bibliography_builder_save_join_name_parts(
			array(
				bibliography_builder_save_name_part( $name, 'given' ),
				bibliography_builder_save_name_part( $name, 'dropping-particle' ),
			)
		),
		bibliography_builder_save_name_part( $name, 'suffix' ),
	);

	return implode(
		', ',
		array_filter(
			$parts,
			static function ( $part ) {
				return '' !== $part;
			}
		)
	);
}

/**
 * `getDisplayName()`: a name as the MLA style writes the second author.
 *
 * @param mixed $name CSL name.
 * @return string
 */
function bibliography_builder_save_display_name( $name ) {
	$literal = bibliography_builder_save_name_part( $name, 'literal' );

	if ( '' !== $literal ) {
		return $literal;
	}

	if ( '' === bibliography_builder_save_name_part( $name, 'family' ) ) {
		return '';
	}

	return bibliography_builder_save_join_name_parts(
		array(
			bibliography_builder_save_name_part( $name, 'given' ),
			bibliography_builder_save_name_part( $name, 'dropping-particle' ),
			bibliography_builder_save_name_part( $name, 'non-dropping-particle' ),
			bibliography_builder_save_name_part( $name, 'family' ),
			bibliography_builder_save_name_part( $name, 'suffix' ),
		)
	);
}

/**
 * `getAuthorPrefix()`: the author names an MLA entry starts with, without the
 * period after them, built from the CSL names.
 *
 * @param array $authors CSL names.
 * @return string|null
 */
function bibliography_builder_save_author_prefix( $authors ) {
	$first = bibliography_builder_save_inverted_name( $authors[0] );
	$block = $first;

	if ( 2 === count( $authors ) ) {
		$second = bibliography_builder_save_display_name( $authors[1] );
		$block  = '' === $second ? '' : $first . ', and ' . $second;
	} elseif ( count( $authors ) >= 3 ) {
		$block = $first . ', et al.';
	}

	if ( '' === $first || '' === $block ) {
		return null;
	}

	return '.' === substr( $block, -1 ) ? substr( $block, 0, -1 ) : $block;
}

/**
 * Whether a citation field holds a JS-truthy value.
 *
 * @param array  $citation Citation record.
 * @param string $field    Field name.
 * @return bool
 */
function bibliography_builder_save_has_text( $citation, $field ) {
	return isset( $citation[ $field ] ) && bibliography_builder_js_truthy( $citation[ $field ] );
}

/**
 * `isUnformatted()`: whether formattedText is missing or only the editor's
 * formatting-failure fallback, the title or else the container title.
 *
 * @param array $citation Citation record.
 * @return bool
 */
function bibliography_builder_save_is_unformatted( $citation ) {
	if ( ! bibliography_builder_save_has_text( $citation, 'formattedText' ) ) {
		return true;
	}

	$text = bibliography_builder_js_string( $citation['formattedText'] );
	$csl  = bibliography_builder_citation_csl( $citation );

	foreach ( array( 'title', 'container-title' ) as $field ) {
		$value = bibliography_builder_csl_field( $csl, $field );

		if ( is_string( $value ) && $value === $text ) {
			return true;
		}
	}

	return false;
}

/**
 * `getFirstAuthorPrefix()`: the text OSCOLA's dash replaces, the first
 * author as the style writes it ("Hart HLA"), with the comma the dash drops
 * before a title ("Hart HLA,"), or null.
 *
 * @param mixed  $name CSL name.
 * @param string $text Display text.
 * @return string|null
 */
function bibliography_builder_save_first_author_prefix( $name, $text ) {
	if ( '' !== bibliography_builder_save_name_part( $name, 'suffix' )
		|| '' !== bibliography_builder_save_name_part( $name, 'dropping-particle' ) ) {
		return null;
	}

	$literal = bibliography_builder_save_name_part( $name, 'literal' );
	$head    = '' !== $literal
		? $literal
		: bibliography_builder_save_join_name_parts(
			array(
				bibliography_builder_save_name_part( $name, 'non-dropping-particle' ),
				bibliography_builder_save_name_part( $name, 'family' ),
			)
		);

	if ( '' === $head || 0 !== strncmp( $text, $head, strlen( $head ) ) ) {
		return null;
	}

	$prefix = $head;

	$after_head = substr( $text, strlen( $head ) );

	if ( '' === $literal && '' !== bibliography_builder_save_name_part( $name, 'given' )
		&& preg_match( '/^ ([^' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ',]+)/u', $after_head, $initials ) ) {
		$prefix = $head . ' ' . $initials[1];
	}

	$rest = substr( $text, strlen( $prefix ) );

	if ( 0 === strncmp( $rest, ', ', 2 ) ) {
		return $prefix . ',';
	}

	return 0 === strncmp( $rest, ' and ', 5 ) ? $prefix : null;
}

/**
 * `getRepeatedAuthorPrefixes()`: for each citation in display order, the
 * author names MLA 9 replaces with three hyphens, or the first author OSCOLA
 * replaces with a double em dash, or null. OSCOLA's dash never crosses from
 * one of its tables to the next.
 *
 * @param array  $citations Citations in display order.
 * @param string $style_key Citation style.
 * @return array<int, string|null>
 */
function bibliography_builder_save_repeated_author_prefixes( $citations, $style_key ) {
	$citations    = array_values( $citations );
	$prefixes     = array();
	$first_author = 'oscola' === $style_key;
	$groups       = $first_author ? bibliography_builder_save_style_groups( $style_key ) : null;
	$list_of      = static function ( array $citation ) use ( $groups ): ?int {
		return null === $groups
			? null
			: bibliography_builder_save_group_index( bibliography_builder_citation_csl( $citation ), $groups );
	};

	foreach ( $citations as $index => $citation ) {
		$prefixes[ $index ] = null;

		if ( ( 'mla-9' !== $style_key && ! $first_author ) || 0 === $index ) {
			continue;
		}

		$citation = is_array( $citation ) ? $citation : array();

		$previous = is_array( $citations[ $index - 1 ] ) ? $citations[ $index - 1 ] : array();

		// Only formatted entries: a title-only fallback can start with the very
		// names it names.
		if (
			bibliography_builder_save_has_text( $citation, 'displayOverride' )
			|| bibliography_builder_save_is_unformatted( $citation )
			|| (
				! bibliography_builder_save_has_text( $previous, 'displayOverride' )
				&& bibliography_builder_save_is_unformatted( $previous )
			)
		) {
			continue;
		}

		$key = bibliography_builder_save_author_key( $citation, $first_author );

		if ( null === $key || bibliography_builder_save_author_key( $previous, $first_author ) !== $key
			|| $list_of( $citation ) !== $list_of( $previous ) ) {
			continue;
		}

		if ( $first_author ) {
			$prefix   = bibliography_builder_save_first_author_prefix(
				bibliography_builder_citation_csl( $citation )['author'][0],
				bibliography_builder_save_plain_display_text( $citation )
			);
			$previous = bibliography_builder_save_first_author_prefix(
				bibliography_builder_citation_csl( $previous )['author'][0],
				bibliography_builder_save_plain_display_text( $previous )
			);

			// The same name, whatever follows it ("," or " and ").
			if ( null !== $prefix && null !== $previous
				&& preg_replace( '/,$/', '', $prefix ) === preg_replace( '/,$/', '', $previous ) ) {
				$prefixes[ $index ] = $prefix;
			}

			continue;
		}

		$prefix = bibliography_builder_save_author_prefix( bibliography_builder_citation_csl( $citation )['author'] );

		if ( null === $prefix ) {
			continue;
		}

		$start = $prefix . '.';

		if (
			0 !== strncmp( bibliography_builder_save_plain_display_text( $citation ), $start, strlen( $start ) )
			|| 0 !== strncmp( bibliography_builder_save_plain_display_text( $previous ), $start, strlen( $start ) )
		) {
			continue;
		}

		$prefixes[ $index ] = $prefix;
	}

	return $prefixes;
}

/**
 * `splitTrailingUrlPunctuation()`.
 *
 * @param string $url Matched URL text.
 * @return array{0: string, 1: string} Href and trailing punctuation.
 */
function bibliography_builder_save_split_trailing_punctuation( $url ) {
	$href     = $url;
	$trailing = '';

	while ( '' !== $href ) {
		$last = substr( $href, -1 );

		if ( in_array( $last, array( '.', ',', ';', ':', '!', '?' ), true ) ) {
			$trailing = $last . $trailing;
			$href     = substr( $href, 0, -1 );
			continue;
		}

		if ( ')' === $last && substr_count( $href, ')' ) > substr_count( $href, '(' ) ) {
			$trailing = $last . $trailing;
			$href     = substr( $href, 0, -1 );
			continue;
		}

		break;
	}

	return array( $href, $trailing );
}

/**
 * `isLinkableUrl()`: whether `new URL( candidate )` parses with an http(s)
 * scheme. The candidate always starts with `http://` or `https://`, so this
 * only has to reproduce the WHATWG parser's host failures that matter for
 * text a citation can contain.
 *
 * Known limit: an approximation of the WHATWG URL parser, covering empty
 * hosts, forbidden host code points, bad ports, and malformed IPv6 literals.
 *
 * @param string $candidate URL text.
 * @return bool
 */
function bibliography_builder_save_is_linkable_url( $candidate ) {
	if ( 1 !== preg_match( '#^https?:[/\\\\]*([^/\\\\?\#]*)#i', $candidate, $match ) ) {
		return false;
	}

	$authority = $match[1];
	$at        = strrpos( $authority, '@' );
	$host_port = false === $at ? $authority : substr( $authority, $at + 1 );

	if ( '' !== $host_port && '[' === $host_port[0] ) {
		if ( 1 !== preg_match( '/^\[([^\]]*)\](?::(\d*))?$/D', $host_port, $ipv6 ) ) {
			return false;
		}

		$valid_port = ! isset( $ipv6[2] ) || '' === $ipv6[2] || (int) $ipv6[2] <= 65535;

		return $valid_port && false !== filter_var( $ipv6[1], FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 );
	}

	$colon = strpos( $host_port, ':' );
	$host  = false === $colon ? $host_port : substr( $host_port, 0, $colon );
	$port  = false === $colon ? '' : substr( $host_port, $colon + 1 );

	if ( '' === $host || ( '' !== $port && ( ! ctype_digit( $port ) || (int) $port > 65535 ) ) ) {
		return false;
	}

	$host = rawurldecode( $host );

	return 1 !== preg_match( '/[\x00-\x20\x7F#%\/:<>?@\[\\\\\]^|]/', $host );
}

/**
 * `splitTextIntoLinkParts()`.
 *
 * @param string $text       Segment text.
 * @param string $link_label Accessible label for links.
 * @return array<int, array{text: string, link: false}|array{text: string, link: true, href: string, label: string}>
 */
function bibliography_builder_save_link_parts( $text, $link_label ) {
	if ( '' === $text ) {
		return array(
			array(
				'text' => '',
				'link' => false,
			),
		);
	}

	$parts  = array();
	$cursor = 0;

	$pattern = '#https?://[^' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']+#u';

	preg_match_all( $pattern, $text, $matches, PREG_OFFSET_CAPTURE );

	foreach ( $matches[0] as $match ) {
		list( $url, $start ) = $match;

		if ( $start > $cursor ) {
			$parts[] = array(
				'text' => substr( $text, $cursor, $start - $cursor ),
				'link' => false,
			);
		}

		list( $href, $trailing ) = bibliography_builder_save_split_trailing_punctuation( $url );

		if ( ! bibliography_builder_save_is_linkable_url( $href ) ) {
			$parts[] = array(
				'text' => $url,
				'link' => false,
			);
			$cursor  = $start + strlen( $url );
			continue;
		}

		$parts[] = array(
			'text'  => $href,
			'href'  => $href,
			'link'  => true,
			'label' => $link_label,
		);

		if ( '' !== $trailing ) {
			$parts[] = array(
				'text' => $trailing,
				'link' => false,
			);
		}

		$cursor = $start + strlen( $url );
	}

	if ( $cursor < strlen( $text ) ) {
		$parts[] = array(
			'text' => substr( $text, $cursor ),
			'link' => false,
		);
	}

	return $parts;
}
