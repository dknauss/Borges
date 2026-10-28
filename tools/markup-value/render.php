<?php
/**
 * Renders the markup-value sample pages (see README.md).
 *
 * Builds three HTML pages from corpus.json, each the same short article with
 * the same reference list, so any difference a measurement finds comes from
 * the list markup alone:
 *
 * - plain.html          The formatted citations in a core List block, with
 *                       their DOIs and URLs as links (a generous baseline:
 *                       pasted citations usually keep their URLs as text).
 * - borges-default.html The Borges block with its default output (JSON-LD on;
 *                       COinS, CSL-JSON, and Cite / Export off).
 * - borges-full.html    The Borges block with every output layer on.
 *
 * Citations are formatted by the plugin's own citeproc formatter and saved
 * by its PHP port of save(), the render-time JSON-LD and COinS enrichment
 * run as they do on a live site, and every page carries the same Article JSON-LD an SEO
 * plugin would print. On the Borges pages that Article gains the cited works
 * as schema.org `citation`, through the Yoast SEO integration.
 *
 * Runs on the PHPUnit bootstrap's WordPress stubs, so it needs no WordPress
 * install: `composer install`, then `php tools/markup-value/render.php`.
 *
 * Not part of the plugin package (tools/ is in .distignore).
 *
 * @package BibliographyBuilder
 */

// phpcs:disable WordPress.WP.AlternativeFunctions -- A CLI tool, not plugin code.

require_once dirname( __DIR__, 2 ) . '/tests/phpunit/bootstrap.php';

const BORGES_MV_PAGE_URL = 'https://example.org/what-a-bibliography-tells-machines/';

$borges_mv_dir    = __DIR__;
// MV_CORPUS, MV_STYLE, and MV_OUT let the same pages be built from another
// corpus or in another style, into another folder (see README.md).
$borges_mv_out    = getenv( 'MV_OUT' ) ? (string) getenv( 'MV_OUT' ) : $borges_mv_dir . '/out';
$borges_mv_corpus = json_decode( (string) file_get_contents( getenv( 'MV_CORPUS' ) ? (string) getenv( 'MV_CORPUS' ) : $borges_mv_dir . '/corpus.json' ), true );

if ( getenv( 'MV_STYLE' ) ) {
	$borges_mv_corpus['citationStyle'] = (string) getenv( 'MV_STYLE' );
}

if ( ! is_dir( $borges_mv_out ) ) {
	mkdir( $borges_mv_out, 0777, true );
}

add_filter(
	'bibliography_builder_json_ld_page_url',
	static function () {
		return BORGES_MV_PAGE_URL;
	}
);

/**
 * Escapes text for HTML, as esc_html() would.
 *
 * @param string $text Text.
 * @return string
 */
function borges_mv_esc( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
}

/**
 * Serializes one block the way serialize_block() does for a block without
 * inner blocks.
 *
 * @param string $name  Block name.
 * @param array  $attrs Block attributes.
 * @param string $html  Saved markup.
 * @return string
 */
function borges_mv_serialize_block( $name, $attrs, $html ) {
	$short = 0 === strpos( $name, 'core/' ) ? substr( $name, 5 ) : $name;
	$json  = empty( $attrs ) ? '' : serialize_block_attributes( $attrs ) . ' ';

	return '<!-- wp:' . $short . ' ' . $json . "-->\n" . $html . "\n<!-- /wp:" . $short . ' -->';
}

/**
 * Turns the URLs in formatted citation text into links, leaving the rest of
 * the (already escaped) HTML alone.
 *
 * @param string $html Formatted citation HTML.
 * @return string
 */
function borges_mv_link_urls( $html ) {
	return (string) preg_replace_callback(
		'#https?://[^\s<>"]+[^\s<>".,;:)\]]#',
		static function ( $match ) {
			return '<a href="' . $match[0] . '">' . $match[0] . '</a>';
		},
		$html
	);
}

/**
 * The Article node an SEO plugin prints for the post, before Borges adds to it.
 *
 * @param array $corpus Corpus data.
 * @return array
 */
function borges_mv_article_node( $corpus ) {
	return array(
		'@context'         => 'https://schema.org',
		'@type'            => 'Article',
		'@id'              => BORGES_MV_PAGE_URL . '#article',
		'headline'         => $corpus['title'],
		'description'      => $corpus['description'],
		'datePublished'    => '2026-10-27T12:00:00+00:00',
		'author'           => array(
			'@type' => 'Person',
			'name'  => 'Sample Author',
		),
		'mainEntityOfPage' => BORGES_MV_PAGE_URL,
		'image'            => 'https://example.org/wp-content/uploads/sample.png',
	);
}

/**
 * Wraps the post content in the same minimal theme page for every variant.
 *
 * @param array  $corpus  Corpus data.
 * @param string $body    Rendered post content.
 * @param array  $article Article JSON-LD node.
 * @param bool   $borges  Whether to load the block's front-end CSS and script.
 * @return string
 */
