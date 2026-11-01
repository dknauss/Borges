<?php
/**
 * PHP port of the block's static save() markup (Phase 05, M2 spike).
 *
 * Borges stores its bibliography as static HTML inside `post_content`, and the
 * editor re-validates that HTML against the JS `save()` every time a post is
 * opened. A server-side write route therefore has to regenerate markup the
 * editor would have produced from the same attributes, or the block opens as
 * "invalid content".
 *
 * This file reproduces `renderBibliographySave()` in `src/save-markup.js`, the
 * block-supports wrapper, and the JS-compatible string, number, JSON, and
 * escaping helpers the port shares. The helpers it calls live beside it, one
 * file per JS module group: `save-sort.php` (sorting), `save-display.php`
 * (display segments, names, links), `save-json-ld-coins.php`, and
 * `save-cite-export.php`. Every function names the JS function it mirrors.
 *
 * Parity is enforced by committed fixtures: PHPUnit renders each case in
 * `tests/fixtures/save-parity/cases.json` and compares it with the committed
 * markup, and Jest checks that the same committed markup is byte-identical to
 * the current JS `save()` and validates in the real block registry.
 *
 * The write routes and write abilities render through it.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Characters JavaScript's `\s` matches (ECMAScript WhiteSpace + LineTerminator),
 * as a PCRE character-class body.
 */
const BIBLIOGRAPHY_BUILDER_JS_WHITESPACE = '\t\n\x0B\f\r \x{00A0}\x{1680}\x{2000}-\x{200A}'
	. '\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

/**
 * A page-range separator: a hyphen, en dash, or em dash with optional
 * JavaScript whitespace around it.
 */
const BIBLIOGRAPHY_BUILDER_PAGE_RANGE_SEPARATOR = '/[' . BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']*[-–—]['
	. BIBLIOGRAPHY_BUILDER_JS_WHITESPACE . ']*/u';

/**
 * Decode a block's attribute JSON for bibliography_builder_render_save_markup().
 *
 * `parse_blocks()` decodes attributes into associative arrays, which turns an
 * empty JSON object into `[]` and `{"0": …}` into a list. The CSL-JSON script
 * and export links re-serialize stored CSL, so those would no longer match
 * the editor's `JSON.stringify()`. This decodes objects into arrays except
 * where an array cannot represent them, which stay `stdClass`.
 *
 * @param mixed $json Block attribute JSON; cast to string.
 * @return array|null Attributes, or null when the JSON is not an object.
 */
function bibliography_builder_decode_save_attributes( $json ) {
	$decoded = json_decode( (string) $json );

	return $decoded instanceof stdClass ? bibliography_builder_normalize_save_json( $decoded ) : null;
}

/**
 * Convert a `json_decode()` object tree as bibliography_builder_decode_save_attributes()
 * describes.
 *
 * @param mixed $value Decoded value.
 * @return mixed
 */
function bibliography_builder_normalize_save_json( $value ) {
	if ( is_array( $value ) ) {
		return array_map( 'bibliography_builder_normalize_save_json', $value );
	}

	if ( ! $value instanceof stdClass ) {
		return $value;
	}

	$properties = array_map( 'bibliography_builder_normalize_save_json', get_object_vars( $value ) );

	if ( array() === $properties || bibliography_builder_is_list_array( $properties ) ) {
		return (object) $properties;
	}

	return $properties;
}

/**
 * Whether this PHP can render save markup: sorting needs ICU collation and
 * export filenames need Unicode normalization, exactly as the browser has.
 *
 * @return bool
 */
function bibliography_builder_can_render_save_markup() {
	return class_exists( 'Collator' ) && class_exists( 'Normalizer' );
}

/**
 * JavaScript truthiness for a decoded JSON value.
 *
 * @param mixed $value Value.
 * @return bool
 */
function bibliography_builder_js_truthy( $value ) {
	if ( is_array( $value ) ) {
		return true;
	}

	if ( is_float( $value ) && is_nan( $value ) ) {
		return false;
	}

	return null !== $value && false !== $value && 0 !== $value && 0.0 !== $value && '' !== $value;
}

/**
 * JavaScript `String(value)` for a decoded JSON scalar.
 *
 * @param mixed $value Value.
 * @return string
 */
