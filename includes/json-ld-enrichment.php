<?php
/**
 * Render-time enrichment of the bibliography's JSON-LD, and the link from
 * the page to the works it cites.
 *
 * The save() function writes a baseline schema.org ItemList that needs nothing but the
 * citations themselves. Two things it cannot know are added here as the
 * block renders, so every published post gets them without being re-saved
 * and the stored content is untouched:
 *
 * - The page's own URL, which gives the list an `@id` and each work without
 *   a DOI an `@id` at its visible `#ref-…` anchor on the page.
 * - Fields the baseline leaves out: `sameAs` links and an `identifier` for
 *   every DOI, PMID, PMCID, arXiv ID, and ISBN; the periodical, volume, and
 *   issue chain; containers for magazine, newspaper, and web citations, and
 *   the proceedings and conference of a conference paper; pages; editors and
 *   translators; edition, page count, language, and publisher place; and a schema.org type for CSL types the
 *   baseline maps to plain CreativeWork.
 *
 * The cited works also need an edge from the page that cites them. Yoast SEO
 * and Rank Math build the page's Article graph, so the works are added to it
 * as schema.org `citation`. Rank Math gets a short reference to each work
 * (type, `@id`, name), joined by the shared `@id` to its full description in
 * the bibliography's own ItemList. Yoast gets the full description itself,
 * because Yoast's schema aggregator (the feed NLWeb reads) and plugins that
 * ask Yoast for a post's graph see that graph alone; the
 * `bibliography_builder_yoast_citation_records` filter switches it back to
 * short references. On a site with neither plugin, Borges prints the edge
 * itself: a `WebPage` node for the page, with short references, in the
 * document head.
 *
 * Both layers are on by default. `bibliography_builder_enrich_json_ld` and
 * `bibliography_builder_link_page_citations` turn them off.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CSL types the baseline maps to CreativeWork, with a closer schema.org type.
 *
 * Applied only where the saved type is still CreativeWork, so a type save()
 * already chose is never second-guessed.
 *
 * @since 1.13.0
 *
 * @return array<string, string>
 */
function bibliography_builder_json_ld_refined_types() {
	return array(
		'article'            => 'ScholarlyArticle',
		'article-magazine'   => 'Article',
		'article-newspaper'  => 'NewsArticle',
		'post'               => 'SocialMediaPosting',
		'post-weblog'        => 'BlogPosting',
		'dataset'            => 'Dataset',
		'software'           => 'SoftwareSourceCode',
		'motion_picture'     => 'Movie',
		'broadcast'          => 'Episode',
		'song'               => 'MusicRecording',
		'map'                => 'Map',
		'manuscript'         => 'Manuscript',
		'legislation'        => 'Legislation',
		'bill'               => 'Legislation',
		'review'             => 'Review',
		'entry-encyclopedia' => 'Article',
		'entry-dictionary'   => 'Article',
		'graphic'            => 'VisualArtwork',
	);
}

/**
 * The page URL that `@id`s and entry anchors hang from, or '' when unknown.
 *
 * @since 1.13.0
 * @since 1.19.0 Takes an optional post, for graphs built outside the main query.
 *
 * @param WP_Post|object|null $post The post; defaults to the current post.
 * @return string
 */
function bibliography_builder_json_ld_page_url( $post = null ) {
	$url = '';

	if ( function_exists( 'get_permalink' ) ) {
		if ( $post instanceof WP_Post ) {
			$url = get_permalink( $post );
		} elseif ( is_object( $post ) && isset( $post->ID ) && (int) $post->ID > 0 ) {
			$url = get_permalink( (int) $post->ID );
		} else {
			$url = get_permalink();
		}
	}

	/**
	 * Filters the page URL the bibliography's JSON-LD identifiers use.
	 *
	 * Return '' to leave out every page-relative `@id` and `url`.
	 *
	 * @since 1.13.0
	 * @since 1.19.0 The `$post` parameter was added.
	 *
	 * @param string       $url  The post's permalink.
	 * @param WP_Post|null $post The post the URL belongs to, when the caller
	 *                           named one; null for the current post.
	 */
	$url = apply_filters( 'bibliography_builder_json_ld_page_url', is_string( $url ) ? $url : '', $post );

	return is_string( $url ) ? (string) preg_replace( '/#.*$/s', '', $url ) : '';
}

/**
 * A CSL string field, trimmed, or '' when absent or not a scalar.
 *
 * @param array  $csl   CSL-JSON item.
 * @param string $field Field name.
 * @return string
 */
function bibliography_builder_json_ld_csl_string( $csl, $field ) {
	$value = bibliography_builder_csl_field( $csl, $field );

	if ( is_array( $value ) ) {
		$value = bibliography_builder_get_primary_identifier( $value );
	}

	return is_string( $value ) || is_int( $value ) || is_float( $value ) ? trim( (string) $value ) : '';
}

/**
 * Every persistent identifier a CSL item carries, as schema.org values.
 *
 * @since 1.13.0
 *
 * @param array $csl CSL-JSON item.
 * @return array<int, array{propertyID: string, value: string, url: string}>
 */
