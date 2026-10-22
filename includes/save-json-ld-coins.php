<?php
/**
 * JSON-LD and COinS for the save() port, mirroring `src/lib/jsonld.js` and
 * `src/lib/coins.js`.
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
 * `cslToJsonLd()`.
 *
 * @param array $csl CSL-JSON item.
 * @return array
 */
function bibliography_builder_save_csl_to_json_ld( $csl ) {
	$types = array(
		'article-journal'  => 'ScholarlyArticle',
		'book'             => 'Book',
		'chapter'          => 'Chapter',
		'thesis'           => 'Thesis',
		'report'           => 'Report',
		'paper-conference' => 'ScholarlyArticle',
		'review-book'      => 'Review',
		'webpage'          => 'WebPage',
	);
	$type  = bibliography_builder_csl_field( $csl, 'type' );
	$title = bibliography_builder_csl_field( $csl, 'title' );

	$result = array(
		'@context' => 'https://schema.org',
		'@type'    => is_string( $type ) && isset( $types[ $type ] ) ? $types[ $type ] : 'CreativeWork',
		'name'     => bibliography_builder_js_truthy( $title ) ? $title : '',
	);

	$authors = bibliography_builder_csl_field( $csl, 'author' );

	if ( is_array( $authors ) && count( $authors ) > 0 ) {
		$result['author'] = array();

		foreach ( array_values( $authors ) as $author ) {
			$literal = bibliography_builder_name_part( $author, 'literal' );
			$family  = bibliography_builder_name_part( $author, 'family' );
			$given   = bibliography_builder_name_part( $author, 'given' );

			if ( '' !== $literal && '' === $family && '' === $given ) {
				$result['author'][] = array(
					'@type' => 'Organization',
					'name'  => $author['literal'],
				);
				continue;
			}

			$person = array(
				'@type' => 'Person',
				'name'  => '' !== $literal
					? $author['literal']
					: implode( ' ', array_filter( array( $given, $family ), 'strlen' ) ),
			);

			if ( '' !== $family ) {
				$person['familyName'] = $author['family'];
			}

			if ( '' !== $given ) {
				$person['givenName'] = $author['given'];
			}

			$orcid = bibliography_builder_name_part( $author, 'ORCID' );

			if ( '' !== $orcid ) {
				$person['sameAs'] = 0 === strpos( $orcid, 'http' ) ? $orcid : 'https://orcid.org/' . $orcid;
			}

			$result['author'][] = $person;
		}
	}

	$parts = bibliography_builder_csl_first_date_parts( $csl );

	if ( null !== $parts ) {
		$result['datePublished'] = bibliography_builder_join_date_parts( $parts );
	}

	$container = bibliography_builder_csl_field( $csl, 'container-title' );
	$parents   = array(
		'article-journal'  => 'Periodical',
		'chapter'          => 'Book',
		'paper-conference' => 'Event',
	);

	if ( bibliography_builder_js_truthy( $container ) && is_string( $type ) && isset( $parents[ $type ] ) ) {
		$result['isPartOf'] = array(
			'@type' => $parents[ $type ],
			'name'  => $container,
		);

		$issn = bibliography_builder_csl_field( $csl, 'ISSN' );

		if ( 'article-journal' === $type && bibliography_builder_js_truthy( $issn ) ) {
			$first = is_array( $issn ) ? ( isset( $issn[0] ) ? $issn[0] : null ) : $issn;

			// JSON.stringify drops a property whose value is undefined.
			if ( null !== $first ) {
				$result['isPartOf']['issn'] = $first;
			}
		}
	}

	$publisher = bibliography_builder_csl_field( $csl, 'publisher' );

	if ( bibliography_builder_js_truthy( $publisher ) ) {
		$result['publisher'] = array(
			'@type' => 'Organization',
			'name'  => $publisher,
		);
	}

	$doi = bibliography_builder_csl_field( $csl, 'DOI' );

	if ( bibliography_builder_js_truthy( $doi ) ) {
		$result['identifier'] = array(
			'@type'      => 'PropertyValue',
			'propertyID' => 'DOI',
			'value'      => $doi,
		);
		// Each part encoded, the slash kept: `https://doi.org/10.1/x`.
		$result['url'] = 'https://doi.org/' . implode(
			'/',
			array_map(
				'bibliography_builder_encode_uri_component',
				explode( '/', bibliography_builder_js_string( $doi ) )
			)
		);
	}

	$isbn = bibliography_builder_get_primary_identifier( bibliography_builder_csl_field( $csl, 'ISBN' ) );

	if ( '' !== $isbn ) {
		$result['isbn'] = $isbn;
	}

	$url = bibliography_builder_csl_field( $csl, 'URL' );

	if ( bibliography_builder_js_truthy( $url ) && ! isset( $result['url'] ) ) {
		$result['url'] = $url;
	}

	return $result;
}

/**
 * `wrapJsonLdItemList()` from jsonld.js.
 *
 * Nests the cited works in one schema.org ItemList so none is a top-level
 * node that a consumer could take for the page itself (Mastodon's link cards
 * read the first top-level WebPage or NewsArticle as the shared page).
 *
 * @since 1.11.0
 *
 * @param array $items Objects from bibliography_builder_save_csl_to_json_ld().
 * @return array
 */