function bibliography_builder_js_string( $value ) {
	if ( null === $value ) {
		return 'null';
	}

	if ( is_bool( $value ) ) {
		return $value ? 'true' : 'false';
	}

	if ( is_float( $value ) ) {
		return bibliography_builder_js_number( $value );
	}

	if ( is_object( $value ) ) {
		return '[object Object]';
	}

	if ( is_array( $value ) ) {
		// String([a, b]) joins with commas; objects never reach here in practice.
		return bibliography_builder_is_list_array( $value )
			? implode( ',', array_map( 'bibliography_builder_js_string', $value ) )
			: '[object Object]';
	}

	return (string) $value;
}

/**
 * JavaScript number-to-string conversion for a float.
 *
 * @param float $value Number.
 * @return string
 */
function bibliography_builder_js_number( $value ) {
	if ( is_nan( $value ) ) {
		return 'NaN';
	}

	if ( is_infinite( $value ) ) {
		return $value > 0 ? 'Infinity' : '-Infinity';
	}

	if ( floor( $value ) === $value && abs( $value ) < 1e21 ) {
		return sprintf( '%.0f', $value );
	}

	// PHP's shortest round-trip form matches JavaScript's for ordinary values.
	// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Number formatting only.
	$encoded = json_encode( $value );

	return is_string( $encoded ) ? $encoded : (string) $value;
}

/**
 * `JSON.stringify()` for a decoded JSON value, optionally pretty-printed with
 * two-space indentation as `JSON.stringify( value, null, 2 )` does.
 *
 * Written out rather than using `json_encode()` because PHP differs from
 * JavaScript on whole-number floats (`1.0`) and indentation width.
 *
 * JSON objects that a PHP array cannot represent faithfully (empty ones, and
 * ones whose keys look like list indexes) must arrive as `stdClass`; see
 * bibliography_builder_decode_save_attributes().
 *
 * @param mixed    $value  Value.
 * @param int|null $indent Spaces per level, or null for compact output.
 * @param int      $depth  Current depth (internal).
 * @return string
 */
function bibliography_builder_json_stringify( $value, $indent = null, $depth = 0 ) {
	if ( null === $value ) {
		return 'null';
	}

	if ( is_bool( $value ) ) {
		return $value ? 'true' : 'false';
	}

	if ( is_int( $value ) ) {
		return (string) $value;
	}

	if ( is_float( $value ) ) {
		return is_finite( $value ) ? bibliography_builder_js_number( $value ) : 'null';
	}

	if ( is_string( $value ) ) {
		$flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
			| JSON_UNESCAPED_LINE_TERMINATORS | JSON_INVALID_UTF8_SUBSTITUTE;
		// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Exact JSON.stringify string escaping.
		$encoded = json_encode( $value, $flags );

		return is_string( $encoded ) ? $encoded : '""';
	}

	if ( $value instanceof stdClass ) {
		$value   = get_object_vars( $value );
		$is_list = false;

		if ( array() === $value ) {
			return '{}';
		}
	} elseif ( ! is_array( $value ) ) {
		return 'null';
	} else {
		$is_list = bibliography_builder_is_list_array( $value );
	}

	if ( array() === $value ) {
		return '[]';
	}

	$items = array();

	foreach ( $value as $key => $item ) {
		$encoded_item = bibliography_builder_json_stringify( $item, $indent, $depth + 1 );
		$items[]      = $is_list
			? $encoded_item
			: bibliography_builder_json_stringify( (string) $key ) . ( null === $indent ? ':' : ': ' ) . $encoded_item;
	}

	list( $open, $close ) = $is_list ? array( '[', ']' ) : array( '{', '}' );

	if ( null === $indent ) {
		return $open . implode( ',', $items ) . $close;
	}

	$inner = "\n" . str_repeat( ' ', $indent * ( $depth + 1 ) );
	$outer = "\n" . str_repeat( ' ', $indent * $depth );

	return $open . $inner . implode( ',' . $inner, $items ) . $outer . $close;
}

/**
 * `encodeURIComponent()`.
 *
 * @param mixed $value Value.
 * @return string
 */
function bibliography_builder_encode_uri_component( $value ) {
	return strtr(
		rawurlencode( (string) $value ),
		array(
			'%21' => '!',
			'%27' => "'",
			'%28' => '(',
			'%29' => ')',
			'%2A' => '*',
		)
	);
}