function bibliography_builder_json_ld_identifiers( $csl ) {
	$identifiers = array();

	$doi = bibliography_builder_json_ld_csl_string( $csl, 'DOI' );
	if ( '' !== $doi ) {
		$identifiers[] = array(
			'propertyID' => 'DOI',
			'value'      => $doi,
			// The same URL save() writes: each segment encoded, slashes kept.
			'url'        => 'https://doi.org/' . implode(
				'/',
				array_map( 'bibliography_builder_encode_uri_component', explode( '/', $doi ) )
			),
		);
	}

	$pmid = bibliography_builder_json_ld_csl_string( $csl, 'PMID' );
	if ( preg_match( '/^\d{1,9}$/', $pmid ) ) {
		$identifiers[] = array(
			'propertyID' => 'PMID',
			'value'      => $pmid,
			'url'        => 'https://pubmed.ncbi.nlm.nih.gov/' . $pmid . '/',
		);
	}

	$pmcid = strtoupper( bibliography_builder_json_ld_csl_string( $csl, 'PMCID' ) );
	if ( preg_match( '/^(?:PMC)?(\d{1,9})$/', $pmcid, $match ) ) {
		$identifiers[] = array(
			'propertyID' => 'PMCID',
			'value'      => 'PMC' . $match[1],
			'url'        => 'https://pmc.ncbi.nlm.nih.gov/articles/PMC' . $match[1] . '/',
		);
	}

	// The arXiv resolver stores `arXiv:<id>` in `number`; BibTeX and DOI
	// imports often carry only the arxiv.org abstract URL.
	$arxiv = '';
	if ( preg_match( '#^arxiv:\s*(\S+)$#i', bibliography_builder_json_ld_csl_string( $csl, 'number' ), $match ) ) {
		$arxiv = $match[1];
	} elseif (
		preg_match(
			'#^https?://(?:www\.)?arxiv\.org/abs/([^\s?\#]+)$#i',
			bibliography_builder_json_ld_csl_string( $csl, 'URL' ),
			$match
		)
	) {
		$arxiv = $match[1];
	}
	if ( '' !== $arxiv && preg_match( '#^[A-Za-z0-9.\-/]+$#', $arxiv ) ) {
		$identifiers[] = array(
			'propertyID' => 'arXiv',
			'value'      => $arxiv,
			'url'        => 'https://arxiv.org/abs/' . $arxiv,
		);
	}

	$isbn = bibliography_builder_json_ld_csl_string( $csl, 'ISBN' );
	if ( '' !== $isbn ) {
		$identifiers[] = array(
			'propertyID' => 'ISBN',
			'value'      => $isbn,
			'url'        => '',
		);
	}

	return $identifiers;
}

/**
 * One CSL name as a schema.org Person, with its particles, or null for an
 * organization (a literal name only) or an empty name.
 *
 * `name` is the name as save() displays it in an entry (`getDisplayName()`):
 * given name, dropping particle, non-dropping particle, family name, and
 * suffix, so "Sérgio Buarque de Holanda" and "Ludwig van Beethoven" keep
 * their particles. `familyName` keeps a non-dropping particle ("van
 * Beethoven"), which is part of the surname as written, but not a dropping
 * one ("Holanda"), which is not; microformats' `p-family-name` does the same.
 * A one-part name in `given` ("Plato") is its own `name`.
 *
 * @since 1.20.0
 *
 * @param mixed $name CSL name object.
 * @return array|null
 */
function bibliography_builder_json_ld_person( $name ) {
	$literal = bibliography_builder_name_part( $name, 'literal' );
	$family  = bibliography_builder_name_part( $name, 'family' );
	$given   = bibliography_builder_name_part( $name, 'given' );

	if ( '' !== $literal && '' === $family && '' === $given ) {
		return null;
	}

	$display = bibliography_builder_save_display_name( $name );

	if ( '' === $display ) {
		$display = $given;
	}

	if ( '' === $display ) {
		return null;
	}

	$person = array(
		'@type' => 'Person',
		'name'  => $display,
	);

	if ( '' !== $family ) {
		$person['familyName'] = bibliography_builder_save_join_name_parts(
			array(
				bibliography_builder_name_part( $name, 'non-dropping-particle' ),
				$family,
			)
		);
	}

	if ( '' !== $given ) {
		$person['givenName'] = $given;
	}

	return $person;
}

/**
 * CSL names as schema.org people and organizations, the way save() maps
 * authors, but with each person's name particles (see
 * bibliography_builder_json_ld_person()).
 *
 * @param mixed $names CSL name list.
 * @return array
 */
function bibliography_builder_json_ld_names( $names ) {
	$result = array();

	if ( ! is_array( $names ) ) {
		return $result;
	}

	foreach ( array_values( $names ) as $name ) {
		$literal = bibliography_builder_name_part( $name, 'literal' );
		$family  = bibliography_builder_name_part( $name, 'family' );
		$given   = bibliography_builder_name_part( $name, 'given' );

		if ( '' !== $literal && '' === $family && '' === $given ) {
			$result[] = array(
				'@type' => 'Organization',
				'name'  => $literal,
			);
			continue;
		}

		$person = bibliography_builder_json_ld_person( $name );

		if ( null !== $person ) {
			$result[] = $person;
		}
	}

	return $result;
}