function borges_mv_page( $corpus, $body, $article, $borges ) {
	$assets = '';

	if ( $borges ) {
		$assets  = "\t<link rel=\"stylesheet\" href=\"assets/style-index.css\">\n";
		$assets .= "\t<script src=\"assets/view.js\" defer></script>\n";
	}

	$json = wp_json_encode( $article, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );

	return '<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>' . borges_mv_esc( $corpus['title'] ) . '</title>
	<meta name="description" content="' . borges_mv_esc( $corpus['description'] ) . '">
	<link rel="canonical" href="' . BORGES_MV_PAGE_URL . '">
	<style>body{font:18px/1.6 Georgia,serif;max-width:42rem;margin:2rem auto;padding:0 1rem;color:#1e1e1e;background:#fff}a{color:#0b57d0}</style>
' . $assets . '	<script type="application/ld+json">' . $json . '</script>
</head>
<body>
<main>
<article>
<h1>' . borges_mv_esc( $corpus['title'] ) . '</h1>
<p>Citations carry more than prose: each names a work that a reader, a search engine, or a language model may want to find again. This page cites Harris et al. (2020), LeCun et al. (2015), and the FAIR principles (Wilkinson et al., 2016), among others.</p>
<h2>References</h2>
' . $body . '
</article>
</main>
</body>
</html>
';
}

$style     = $borges_mv_corpus['citationStyle'];
$csl_items = bibliography_builder_validate_and_sanitize_csl_items( $borges_mv_corpus['items'] );

if ( is_wp_error( $csl_items ) ) {
	fwrite( STDERR, 'Invalid corpus: ' . $csl_items->get_error_message() . "\n" );
	exit( 1 );
}

$formatted = bibliography_builder_format_csl_items( $csl_items, $style );

if ( is_wp_error( $formatted ) ) {
	fwrite( STDERR, 'Formatting failed: ' . $formatted->get_error_message() . "\n" );
	exit( 1 );
}

$citations = array();

foreach ( array_values( $csl_items ) as $index => $csl ) {
	$citations[] = array(
		'id'            => $borges_mv_corpus['items'][ $index ]['id'],
		'csl'           => $csl,
		'formattedText' => $formatted[ $index ],
	);
}

$citations = bibliography_builder_sort_citations_for_save( $citations, $style );

// Baseline: the same formatted entries, in the same order, as a List block.
$plain_items = '';

foreach ( $citations as $citation ) {
	$plain_items .= '<li>' . borges_mv_link_urls( $citation['formattedText'] ) . '</li>';
}

$plain_body = borges_mv_serialize_block( 'core/list', array(), '<ul class="wp-block-list">' . $plain_items . '</ul>' );

$variants = array(
	'plain'          => null,
	'borges-default' => array(),
	'borges-full'    => array(
		'outputCoins'      => true,
		'outputCslJson'    => true,
		'outputCiteExport' => true,
	),
);

$manifest = array(
	'pageUrl'  => BORGES_MV_PAGE_URL,
	'style'    => $style,
	// Display order, which the plain list shares; measure.mjs matches its
	// entries to the corpus by position.
	'order'    => array_column( $citations, 'id' ),
	'variants' => array(),
);

foreach ( $variants as $name => $overrides ) {
	$article = borges_mv_article_node( $borges_mv_corpus );

	if ( null === $overrides ) {
		$saved = $plain_body;
		$body  = preg_replace( '#<!-- /?wp:[^>]*-->\n?#', '', $plain_body );
	} else {
		$attrs = array_merge(
			array(
				'bibliographyId'   => 'markup-value',
				'citationStyle'    => $style,
				'headingText'      => '',
				'outputJsonLd'     => true,
				'outputCoins'      => false,
				'outputCslJson'    => false,
				'outputCiteExport' => false,
				'citations'        => $citations,
			),
			$overrides
		);

		$html   = bibliography_builder_render_save_markup( bibliography_builder_decode_save_attributes( wp_json_encode( $attrs ) ) );
		$saved  = borges_mv_serialize_block( 'bibliography-builder/bibliography', $attrs, $html );
		$parsed = array(
			'blockName'    => 'bibliography-builder/bibliography',
			'attrs'        => $attrs,
			'innerHTML'    => $html,
			'innerContent' => array( $html ),
		);

		// The render_block filters a live site runs, in priority order.
		$body = bibliography_builder_nest_rendered_json_ld( $html );
		$body = bibliography_builder_enrich_rendered_json_ld( $body, $parsed );
		$body = bibliography_builder_enrich_rendered_coins( $body, $parsed );

		// What Yoast SEO's Article piece becomes with Borges active. The
		// bootstrap's parse_blocks() stub only returns what it was given.
		bibliography_builder_test_set_parsed_blocks( $saved, ( new WP_Block_Parser() )->parse( $saved ) );
		$post    = (object) array(
			'ID'           => 1,
			'post_content' => $saved,
		);
		$article = bibliography_builder_add_citations_to_node(
			$article,
			bibliography_builder_get_cited_work_refs( $post, BORGES_MV_PAGE_URL )
		);
	}

	$page = borges_mv_page( $borges_mv_corpus, $body, $article, null !== $overrides );

	file_put_contents( $borges_mv_out . '/' . $name . '.html', $page );
	file_put_contents( $borges_mv_out . '/' . $name . '.post-content.html', $saved . "\n" );

	$manifest['variants'][ $name ] = array(
		'page'             => $name . '.html',
		'pageBytes'        => strlen( $page ),
		'postContentBytes' => strlen( $saved ),
	);
}

file_put_contents( $borges_mv_out . '/manifest.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n" );

echo 'Wrote ' . count( $variants ) . ' pages to ' . $borges_mv_out . "\n";