/**
 * `escapeAmpersand()` from `@wordpress/escape-html`: leaves anything that
 * already looks like an entity alone.
 *
 * @param string $value Value.
 * @return string
 */
function bibliography_builder_escape_ampersand( $value ) {
	return (string) preg_replace( '/&(?!([a-z0-9]+|#[0-9]+|#x[a-f0-9]+);)/i', '&amp;', $value );
}

/**
 * `escapeHTML()` from `@wordpress/escape-html`, used for text nodes.
 *
 * @param mixed $value Value.
 * @return string
 */
function bibliography_builder_escape_save_text( $value ) {
	return str_replace( '<', '&lt;', bibliography_builder_escape_ampersand( (string) $value ) );
}

/**
 * `escapeAttribute()` from `@wordpress/escape-html`.
 *
 * @param mixed $value Value.
 * @return string
 */
function bibliography_builder_escape_save_attribute( $value ) {
	return strtr(
		bibliography_builder_escape_ampersand( (string) $value ),
		array(
			'"' => '&quot;',
			'<' => '&lt;',
			'>' => '&gt;',
		)
	);
}

/**
 * Serialize an element's attributes in the given order, skipping null values.
 *
 * @param array $attributes Attribute name => value.
 * @return string
 */
function bibliography_builder_save_attributes( $attributes ) {
	$html = '';

	foreach ( $attributes as $name => $value ) {
		if ( null === $value ) {
			continue;
		}

		// @wordpress/element serializes `download` as a boolean attribute, so
		// a truthy value is written bare and the filename is dropped.
		$html .= 'download' === $name
			? ' download'
			: ' ' . $name . '="' . bibliography_builder_escape_save_attribute( $value ) . '"';
	}

	return $html;
}

// ── Metadata: src/lib/jsonld.js, src/lib/coins.js ───────────────────────────

// ── Cite / Export panel: src/lib/export.js ───────────────────────────────────

// ── Block wrapper: useBlockProps.save() with the block's supports ───────────

/**
 * `kebabCase()` as used for preset font-size class names.
 *
 * @param mixed $value Slug.
 * @return string
 */
function bibliography_builder_save_kebab_case( $value ) {
	$value = (string) preg_replace( '/([a-z])([A-Z])/', '$1-$2', (string) $value );
	$value = (string) preg_replace( '/([A-Za-z])([0-9])/', '$1-$2', $value );
	$value = (string) preg_replace( '/([0-9])([A-Za-z])/', '$1-$2', $value );

	return strtolower( trim( (string) preg_replace( '/[^A-Za-z0-9]+/', '-', $value ), '-' ) );
}

/**
 * A style-engine value: `var:preset|spacing|40` becomes a CSS custom property.
 *
 * @param mixed $value Style value.
 * @return string|null
 */
function bibliography_builder_save_style_value( $value ) {
	if ( ! is_string( $value ) || '' === $value ) {
		return null;
	}

	if ( 0 === strpos( $value, 'var:' ) ) {
		return 'var(--wp--' . str_replace( '|', '--', substr( $value, 4 ) ) . ')';
	}

	return $value;
}

/**
 * Inline style for the supported spacing and typography values, in the order
 * the style engine emits them.
 *
 * @param mixed $style Block `style` attribute.
 * @return string
 */
function bibliography_builder_save_inline_style( $style ) {
	if ( ! is_array( $style ) ) {
		return '';
	}

	$rules = array();

	foreach ( array( 'margin', 'padding' ) as $property ) {
		$value = isset( $style['spacing'][ $property ] ) ? $style['spacing'][ $property ] : null;

		if ( is_string( $value ) ) {
			$css = bibliography_builder_save_style_value( $value );

			if ( null !== $css ) {
				$rules[] = $property . ':' . $css;
			}

			continue;
		}

		if ( is_array( $value ) ) {
			foreach ( array( 'top', 'right', 'bottom', 'left' ) as $side ) {
				$css = isset( $value[ $side ] ) ? bibliography_builder_save_style_value( $value[ $side ] ) : null;

				if ( null !== $css ) {
					$rules[] = $property . '-' . $side . ':' . $css;
				}
			}
		}
	}

	$font_size = isset( $style['typography']['fontSize'] )
		? bibliography_builder_save_style_value( $style['typography']['fontSize'] )
		: null;

	if ( null !== $font_size ) {
		$rules[] = 'font-size:' . $font_size;
	}

	return implode( ';', $rules );
}