function bibliography_builder_json_ld_item_list( $items ) {
	$elements = array();

	foreach ( array_values( $items ) as $index => $item ) {
		unset( $item['@context'] );
		$elements[] = array(
			'@type'    => 'ListItem',
			'position' => $index + 1,
			'item'     => $item,
		);
	}

	return array(
		'@context'        => 'https://schema.org',
		'@type'           => 'ItemList',
		'itemListElement' => $elements,
	);
}

/**
 * `escapeForScriptContext()`.
 *
 * @param string $json Serialized JSON.
 * @return string
 */
function bibliography_builder_escape_for_script( $json ) {
	return strtr(
		$json,
		array(
			'<'        => '\\u003c',
			"\u{2028}" => '\\u2028',
			"\u{2029}" => '\\u2029',
		)
	);
}

/**
 * `getPageBounds()` from coins.js.
 *
 * @param mixed $page CSL page value.
 * @return array{0: string|null, 1: string|null}|null
 */
function bibliography_builder_save_page_bounds( $page ) {
	if ( ! bibliography_builder_js_truthy( $page ) ) {
		return null;
	}

	$split  = preg_split( BIBLIOGRAPHY_BUILDER_PAGE_RANGE_SEPARATOR, bibliography_builder_js_string( $page ) );
	$pieces = array_values( array_filter( false === $split ? array() : $split, 'strlen' ) );

	return array(
		isset( $pieces[0] ) ? $pieces[0] : null,
		isset( $pieces[1] ) ? $pieces[1] : null,
	);
}

/**
 * `buildCoins()`.
 *
 * @param array $csl CSL-JSON item.
 * @return string
 */
function bibliography_builder_save_build_coins( $csl ) {
	$params = array( 'ctx_ver=Z39.88-2004' );
	$type   = bibliography_builder_csl_field( $csl, 'type' );
	$type   = bibliography_builder_js_truthy( $type ) ? $type : '';
	$add    =
		/**
		 * Append one COinS parameter when the value is present.
		 *
		 * @param string $key   COinS key.
		 * @param mixed  $value CSL field value.
		 * @return void
		 */
		static function ( $key, $value ) use ( &$params ): void {
			if ( null !== $value && '' !== $value ) {
				$params[] = $key . '='
				. bibliography_builder_encode_uri_component( bibliography_builder_js_string( $value ) );
			}
		};
	$field =
		/**
		 * Read a field from the CSL item.
		 *
		 * @param string $name CSL field name.
		 * @return mixed
		 */
		static function ( $name ) use ( $csl ) {
			return bibliography_builder_csl_field( $csl, $name );
		};

	if ( 'book' === $type || 'chapter' === $type ) {
		$params[] = 'rft_val_fmt=' . bibliography_builder_encode_uri_component( 'info:ofi/fmt:kev:mtx:book' );

		if ( 'chapter' === $type ) {
			$add( 'rft.btitle', $field( 'container-title' ) );
			$add( 'rft.atitle', $field( 'title' ) );
		} else {
			$add( 'rft.btitle', $field( 'title' ) );
		}

		$add( 'rft.pub', $field( 'publisher' ) );
		$add( 'rft.place', $field( 'publisher-place' ) );
		$add( 'rft.isbn', bibliography_builder_get_primary_identifier( $field( 'ISBN' ) ) );
	} elseif ( 'thesis' === $type ) {
		$params[] = 'rft_val_fmt=' . bibliography_builder_encode_uri_component( 'info:ofi/fmt:kev:mtx:dissertation' );
		$add( 'rft.title', $field( 'title' ) );
		$add( 'rft.inst', $field( 'publisher' ) );
		$add( 'rft.degree', $field( 'genre' ) );
	} else {
		$bounds   = bibliography_builder_save_page_bounds( $field( 'page' ) );
		$params[] = 'rft_val_fmt=' . bibliography_builder_encode_uri_component( 'info:ofi/fmt:kev:mtx:journal' );
		$add( 'rft.atitle', $field( 'title' ) );
		$add( 'rft.jtitle', $field( 'container-title' ) );
		$add( 'rft.volume', $field( 'volume' ) );
		$add( 'rft.issue', $field( 'issue' ) );
		$add( 'rft.spage', null === $bounds ? null : $bounds[0] );
		$add( 'rft.epage', null === $bounds ? null : $bounds[1] );
	}

	$authors = $field( 'author' );

	if ( is_array( $authors ) && count( $authors ) > 0 ) {
		$first  = array_values( $authors )[0];
		$family = is_array( $first ) && isset( $first['family'] ) && bibliography_builder_js_truthy( $first['family'] )
			? $first['family']
			: null;
		$add( 'rft.aulast', null !== $family ? $family : ( isset( $first['literal'] ) ? $first['literal'] : null ) );
		$add( 'rft.aufirst', is_array( $first ) && isset( $first['given'] ) ? $first['given'] : null );
	}

	$parts = bibliography_builder_csl_first_date_parts( $csl );

	if ( null !== $parts ) {
		$add( 'rft.date', bibliography_builder_join_date_parts( $parts ) );
	}

	$doi = $field( 'DOI' );

	if ( bibliography_builder_js_truthy( $doi ) ) {
		$add( 'rft_id', 'info:doi/' . bibliography_builder_js_string( $doi ) );
	}

	return implode( '&', $params );
}