/**
 * Put back the name particles save() leaves out of each author.
 *
 * The JS save() (`cslToJsonLd()`) builds a person's `name` from `given` and `family`
 * alone, so "Sérgio Buarque de Holanda" was saved as "Sérgio Buarque
 * Holanda" (#248). Changing save() would alter every saved block, so the
 * names are corrected here instead: `name` and `familyName` are rewritten
 * from the CSL name, and everything else save() wrote (an ORCID `sameAs`)
 * is kept. save() writes one author per CSL name, in order; when the counts
 * differ the markup is not what save() wrote, and it is left alone.
 *
 * @since 1.20.0
 *
 * @param mixed $authors The `author` save() wrote.
 * @param mixed $names   The CSL `author` list.
 * @return mixed
 */
function bibliography_builder_json_ld_author_particles( $authors, $names ) {
	if ( ! is_array( $authors ) || ! is_array( $names ) ) {
		return $authors;
	}

	$names = array_values( $names );

	if ( count( $authors ) !== count( $names ) || array_values( $authors ) !== $authors ) {
		return $authors;
	}

	foreach ( $authors as $index => $author ) {
		if ( ! is_array( $author ) || ! isset( $author['@type'] ) || 'Person' !== $author['@type'] ) {
			continue;
		}

		$person = bibliography_builder_json_ld_person( $names[ $index ] );

		if ( null === $person ) {
			continue;
		}

		$author['name'] = $person['name'];

		if ( isset( $person['familyName'] ) ) {
			$author['familyName'] = $person['familyName'];
		}

		$authors[ $index ] = $author;
	}

	return $authors;
}

/**
 * Split a CSL `page` value into schema.org pagination.
 *
 * @param string $pages CSL page value, e.g. `123-145` or `e1001`.
 * @return array
 */
function bibliography_builder_json_ld_pagination( $pages ) {
	if ( '' === $pages ) {
		return array();
	}

	$result = array( 'pagination' => $pages );

	if ( preg_match( '/^\s*([A-Za-z]?\d+)\s*[-\x{2010}-\x{2015}]+\s*([A-Za-z]?\d+)\s*$/u', $pages, $match ) ) {
		$result['pageStart'] = $match[1];
		$result['pageEnd']   = $match[2];
	} elseif ( preg_match( '/^\s*([A-Za-z]?\d+)\s*$/', $pages, $match ) ) {
		$result['pageStart'] = $match[1];
	}

	return $result;
}

/**
 * The `@id` a cited work goes by: its DOI URL, else its entry on this page.
 *
 * @since 1.13.0
 *
 * @param array  $csl         CSL-JSON item.
 * @param string $citation_id The citation's ID (its `ref-…` anchor).
 * @param string $page_url    Page URL, or ''.
 * @return string '' when neither is available.
 */
function bibliography_builder_json_ld_work_id( $csl, $citation_id, $page_url ) {
	foreach ( bibliography_builder_json_ld_identifiers( $csl ) as $identifier ) {
		if ( 'DOI' === $identifier['propertyID'] ) {
			return $identifier['url'];
		}
	}

	if ( '' !== $page_url && '' !== $citation_id ) {
		return $page_url . '#ref-' . rawurlencode( $citation_id );
	}

	return '';
}

/**
 * Give a cited work the container save() leaves out or types wrongly.
 *
 * The save() function writes `isPartOf` only for journal articles, chapters,
 * and conference papers. This adds the rest and corrects the conference case:
 *
 * - Magazine and newspaper articles are part of a `Periodical`, carrying the
 *   first ISSN as journals do, so the volume and issue chain applies to them.
 * - Web pages and blog posts are part of a `WebSite`.
 * - Encyclopedia and dictionary entries are part of their reference work, a
 *   `CreativeWork`: schema.org has no type for an encyclopedia, and the same
 *   title may be a printed set or a website.
 * - A conference paper's `container-title` names the proceedings, a book, but
 *   save() types it as an `Event`, which `isPartOf` does not accept. It
 *   becomes a `Book`. The conference itself, from CSL `event-title` (or the
 *   older `event`), is linked through `recordedAt`, whose range is `Event`.
 *
 * A container save() wrote with another type is never replaced.
 *
 * @since 1.16.0
 *
 * @param array  $work The work as save() wrote it.
 * @param array  $csl  The citation's CSL-JSON.
 * @param string $type The CSL type.
 * @return array
 */