/**
 * The `<section>` attributes `useBlockProps.save()` produces.
 *
 * @param array $attrs Block attributes.
 * @return array
 */
function bibliography_builder_save_block_props( $attrs ) {
	$classes = array( 'wp-block-bibliography-builder-bibliography' );

	if ( isset( $attrs['className'] ) && is_string( $attrs['className'] ) && '' !== $attrs['className'] ) {
		$classes[] = $attrs['className'];
	}

	if ( isset( $attrs['fontSize'] ) && is_string( $attrs['fontSize'] ) && '' !== $attrs['fontSize'] ) {
		$classes[] = 'has-' . bibliography_builder_save_kebab_case( $attrs['fontSize'] ) . '-font-size';
	}

	$style = bibliography_builder_save_inline_style( isset( $attrs['style'] ) ? $attrs['style'] : null );
	$props = array(
		'id' => isset( $attrs['anchor'] ) && is_string( $attrs['anchor'] ) && '' !== $attrs['anchor']
			? $attrs['anchor']
			: null,
	);

	// Attribute order follows the order the supports hooks first set each
	// prop: the custom-class-name hook runs before the style hook, while the
	// font-size class and the generated class name are merged in after it.
	if ( count( $classes ) > 1 && isset( $attrs['className'] ) && $classes[1] === $attrs['className'] ) {
		$props['class'] = implode( ' ', $classes );
	}

	$props['style'] = '' !== $style ? $style : null;
	$props['class'] = implode( ' ', $classes );

	return $props;
}

// ── save() ───────────────────────────────────────────────────────────────────

/**
 * One `<li>` entry.
 *
 * @param array  $citation     Citation record.
 * @param bool   $output_coins Whether to emit COinS.
 * @param bool   $cite_export  Whether to emit the Cite / Export data.
 * @param mixed  $repeated_prefix Author names to show as the repeated-author mark, or null.
 * @param bool   $roman_titles Leave titles roman (a table of cases).
 * @param string $repeated_mark The style's mark: `bibliography_builder_save_repeated_author_mark()`.
 * @return string
 */
function bibliography_builder_save_entry(
	$citation,
	$output_coins,
	$cite_export,
	$repeated_prefix = null,
	$roman_titles = false,
	$repeated_mark = "\u{2011}\u{2011}\u{2011}"
) {
	$csl        = bibliography_builder_citation_csl( $citation );
	$link_label = '';

	foreach ( array( 'title', 'container-title' ) as $field ) {
		$value = bibliography_builder_csl_field( $csl, $field );

		if ( '' === $link_label && bibliography_builder_js_truthy( $value ) ) {
			$link_label = bibliography_builder_js_string( $value );
		}
	}

	$link_label = bibliography_builder_save_strip_inline_markup( $link_label );

	$text     = '';
	$segments = bibliography_builder_save_display_segments( $citation, $roman_titles );

	if ( is_string( $repeated_prefix ) && array() !== $segments && ! $segments[0]['italic']
		&& 0 === strncmp( $segments[0]['text'], $repeated_prefix, strlen( $repeated_prefix ) ) ) {
		$segments[0]['text'] = strval( substr( $segments[0]['text'], strlen( $repeated_prefix ) ) );
		$text               .= '<span class="bibliography-builder-repeated-author">'
			. '<span class="bibliography-builder-repeated-author-mark" aria-hidden="true">'
			. $repeated_mark . '</span>'
			. '<span class="bibliography-builder-visually-hidden screen-reader-text">'
			. bibliography_builder_escape_save_text( $repeated_prefix )
			. '</span></span>';
	}

	foreach ( $segments as $segment ) {
		$content = '';

		foreach ( bibliography_builder_save_link_parts( $segment['text'], $link_label ) as $part ) {
			/**
			 * Link parts always carry href and label; Psalm merges the two
			 * part shapes and loses that.
			 *
			 * @psalm-suppress PossiblyUndefinedArrayOffset
			 */
			$content .= $part['link']
				? '<a' . bibliography_builder_save_attributes(
					array(
						'href'       => $part['href'],
						'rel'        => 'nofollow noopener noreferrer',
						'aria-label' => '' !== $link_label ? $part['label'] . ' — ' . $part['href'] : null,
					)
				) . '>' . bibliography_builder_escape_save_text( $part['text'] ) . '</a>'
				: bibliography_builder_escape_save_text( $part['text'] );
		}

		$text .= $segment['italic'] ? '<i>' . $content . '</i>' : $content;
	}

	$id       = array_key_exists( 'id', $citation ) ? bibliography_builder_js_string( $citation['id'] ) : 'undefined';
	$language = bibliography_builder_csl_field( $csl, 'language' );
	$language = bibliography_builder_js_truthy( $language ) ? bibliography_builder_js_string( $language ) : null;
	$html     = '<li' . bibliography_builder_save_attributes(
		array_merge(
			array(
				'id'   => 'ref-' . $id,
				'lang' => $language,
			),
			$cite_export ? bibliography_builder_save_cite_export_data( $citation ) : array()
		)
	) . '><span class="bibliography-builder-entry-text">' . $text . '</span>';

	if ( $output_coins ) {
		$html .= '<span' . bibliography_builder_save_attributes(
			array(
				'class'       => 'Z3988',
				'aria-hidden' => 'true',
				'title'       => bibliography_builder_save_build_coins( $csl ),
			)
		) . '></span>';
	}

	return $html . '</li>';
}

