/**
 * The bibliography entries an in-text citation can point at.
 *
 * The "Cite" format (src/formats/citation.js) lists every entry of every
 * Borges bibliography block in the post being edited. Each entry is linked by
 * the `ref-{id}` element ID that save() writes on its `<li>`, so the link is
 * a plain fragment link that works with no script on the page.
 *
 * Citation IDs are random UUIDs set once, when an entry is added, and kept
 * through re-sorting, style changes, and edits to the entry. An entry gets a
 * new ID, and links to the old one stop working, when it is deleted and added
 * again, or when its whole block is duplicated (the later copy is re-keyed,
 * see src/lib/stable-ids.js).
 */

import { sortCitations } from './sorter';
import { getStyleDefinition } from './formatting/style-registry';
import { stripInlineMarkup } from './formatting';
import { BIBLIOGRAPHY_BLOCK_NAME, isStableCitationId } from './stable-ids';
import {
	getShortFormFamily,
	getShortNames,
	getShortYear,
	joinShortNames,
} from './citation-short-form';

/**
 * @typedef {Object} CitableEntry
 * @property {string} id       Citation ID (the `<li>` is `ref-{id}`).
 * @property {number} number   1-based position in its bibliography's list.
 * @property {Object} csl      CSL-JSON item.
 * @property {string} author   Short author names, or an empty string.
 * @property {string} year     Year, or "n.d.".
 * @property {string} title    Full title as plain text.
 * @property {string} styleKey The bibliography's style key.
 */

/**
 * @typedef {Object} CitableBibliography
 * @property {string}         clientId       Editor client ID.
 * @property {string}         bibliographyId Stable block ID, if any.
 * @property {string}         styleKey       Citation style key.
 * @property {string}         family         Style family.
 * @property {string}         label          Heading text, else "Bibliography n".
 * @property {CitableEntry[]} entries        Entries in list order.
 */

/**
 * Bibliography blocks in document order, including nested ones.
 *
 * @param {Array} blocks Block tree, as the block editor store gives it.
 * @return {Array} Bibliography blocks.
 */
export function findBibliographyBlocks( blocks ) {
	const found = [];
	const walk = ( list ) => {
		for ( const block of Array.isArray( list ) ? list : [] ) {
			if ( ! block || typeof block !== 'object' ) {
				continue;
			}

			if ( block.name === BIBLIOGRAPHY_BLOCK_NAME ) {
				found.push( block );
			}

			walk( block.innerBlocks );
		}
	};

	walk( blocks );

	return found;
}

/**
 * The citable entries of every bibliography block in a block tree.
 *
 * Entries come in the order save() lists them (sortCitations() with its
 * defaults, which are save()'s options), so a numeric style's `number` is the
 * number a reader sees. Citations without a usable ID are left out: they get
 * one as soon as their block is loaded in the editor.
 *
 * @param {Array} blocks Block tree.
 * @return {CitableBibliography[]} Bibliographies with at least one entry.
 */
export function collectCitableBibliographies( blocks ) {
	return findBibliographyBlocks( blocks )
		.map( ( block, blockIndex ) => {
			const attributes = block.attributes || {};
			const styleKey = getStyleDefinition( attributes.citationStyle ).key;
			const citations = (
				Array.isArray( attributes.citations )
					? attributes.citations
					: []
			).filter(
				( citation ) =>
					citation &&
					typeof citation === 'object' &&
					citation.csl &&
					typeof citation.csl === 'object'
			);
			const sorted = sortCitations( citations, styleKey );
			const entries = sorted
				.map( ( citation, index ) => ( {
					id: citation.id,
					number: index + 1,
					csl: citation.csl,
					author: joinShortNames( getShortNames( citation.csl ) ),
					year: getShortYear( citation.csl ),
					title: stripInlineMarkup(
						String( citation.csl.title ?? '' )
					).trim(),
					styleKey,
				} ) )
				.filter( ( entry ) => isStableCitationId( entry.id ) );
			const heading = stripInlineMarkup(
				String( attributes.headingText ?? '' )
			).trim();

			return {
				clientId: block.clientId,
				bibliographyId: attributes.bibliographyId || '',
				styleKey,
				family: getShortFormFamily( styleKey ),
				label: heading || `Bibliography ${ blockIndex + 1 }`,
				entries,
			};
		} )
		.filter( ( bibliography ) => bibliography.entries.length > 0 );
}

/**
 * Whether an entry matches a search query: every word of the query appears in
 * its author, year, or title, ignoring case and accents.
 *
 * @param {CitableEntry} entry Entry.
 * @param {string}       query Search text.
 * @return {boolean} True when it matches, or the query is blank.
 */
export function entryMatchesQuery( entry, query ) {
	const words = fold( query ).split( /\s+/ ).filter( Boolean );

	if ( ! words.length ) {
		return true;
	}

	const haystack = fold(
		[ entry.author, entry.year, entry.title, entry.number ].join( ' ' )
	);

	return words.every( ( word ) => haystack.includes( word ) );
}

/**
 * Bibliographies with only the entries that match a query; empty ones drop.
 *
 * @param {CitableBibliography[]} bibliographies Bibliographies.
 * @param {string}                query          Search text.
 * @return {CitableBibliography[]} Filtered bibliographies.
 */
export function filterCitableBibliographies( bibliographies, query ) {
	return bibliographies
		.map( ( bibliography ) => ( {
			...bibliography,
			entries: bibliography.entries.filter( ( entry ) =>
				entryMatchesQuery( entry, query )
			),
		} ) )
		.filter( ( bibliography ) => bibliography.entries.length > 0 );
}

/**
 * Find an entry by citation ID.
 *
 * @param {CitableBibliography[]} bibliographies Bibliographies.
 * @param {string}                id             Citation ID.
 * @return {CitableEntry|null} The entry, or null.
 */
export function findCitableEntry( bibliographies, id ) {
	for ( const bibliography of bibliographies ) {
		const entry = bibliography.entries.find(
			( candidate ) => candidate.id === id
		);

		if ( entry ) {
			return entry;
		}
	}

	return null;
}

/**
 * The fragment a citation links to: save()'s `<li id="ref-{id}">`.
 *
 * @param {string} id Citation ID.
 * @return {string} `#ref-{id}`, with the ID percent-encoded where needed.
 */
export function getEntryHref( id ) {
	return `#ref-${ encodeURIComponent( id ) }`;
}

/**
 * Lowercase text without accents, for matching.
 *
 * @param {unknown} value Text.
 * @return {string} Folded text.
 */
function fold( value ) {
	return String( value ?? '' )
		.normalize( 'NFD' )
		.replace( /[̀-ͯ]/g, '' )
		.toLowerCase();
}