function bibliography_builder_json_ld_container( $work, $csl, $type ) {
	$container = bibliography_builder_json_ld_csl_string( $csl, 'container-title' );
	$saved     = isset( $work['isPartOf'] ) && is_array( $work['isPartOf'] ) ? $work['isPartOf'] : null;

	if ( null === $saved && '' !== $container ) {
		if ( 'article-magazine' === $type || 'article-newspaper' === $type ) {
			$periodical = array(
				'@type' => 'Periodical',
				'name'  => $container,
			);
			$issn       = bibliography_builder_json_ld_csl_string( $csl, 'ISSN' );
			if ( '' !== $issn ) {
				$periodical['issn'] = $issn;
			}
			$work['isPartOf'] = $periodical;
		} elseif ( 'webpage' === $type || 'post-weblog' === $type ) {
			$work['isPartOf'] = array(
				'@type' => 'WebSite',
				'name'  => $container,
			);
		} elseif ( in_array( $type, array( 'entry-encyclopedia', 'entry-dictionary', 'entry' ), true ) ) {
			$work['isPartOf'] = array(
				'@type' => 'CreativeWork',
				'name'  => $container,
			);
		}
	}

	if ( 'paper-conference' !== $type ) {
		return $work;
	}

	if ( null !== $saved && isset( $saved['@type'] ) && 'Event' === $saved['@type'] ) {
		$saved['@type']   = 'Book';
		$work['isPartOf'] = $saved;
	}

	$event_name = bibliography_builder_json_ld_csl_string( $csl, 'event-title' );
	if ( '' === $event_name ) {
		$event_name = bibliography_builder_json_ld_csl_string( $csl, 'event' );
	}

	if ( '' !== $event_name ) {
		$event = array(
			'@type' => 'Event',
			'name'  => $event_name,
		);
		$place = bibliography_builder_json_ld_csl_string( $csl, 'event-place' );
		if ( '' !== $place ) {
			$event['location'] = array(
				'@type' => 'Place',
				'name'  => $place,
			);
		}
		$work['recordedAt'] = $event;
	}

	return $work;
}

/**
 * Add what save() leaves out to one cited work.
 *
 * @since 1.13.0
 *
 * @param array  $work        The work as save() wrote it.
 * @param array  $csl         The citation's CSL-JSON.
 * @param string $citation_id The citation's ID.
 * @param string $page_url    Page URL, or ''.
 * @return array
 */
function bibliography_builder_enrich_json_ld_work( $work, $csl, $citation_id, $page_url ) {
	$type    = bibliography_builder_json_ld_csl_string( $csl, 'type' );
	$refined = bibliography_builder_json_ld_refined_types();

	if ( isset( $work['@type'] ) && 'CreativeWork' === $work['@type'] && isset( $refined[ $type ] ) ) {
		$work['@type'] = $refined[ $type ];
	}

	// `@type` and `@id` lead, so the node reads like the rest of the graph.
	$id   = bibliography_builder_json_ld_work_id( $csl, $citation_id, $page_url );
	$head = array( '@type' => isset( $work['@type'] ) ? $work['@type'] : 'CreativeWork' );
	if ( '' !== $id ) {
		$head['@id'] = $id;
	}
	$work = array_merge( $head, $work );

	$identifiers = bibliography_builder_json_ld_identifiers( $csl );
	if ( array() !== $identifiers ) {
		$values = array();
		$links  = array();

		foreach ( $identifiers as $identifier ) {
			$values[] = array(
				'@type'      => 'PropertyValue',
				'propertyID' => $identifier['propertyID'],
				'value'      => $identifier['value'],
			);

			if ( '' !== $identifier['url'] ) {
				$links[] = $identifier['url'];
			}
		}

		$work['identifier'] = 1 === count( $values ) ? $values[0] : $values;

		$url = bibliography_builder_json_ld_csl_string( $csl, 'URL' );
		if ( '' !== $url && preg_match( '#^https?://#i', $url ) ) {
			$links[] = $url;
		}

		$own   = isset( $work['url'] ) ? $work['url'] : '';
		$links = array_values(
			array_filter(
				array_unique( $links ),
				static function ( $link ) use ( $own ) {
					return $link !== $own;
				}
			)
		);

		if ( array() !== $links ) {
			$work['sameAs'] = 1 === count( $links ) ? $links[0] : $links;
		}
	}

	$work = bibliography_builder_json_ld_container( $work, $csl, $type );

	$volume = bibliography_builder_json_ld_csl_string( $csl, 'volume' );
	$issue  = bibliography_builder_json_ld_csl_string( $csl, 'issue' );

	// schema.org's periodical chain: work → issue → volume → periodical.
	$in_periodical = isset( $work['isPartOf']['@type'] ) && 'Periodical' === $work['isPartOf']['@type'];

	if ( $in_periodical && ( '' !== $volume || '' !== $issue ) ) {
		$parent = $work['isPartOf'];

		if ( '' !== $volume ) {
			$parent = array(
				'@type'        => 'PublicationVolume',
				'volumeNumber' => $volume,
				'isPartOf'     => $parent,
			);
		}

		if ( '' !== $issue ) {
			$parent = array(
				'@type'       => 'PublicationIssue',
				'issueNumber' => $issue,
				'isPartOf'    => $parent,
			);
		}

		$work['isPartOf'] = $parent;
	}

	$work = array_merge(
		$work,
		bibliography_builder_json_ld_pagination( bibliography_builder_json_ld_csl_string( $csl, 'page' ) )
	);

	if ( isset( $work['author'] ) ) {
		$work['author'] = bibliography_builder_json_ld_author_particles(
			$work['author'],
			bibliography_builder_csl_field( $csl, 'author' )
		);
	}

	foreach ( array( 'editor', 'translator' ) as $role ) {
		$names = bibliography_builder_json_ld_names( bibliography_builder_csl_field( $csl, $role ) );
		if ( array() !== $names ) {
			$work[ $role ] = $names;
		}
	}

	if ( 'Book' === $work['@type'] ) {
		$edition = bibliography_builder_json_ld_csl_string( $csl, 'edition' );
		if ( '' !== $edition ) {
			$work['bookEdition'] = $edition;
		}

		$page_count = bibliography_builder_json_ld_csl_string( $csl, 'number-of-pages' );
		if ( preg_match( '/^\d+$/', $page_count ) ) {
			$work['numberOfPages'] = (int) $page_count;
		}
	}

	$language = bibliography_builder_json_ld_csl_string( $csl, 'language' );
	if ( '' !== $language ) {
		$work['inLanguage'] = $language;
	}

	$place = bibliography_builder_json_ld_csl_string( $csl, 'publisher-place' );
	if ( '' !== $place && isset( $work['publisher'] ) && is_array( $work['publisher'] ) ) {
		$work['publisher']['location'] = $place;
	}

	return $work;
}