/**
 * The element for the block heading at a `headingLevel` attribute value:
 * `h2` to `h6`, or `p` for 0 (the default) and anything else.
 *
 * `getHeadingTag()` from `src/lib/heading-level.js`. JSON `2.0` is the number
 * 2 in JavaScript and a float in PHP, so a whole-number float counts.
 *
 * @param mixed $heading_level The `headingLevel` attribute.
 * @return string
 */
function bibliography_builder_save_heading_tag( $heading_level ) {
	$is_level = ( is_int( $heading_level ) || is_float( $heading_level ) )
		&& in_array( (float) $heading_level, array( 2.0, 3.0, 4.0, 5.0, 6.0 ), true );

	return $is_level ? 'h' . (int) $heading_level : 'p';
}

/**
 * The element for group labels: one level below the block heading, or `p`
 * when the block heading is `p` or `h6`. `getGroupLabelTag()` from
 * `src/lib/bibliography-groups.js`.
 *
 * @param string $heading_tag The block heading's tag.
 * @return string
 */
function bibliography_builder_save_group_label_tag( $heading_tag ) {
	return 1 === preg_match( '/^h([2-5])$/', $heading_tag, $level ) ? 'h' . ( (int) $level[1] + 1 ) : 'p';
}

/**
 * Render the block's saved inner HTML from its attributes, as the current
 * `save()` would. Returns an empty string when there are no citations, where
 * `save()` returns null.
 *
 * Callers must check bibliography_builder_can_render_save_markup() first.
 *
 * @param mixed $attrs Block attributes as parse_blocks() returns them; anything else renders as no attributes.
 * @return string
 */
