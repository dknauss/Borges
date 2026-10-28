/**
 * Source-type groups: OSCOLA's tables of primary sources.
 *
 * OSCOLA 5 (2026) lists primary sources in tables before the bibliography:
 * the table of cases first, then legislation, then other tables such as
 * treaties (§1.6), and leaves them out of the bibliography of secondary
 * sources, which is one list, not divided by type (§1.7). A style that
 * declares `groups` in includes/styles.json gets that shape: each group names
 * the CSL types it takes, and the one whose `types` is "*" takes the rest.
 *
 * Groups are shown only when a bibliography holds an entry for a group other
 * than the catch-all, so a list of secondary sources alone saves exactly as
 * it did before groups existed.
 *
 * Mirrored by bibliography_builder_save_style_groups() and
 * bibliography_builder_save_group_citations() in includes/save-sort.php; the
 * save-parity fixtures pin the two together.
 */

import { getStyleDefinition } from './formatting/style-registry';

/**
 * @typedef {Object} SourceGroup
 * @property {string}          key         Group key, such as "cases".
 * @property {string}          label       Group label, saved in English.
 * @property {string[]|string} types       CSL types, or "*" for the rest.
 * @property {boolean}         romanTitles Whether titles stay roman, as case
 *                                         names do in a table of cases.
 */

/**
 * The style's source-type groups, or null when it declares none.
 *
 * @param {string} styleKey Citation style key.
 * @return {SourceGroup[]|null} Groups, in the order they are shown.
 */
export function getStyleGroups( styleKey ) {
	const { groups } = getStyleDefinition( styleKey );

	if ( ! Array.isArray( groups ) || groups.length === 0 ) {
		return null;
	}

	return groups.map( ( group ) => ( {
		key: group.key,
		label: group.label,
		types: group.types,
		romanTitles: group.romanTitles === true,
	} ) );
}

/**
 * The index of the group a CSL item belongs to.
 *
 * @param {Object}        csl    CSL-JSON item.
 * @param {SourceGroup[]} groups Groups from getStyleGroups().
 * @return {number} Group index; the catch-all's for a type no group lists.
 */
export function getGroupIndex( csl, groups ) {
	const type = csl?.type;
	const listed = groups.findIndex(
		( group ) =>
			Array.isArray( group.types ) && group.types.includes( type )
	);

	return listed !== -1
		? listed
		: groups.findIndex( ( group ) => group.types === '*' );
}

/**
 * Where a CSL item's type comes in its group's `types`, so statutory
 * instruments (`regulation`) follow statutes, as OSCOLA 5 §1.6.3 asks.
 *
 * @param {Object}      csl   CSL-JSON item.
 * @param {SourceGroup} group Its group.
 * @return {number} Rank; 0 in the catch-all group.
 */
export function getTypeRank( csl, group ) {
	return Array.isArray( group.types )
		? Math.max( group.types.indexOf( csl?.type ), 0 )
		: 0;
}

/**
 * Split sorted citations into their groups, for display.
 *
 * @param {Array}  citations Citations, already in sortCitations() order.
 * @param {string} styleKey  Citation style key.
 * @return {Array<SourceGroup & {citations: Array}>|null} Non-empty groups in
 *         order, or null when the style has no groups or every citation
 *         falls in the catch-all, so the list is shown ungrouped.
 */
export function groupCitations( citations, styleKey ) {
	const groups = getStyleGroups( styleKey );

	if ( ! groups ) {
		return null;
	}

	const buckets = groups.map( ( group ) => ( { ...group, citations: [] } ) );

	for ( const citation of citations ) {
		const index = getGroupIndex( citation.csl, groups );

		buckets[ index === -1 ? buckets.length - 1 : index ].citations.push(
			citation
		);
	}

	const primary = buckets.some(
		( bucket ) => bucket.types !== '*' && bucket.citations.length > 0
	);

	return primary
		? buckets.filter( ( bucket ) => bucket.citations.length > 0 )
		: null;
}

/**
 * The element for group labels: one level below the block heading, or a
 * paragraph when the block heading is a paragraph or an `h6`, so groups never
 * add headings the author did not ask for.
 *
 * @param {string} headingTag The block heading's tag (getHeadingTag()).
 * @return {string} `h3`–`h6`, or `p`.
 */
export function getGroupLabelTag( headingTag ) {
	const level = /^h([2-5])$/.exec( headingTag || '' );

	return level ? `h${ Number( level[ 1 ] ) + 1 }` : 'p';
}