/**
 * The block's citations' CSL-JSON, keyed by citation ID.
 *
 * @since 1.16.0
 *
 * @param array $parsed_block Parsed block, with its attributes.
 * @return array<string, array>
 */
function bibliography_builder_rendered_citation_csl( $parsed_block ) {
	$citations = array();
	$stored    = isset( $parsed_block['attrs']['citations'] ) && is_array( $parsed_block['attrs']['citations'] )
		? $parsed_block['attrs']['citations']
		: array();

	foreach ( $stored as $citation ) {
		if (
			is_array( $citation )
			&& isset( $citation['id'], $citation['csl'] )
			&& is_string( $citation['id'] )
			&& is_array( $citation['csl'] )
		) {
			$citations[ $citation['id'] ] = $citation['csl'];
		}
	}

	return $citations;
}

/**
 * The citation IDs of a rendered block's `<li id="ref-…">` entries, in order.
 *
 * @since 1.16.0
 *
 * @param string $block_content Rendered block HTML.
 * @return string[]
 */
function bibliography_builder_rendered_anchor_ids( $block_content ) {
	preg_match_all( '#<li\b[^>]*?\sid="ref-([^"]+)"#', $block_content, $anchors );

	return array_map(
		static function ( $id ) {
			return html_entity_decode( $id, ENT_QUOTES, 'UTF-8' );
		},
		$anchors[1]
	);
}

/**
 * Enrich the ItemList in one rendered bibliography block.
 *
 * Entries are matched to citations through the visible `<li id="ref-…">`
 * anchors, which save() writes in the same order as the list items. Markup
 * whose anchors and items do not line up keeps its works as saved and gains
 * only the list-level fields.
 *
 * @since 1.13.0
 *
 * @param mixed $block_content Rendered block HTML; filters can pass any value.
 * @param array $parsed_block  Parsed block, with its attributes.
 * @return mixed
 */
function bibliography_builder_enrich_rendered_json_ld( $block_content, $parsed_block = array() ) {
	if ( ! is_string( $block_content ) || false === strpos( $block_content, '<script type="application/ld+json">{' ) ) {
		return $block_content;
	}

	/**
	 * Filters whether the bibliography's JSON-LD is enriched as it renders.
	 *
	 * @since 1.13.0
	 *
	 * @param bool  $enrich       Whether to enrich. Default true.
	 * @param array $parsed_block The parsed block.
	 */
	if ( ! apply_filters( 'bibliography_builder_enrich_json_ld', true, $parsed_block ) ) {
		return $block_content;
	}

	$attrs      = isset( $parsed_block['attrs'] ) && is_array( $parsed_block['attrs'] )
		? $parsed_block['attrs']
		: array();
	$citations  = bibliography_builder_rendered_citation_csl( $parsed_block );
	$anchor_ids = bibliography_builder_rendered_anchor_ids( $block_content );

	$page_url = bibliography_builder_json_ld_page_url();
	$list_id  = '';

	if ( '' !== $page_url ) {
		$block_id = bibliography_builder_get_stable_block_id( $attrs );
		$fragment = isset( $attrs['anchor'] ) && is_string( $attrs['anchor'] ) && '' !== $attrs['anchor']
			? $attrs['anchor']
			: 'bibliography' . ( null !== $block_id ? '-' . $block_id : '' );
		$list_id  = $page_url . '#' . rawurlencode( $fragment );
	}

	$heading = isset( $attrs['headingText'] ) && is_string( $attrs['headingText'] )
		? trim( $attrs['headingText'] )
		: '';

	$enriched = preg_replace_callback(
		'#(<script type="application/ld\+json">)(\{.*?)(</script>)#s',
		static function ( $matches ) use ( $citations, $anchor_ids, $page_url, $list_id, $heading ) {
			$list = json_decode( $matches[2], true );

			if (
				! is_array( $list )
				|| ! isset( $list['@type'], $list['itemListElement'] )
				|| 'ItemList' !== $list['@type']
				|| ! is_array( $list['itemListElement'] )
			) {
				return $matches[0];
			}

			$elements = array_values( $list['itemListElement'] );
			$aligned  = count( $elements ) === count( $anchor_ids );

			foreach ( $elements as $index => $element ) {
				if ( ! $aligned || ! is_array( $element ) || ! isset( $element['item'] ) ) {
					continue;
				}

				$citation_id = $anchor_ids[ $index ];

				// No `url` beside `item`: Google reads a list of ListItems as a
				// carousel, where the two are mutually exclusive, and reports the
				// page as invalid. The work's `@id` already points at its anchor
				// when it has no DOI.
				unset( $element['url'] );

				if ( isset( $citations[ $citation_id ] ) ) {
					$element['item'] = bibliography_builder_enrich_json_ld_work(
						$element['item'],
						$citations[ $citation_id ],
						$citation_id,
						$page_url
					);
				}

				$elements[ $index ] = $element;
			}

			$head = array(
				'@context' => isset( $list['@context'] ) ? $list['@context'] : 'https://schema.org',
				'@type'    => 'ItemList',
			);

			if ( '' !== $list_id ) {
				$head['@id'] = $list_id;
			}

			if ( '' !== $heading ) {
				$head['name'] = $heading;
			}

			$head['numberOfItems']   = count( $elements );
			$head['itemListElement'] = $elements;

			return $matches[1]
				. bibliography_builder_escape_for_script( bibliography_builder_json_stringify( $head ) )
				. $matches[3];
		},
		$block_content,
		1
	);

	return is_string( $enriched ) ? $enriched : $block_content;
}