function bibliography_builder_render_save_markup( $attrs ) {
	$attrs     = is_array( $attrs ) ? $attrs : array();
	$citations = isset( $attrs['citations'] ) && is_array( $attrs['citations'] )
		? array_values( $attrs['citations'] )
		: array();

	if ( array() === $citations ) {
		return '';
	}

	$flag = static function ( string $name, bool $fallback ) use ( $attrs ): bool {
		return array_key_exists( $name, $attrs ) ? bibliography_builder_js_truthy( $attrs[ $name ] ) : $fallback;
	};

	$style_key = isset( $attrs['citationStyle'] ) ? $attrs['citationStyle'] : bibliography_builder_default_style_key();
	$style     = bibliography_builder_get_save_style_definition( $style_key );
	$heading   = isset( $attrs['headingText'] ) && bibliography_builder_js_truthy( $attrs['headingText'] )
		? bibliography_builder_js_string( $attrs['headingText'] )
		: '';
	$sorted    = bibliography_builder_sort_citations_for_save( $citations, $style_key );
	$csl_array = array_map( 'bibliography_builder_citation_csl', $sorted );
	$list_tag  = $style['listType'];
	$style_css = is_string( $style_key ) && '' !== $style_key ? $style_key : 'undefined';

	$html = '<section' . bibliography_builder_save_attributes(
		array_merge(
			bibliography_builder_save_block_props( $attrs ),
			array(
				'role'       => 'doc-bibliography',
				'aria-label' => '' !== $heading ? $heading : 'Bibliography',
			)
		)
	) . '>';

	if ( '' !== $heading ) {
		$heading_tag = bibliography_builder_save_heading_tag(
			isset( $attrs['headingLevel'] ) ? $attrs['headingLevel'] : 0
		);

		$html .= '<' . $heading_tag . ' class="bibliography-builder-heading">'
			. bibliography_builder_escape_save_text( $heading )
			. '</' . $heading_tag . '>';
	}

	$list_class = 'bibliography-builder-list bibliography-builder-list-'
		. ( 'ol' === $list_tag ? 'numeric' : 'unordered' )
		. ' bibliography-builder-list-' . $style_css;
	$sorted     = array_values( $sorted );
	$repeated   = bibliography_builder_save_repeated_author_prefixes( $sorted, $style_key );
	$entry      =
		/**
		 * One entry, with its repeated-author prefix from the flat order.
		 *
		 * @param mixed $citation     Citation record.
		 * @param bool  $roman_titles Leave titles roman.
		 * @return string
		 */
		static function ( $citation, bool $roman_titles ) use ( $sorted, $repeated, $flag, $style_key ): string {
			$index = array_search( $citation, $sorted, true );

			return bibliography_builder_save_entry(
				is_array( $citation ) ? $citation : array(),
				$flag( 'outputCoins', false ),
				$flag( 'outputCiteExport', false ),
				false === $index ? null : $repeated[ $index ],
				$roman_titles,
				bibliography_builder_save_repeated_author_mark( $style_key )
			);
		};
	$groups = bibliography_builder_save_group_citations( $sorted, $style_key );

	if ( null === $groups ) {
		$html .= '<' . $list_tag . bibliography_builder_save_attributes( array( 'class' => $list_class ) ) . '>';

		foreach ( $sorted as $citation ) {
			$html .= $entry( $citation, false );
		}

		$html .= '</' . $list_tag . '>';
	} else {
		// One label and list per group (`groupCitations()`), the label one
		// level below the block heading (`getGroupLabelTag()`).
		$label_tag = bibliography_builder_save_group_label_tag(
			bibliography_builder_save_heading_tag( isset( $attrs['headingLevel'] ) ? $attrs['headingLevel'] : 0 )
		);

		foreach ( $groups as $group ) {
			$first    = $group['citations'][0];
			$first_id = is_array( $first ) && array_key_exists( 'id', $first )
				? bibliography_builder_js_string( $first['id'] )
				: 'undefined';
			$label_id = 'bibliography-group-' . $group['key'] . '-' . $first_id;

			$html .= '<div class="' . bibliography_builder_escape_save_attribute(
				'bibliography-builder-group bibliography-builder-group-' . $group['key']
			) . '">'
				. '<' . $label_tag . bibliography_builder_save_attributes(
					array(
						'class' => 'bibliography-builder-group-heading',
						'id'    => $label_id,
					)
				) . '>' . bibliography_builder_escape_save_text( $group['label'] ) . '</' . $label_tag . '>'
				. '<' . $list_tag . bibliography_builder_save_attributes(
					array(
						'class'           => $list_class,
						'aria-labelledby' => $label_id,
					)
				) . '>';

			foreach ( $group['citations'] as $citation ) {
				$html .= $entry( $citation, $group['romanTitles'] );
			}

			$html .= '</' . $list_tag . '></div>';
		}
	}

	if ( $flag( 'outputJsonLd', true ) ) {
		$html .= '<script type="application/ld+json">'
			. bibliography_builder_escape_for_script(
				bibliography_builder_json_stringify(
					bibliography_builder_json_ld_item_list(
						array_map( 'bibliography_builder_save_csl_to_json_ld', $csl_array )
					)
				)
			)
			. '</script>';
	}

	if ( $flag( 'outputCslJson', false ) ) {
		$html .= '<script type="application/vnd.citationstyles.csl+json">'
			. bibliography_builder_escape_for_script(
				bibliography_builder_json_stringify( array_map( 'bibliography_builder_citation_raw_csl', $sorted ) )
			)
			. '</script>';
	}

	return $html . '</section>';
}