/**
 * The full JSON-LD description of every work a post's bibliographies cite.
 *
 * Each work is the one the bibliography's own `ItemList` carries (the saved
 * baseline plus the render-time enrichment), with the same `@id`. Only
 * bibliographies that output JSON-LD count, and works are deduplicated by
 * `@id`, keeping the first.
 *
 * @since 1.19.0
 *
 * @param WP_Post|object|null $post     The post (any object with `post_content`); defaults to the queried post.
 * @param string|null         $page_url Page URL; defaults to its permalink.
 * @return array<int, array<string, mixed>>
 */
function bibliography_builder_get_cited_works( $post = null, $page_url = null ) {
	$can_query = function_exists( 'is_singular' ) && function_exists( 'get_queried_object' );

	if ( null === $post && $can_query && is_singular() ) {
		$post = get_queried_object();
	}

	if (
		! is_object( $post )
		|| ! isset( $post->post_content )
		|| false === strpos( (string) $post->post_content, 'wp:bibliography-builder/bibliography' )
	) {
		return array();
	}

	if ( null === $page_url ) {
		$page_url = bibliography_builder_json_ld_page_url( $post );
	}

	// Yoast asks twice per page (Article, then WebPage), so parse once.
	static $cache = array();
	$cache_key    = md5( $page_url . "\n" . $post->post_content );

	if ( isset( $cache[ $cache_key ] ) ) {
		return $cache[ $cache_key ];
	}

	$works = array();

	foreach ( bibliography_builder_collect_blocks( parse_blocks( (string) $post->post_content ) ) as $bibliography ) {
		if ( empty( $bibliography['outputJsonLd'] ) || empty( $bibliography['citations'] ) ) {
			continue;
		}

		foreach ( $bibliography['citations'] as $citation ) {
			if ( ! is_array( $citation ) || ! isset( $citation['csl'] ) || ! is_array( $citation['csl'] ) ) {
				continue;
			}

			$citation_id = isset( $citation['id'] ) && is_string( $citation['id'] ) ? $citation['id'] : '';
			$work        = bibliography_builder_enrich_json_ld_work(
				bibliography_builder_save_csl_to_json_ld( $citation['csl'] ),
				$citation['csl'],
				$citation_id,
				$page_url
			);

			if ( ! isset( $work['@id'] ) || isset( $works[ $work['@id'] ] ) ) {
				continue;
			}

			// A node inside another graph takes its context from the graph.
			unset( $work['@context'] );
			$works[ $work['@id'] ] = $work;
		}
	}

	$cache[ $cache_key ] = array_values( $works );

	return $cache[ $cache_key ];
}

/**
 * A short reference (type, `@id`, name) to every work a post's
 * bibliographies cite.
 *
 * The page's `citation` edge for graphs that sit beside the bibliography's
 * `ItemList` on the same page; the shared `@id` joins each reference to its
 * full description there. Only bibliographies that output JSON-LD count,
 * since a reference whose full description is not on the page would point
 * nowhere. Works are deduplicated by `@id`.
 *
 * @since 1.13.0
 *
 * @param WP_Post|object|null $post     The post (any object with `post_content`); defaults to the queried post.
 * @param string|null         $page_url Page URL; defaults to its permalink.
 * @return array<int, array{'@type': string, '@id': string, name?: string}>
 */
function bibliography_builder_get_cited_work_refs( $post = null, $page_url = null ) {
	$refs = array();

	foreach ( bibliography_builder_get_cited_works( $post, $page_url ) as $work ) {
		$ref = array(
			'@type' => $work['@type'],
			'@id'   => $work['@id'],
		);

		if ( isset( $work['name'] ) && '' !== $work['name'] ) {
			$ref['name'] = $work['name'];
		}

		$refs[] = $ref;
	}

	return $refs;
}

/**
 * Whether the page-to-works `citation` edge should be added.
 *
 * @return bool
 */
function bibliography_builder_should_link_page_citations() {
	/**
	 * Filters whether Borges adds the cited works to the page's SEO graph.
	 *
	 * @since 1.13.0
	 *
	 * @param bool $link Whether to add `citation` to the Article. Default true.
	 */
	return (bool) apply_filters( 'bibliography_builder_link_page_citations', true );
}

/**
 * Merge cited-work references into a schema.org node's `citation`.
 *
 * @param mixed $node Graph node; SEO plugin filters can pass any value.
 * @param array $refs References from bibliography_builder_get_cited_work_refs().
 * @return mixed
 */
function bibliography_builder_add_citations_to_node( $node, $refs ) {
	if ( ! is_array( $node ) || array() === $refs ) {
		return $node;
	}

	$existing = array();
	if ( isset( $node['citation'] ) ) {
		$is_list  = is_array( $node['citation'] ) && bibliography_builder_is_list_array( $node['citation'] );
		$existing = $is_list ? $node['citation'] : array( $node['citation'] );
	}

	$node['citation'] = array_merge( $existing, $refs );

	return $node;
}

/**
 * The post a Yoast SEO schema graph describes, from the context Yoast passes.
 *
 * Yoast also builds graphs outside the main query, for example when another
 * plugin calls `YoastSEO()->meta->for_post()`, as NLWeb's WordPress plugin
 * does to answer agents. There `is_singular()` is false and the queried
 * object is not the post, so the post must come from Yoast's context.
 *
 * @since 1.19.0
 *
 * @param mixed $context Yoast's meta tags context.
 * @return object|null The post (a `WP_Post` on a live site), or null to fall
 *                     back to the queried post.
 */
function bibliography_builder_yoast_context_post( $context ) {
	if ( ! is_object( $context ) || ! property_exists( $context, 'post' ) ) {
		return null;
	}

	$post = $context->post;

	return is_object( $post ) && isset( $post->post_content ) ? $post : null;
}

/**
 * Whether the cited works go into Yoast SEO's graph as full records.
 *
 * Yoast's schema aggregator (the feed NLWeb reads) and plugins that call
 * `YoastSEO()->meta->for_post()` see only Yoast's graph, never the
 * bibliography's own `ItemList`, so short references would reach them as
 * titles alone.
 *
 * @since 1.19.0
 *
 * @return bool
 */
function bibliography_builder_yoast_citation_records() {
	/**
	 * Filters whether the Article (or WebPage) Yoast SEO builds lists each
	 * cited work in full, or as a short reference (type, `@id`, name) to its
	 * description in the bibliography's `ItemList`.
	 *
	 * @since 1.19.0
	 *
	 * @param bool $full Whether to embed full records. Default true.
	 */
	return (bool) apply_filters( 'bibliography_builder_yoast_citation_records', true );
}

/**
 * The cited works for the post a Yoast SEO graph describes: full records,
 * or short references when `bibliography_builder_yoast_citation_records`
 * returns false.
 *
 * @since 1.19.0
 *
 * @param mixed $context Yoast's meta tags context.
 * @return array<int, array<string, mixed>>
 */
function bibliography_builder_yoast_cited_works( $context ) {
	$post     = bibliography_builder_yoast_context_post( $context );
	$page_url = null === $post ? null : bibliography_builder_json_ld_page_url( $post );

	if ( bibliography_builder_yoast_citation_records() ) {
		return bibliography_builder_get_cited_works( $post, $page_url );
	}

	return bibliography_builder_get_cited_work_refs( $post, $page_url );
}

/**
 * Yoast SEO: add the cited works to the Article piece.
 *
 * @since 1.13.0
 * @since 1.19.0 Reads the post from Yoast's context when it has one.
 *
 * @param mixed $data    Article piece.
 * @param mixed $context Yoast's meta tags context.
 * @return mixed
 */
function bibliography_builder_yoast_schema_article( $data, $context = null ) {
	if ( ! bibliography_builder_should_link_page_citations() ) {
		return $data;
	}

	return bibliography_builder_add_citations_to_node( $data, bibliography_builder_yoast_cited_works( $context ) );
}

/**
 * Yoast SEO: add the cited works to the WebPage piece on pages without an Article.
 *
 * @since 1.13.0
 * @since 1.19.0 Reads the post from Yoast's context when it has one.
 *
 * @param mixed $data    WebPage piece.
 * @param mixed $context Yoast's meta tags context.
 * @return mixed
 */
function bibliography_builder_yoast_schema_webpage( $data, $context = null ) {
	$has_article = is_object( $context ) && ! empty( $context->has_article );

	if ( $has_article || ! bibliography_builder_should_link_page_citations() ) {
		return $data;
	}

	return bibliography_builder_add_citations_to_node( $data, bibliography_builder_yoast_cited_works( $context ) );
}

/**
 * Rank Math: add the cited works to the page's article entity, else its WebPage.
 *
 * @since 1.13.0
 *
 * @param mixed $data Rank Math JSON-LD entities.
 * @return mixed
 */
function bibliography_builder_rank_math_json_ld( $data ) {
	if ( ! is_array( $data ) || ! bibliography_builder_should_link_page_citations() ) {
		return $data;
	}

	$refs = bibliography_builder_get_cited_work_refs();

	if ( array() === $refs ) {
		return $data;
	}

	$article_types = array( 'Article', 'BlogPosting', 'NewsArticle', 'ScholarlyArticle', 'TechArticle' );
	$fallback      = null;

	foreach ( $data as $key => $entity ) {
		$types = is_array( $entity ) && isset( $entity['@type'] ) ? (array) $entity['@type'] : array();

		if ( array() !== array_intersect( $types, $article_types ) ) {
			$data[ $key ] = bibliography_builder_add_citations_to_node( $entity, $refs );
			return $data;
		}

		if ( null === $fallback && in_array( 'WebPage', $types, true ) ) {
			$fallback = $key;
		}
	}

	if ( null !== $fallback ) {
		$data[ $fallback ] = bibliography_builder_add_citations_to_node( $data[ $fallback ], $refs );
	}

	return $data;
}

/**
 * Whether an SEO plugin Borges adds `citation` to is building the page graph.
 *
 * @return bool
 */
function bibliography_builder_has_seo_graph_plugin() {
	return defined( 'WPSEO_VERSION' ) || class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' );
}

/**
 * The page's own `WebPage` node with its `citation` edges, for sites whose
 * SEO plugin, if any, is not one Borges extends.
 *
 * @since 1.17.0
 *
 * @param WP_Post|null $post     The post; defaults to the queried post.
 * @param string|null  $page_url Page URL; defaults to its permalink.
 * @return array<string, mixed>|null The node, or null when there is nothing to link.
 */
function bibliography_builder_page_citation_node( $post = null, $page_url = null ) {
	if ( bibliography_builder_has_seo_graph_plugin() || ! bibliography_builder_should_link_page_citations() ) {
		return null;
	}

	$can_query = function_exists( 'is_singular' ) && function_exists( 'get_queried_object' );

	if ( null === $post && $can_query && is_singular() ) {
		$queried = get_queried_object();
		$post    = $queried instanceof WP_Post ? $queried : null;
	}

	// A password-protected post shows its bibliography only to readers who
	// gave the password, so the head must not list the works either.
	$locked = null !== $post && ! empty( $post->ID ) && function_exists( 'post_password_required' )
		&& post_password_required( $post );

	if ( $locked ) {
		return null;
	}

	if ( null === $page_url ) {
		$page_url = bibliography_builder_json_ld_page_url();
	}

	$refs = bibliography_builder_get_cited_work_refs( $post, $page_url );

	if ( array() === $refs || '' === $page_url ) {
		return null;
	}

	$node = array(
		'@context' => 'https://schema.org',
		'@type'    => 'WebPage',
		'@id'      => $page_url,
		'url'      => $page_url,
		'citation' => $refs,
	);

	/**
	 * Filters the page node Borges prints when no supported SEO plugin builds
	 * the page graph. Return null to print nothing, for example when the
	 * theme or another plugin already describes the page.
	 *
	 * @since 1.17.0
	 *
	 * @param array<string, mixed>|null $node     The `WebPage` node with `citation`.
	 * @param string                    $page_url The page URL, also its `@id`.
	 */
	$node = apply_filters( 'bibliography_builder_page_citation_node', $node, $page_url );

	return is_array( $node ) ? $node : null;
}

/**
 * Print the page's `WebPage` citation node in the document head.
 *
 * @since 1.17.0
 *
 * @return void
 */
function bibliography_builder_print_page_citation_node() {
	if ( ! function_exists( 'is_singular' ) || ! is_singular() ) {
		return;
	}

	$node = bibliography_builder_page_citation_node();

	if ( null === $node ) {
		return;
	}

	$json = bibliography_builder_json_encode( $node, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );

	if ( false === $json ) {
		return;
	}

	$json = bibliography_builder_escape_for_script( $json );

	// Escaped for a script element above; JSON-LD is data, never executed.
	// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '<script type="application/ld+json" class="bibliography-builder-page-citations">' . $json . "</script>\n";
}

// After the pre-1.11.0 nesting filter, which runs at the default priority.
add_filter( 'render_block_bibliography-builder/bibliography', 'bibliography_builder_enrich_rendered_json_ld', 11, 2 );
add_filter( 'wpseo_schema_article', 'bibliography_builder_yoast_schema_article', 10, 2 );
add_filter( 'wpseo_schema_webpage', 'bibliography_builder_yoast_schema_webpage', 10, 2 );
add_filter( 'rank_math/json_ld', 'bibliography_builder_rank_math_json_ld', 99 );
add_action( 'wp_head', 'bibliography_builder_print_page_citation_node', 99 );
