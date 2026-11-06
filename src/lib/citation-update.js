/**
 * Bring in-text citations up to date with their bibliography.
 *
 * A citation's text is fixed when the "Cite" format inserts it
 * (src/formats/citation.js). When the bibliography's style changes, or a
 * numeric style's numbering shifts, the text no longer matches. This module
 * finds citation links in block HTML and rewrites the ones the editor
 * generated, so the writer does not have to redo each one.
 *
 * Rules:
 *
 * - A citation is "generated" when its text equals the short form that some
 *   style family gives its entry with its locator: notes, author-date with the
 *   year, author-date without it (MLA), or numeric with any number. Otherwise
 *   it is "reworded", and is left alone unless the caller asks to replace
 *   reworded citations too.
 * - The locator comes from the link's `data-locator`. A citation made before
 *   `data-locator` existed has none; its locator is recovered by matching the
 *   text against each family's short form with a locator in it. A recovered
 *   locator is written to `data-locator` when the citation is updated. A
 *   legacy citation whose text matches no form is reworded.
 * - Citations whose entry is in no bibliography of the post are counted as
 *   missing and left alone. Citations of another bibliography in the post are
 *   ignored.
 *
 * Only the citation links change. The rest of the HTML is kept byte for byte:
 * the new link is spliced into the original string, with its text escaped.
 */

import {
	getShortFormSegments,
	getShortFormText,
	normalizeLocator,
} from './citation-short-form';
import { collectCitableBibliographies } from './citation-entries';
import { BIBLIOGRAPHY_BLOCK_NAME } from './stable-ids';

export const CITATION_LINK_CLASS = 'bibliography-builder-citation';

/**
 * One style key per short form, in the order a legacy locator is recovered.
 * Author-date with the year comes before MLA, so "(Illich 1973, 12)" gives
 * the locator "12", not "1973, 12".
 */
const FAMILY_SAMPLE_STYLES = [
	'chicago-notes-bibliography',
	'chicago-author-date',
	'mla-9',
];

// Stands in for a locator when a short form is split around it. Letters
// only, so normalizeLocator() keeps it as it is.
const LOCATOR_PLACEHOLDER = 'BorgesLocatorPlaceholder';

// An opening <a> tag; quoted attribute values may hold ">".
const OPEN_A_TAG = /<a\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const CLOSE_A_TAG = /<\/a\s*>/gi;

/**
 * @typedef {Object} CitationLink
 * @property {number}      start     Offset of the opening tag.
 * @property {number}      end       Offset just after the closing tag.
 * @property {string}      openTag   The opening tag as written.
 * @property {string}      innerHtml The link's content as written.
 * @property {string}      ref       `data-bibliography-ref`.
 * @property {string|null} locator   `data-locator`, or null when absent.
 * @property {string}      text      The link's text, spaces collapsed.
 */

/**
 * @typedef {Object} CitationClassification
 * @property {'generated'|'reworded'} status    Whether the editor made the text.
 * @property {string}                 locator   Locator to keep.
 * @property {boolean}                recovered Whether the locator was read
 *                                              from the text of a citation
 *                                              with no `data-locator`.
 */

/**
 * @typedef {Object} CitationUpdateCounts
 * @property {number} total     Citations of this bibliography's entries.
 * @property {number} updated   Citations rewritten.
 * @property {number} unchanged Generated citations already current.
 * @property {number} reworded  Reworded citations: skipped, or, when
 *                              replacing them, rewritten (and counted in
 *                              `updated` too).
 * @property {number} stale     Generated citations whose text does not match
 *                              the current style (what an update would
 *                              reword, reworded ones aside).
 * @property {number} missing   Citations of entries in no bibliography.
 */

/**
 * @typedef {Object} CitationUpdateOptions
 * @property {boolean}     [includeReworded] Replace reworded citations too.
 * @property {Set<string>} [knownIds]        Every entry ID in the post's
 *                                           bibliographies; refs outside it
 *                                           count as missing. Defaults to
 *                                           this bibliography's IDs.
 */

/**
 * Parse an HTML fragment in an inert document (no scripts run, nothing
 * loads).
 *
 * @param {string} html HTML fragment.
 * @return {HTMLElement} The document body holding the fragment.
 */
function parseFragment( html ) {
	return new window.DOMParser().parseFromString(
		`<!DOCTYPE html><body>${ html }</body>`,
		'text/html'
	).body;
}

/**
 * Text with whitespace (including no-break spaces) collapsed and trimmed.
 *
 * @param {string} text Text.
 * @return {string} Normalized text.
 */
function normalizeText( text ) {
	return String( text ?? '' )
		.replace( /\s+/g, ' ' )
		.trim();
}

/**
 * Escape text for an HTML text node.
 *
 * @param {string} text Plain text.
 * @return {string} Escaped text.
 */
export function escapeHtmlText( text ) {
	return String( text )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' );
}

/**
 * Escape text for a double-quoted attribute value.
 *
 * @param {string} text Plain text.
 * @return {string} Escaped text.
 */
function escapeAttribute( text ) {
	return escapeHtmlText( text ).replace( /"/g, '&quot;' );
}

/**
 * Whether a string may hold a citation link (a cheap test before parsing).
 *
 * @param {unknown} html Value.
 * @return {boolean} True when it mentions the citation class.
 */
export function mayContainCitations( html ) {
	return typeof html === 'string' && html.includes( CITATION_LINK_CLASS );
}

/**
 * The citation links in an HTML string, in order.
 *
 * Links cannot nest in HTML, so each one ends at the next `</a>`.
 *
 * @param {string} html HTML.
 * @return {CitationLink[]} Citation links.
 */
export function findCitationLinks( html ) {
	if ( ! mayContainCitations( html ) ) {
		return [];
	}

	const links = [];

	OPEN_A_TAG.lastIndex = 0;

	let match;

	while ( ( match = OPEN_A_TAG.exec( html ) ) !== null ) {
		const openTag = match[ 0 ];
		const element = parseFragment( `${ openTag }</a>` ).querySelector(
			'a'
		);

		if (
			! element ||
			! element.classList.contains( CITATION_LINK_CLASS )
		) {
			continue;
		}

		const innerStart = match.index + openTag.length;

		CLOSE_A_TAG.lastIndex = innerStart;

		const close = CLOSE_A_TAG.exec( html );

		if ( ! close ) {
			break;
		}

		const innerHtml = html.slice( innerStart, close.index );

		links.push( {
			start: match.index,
			end: close.index + close[ 0 ].length,
			openTag,
			innerHtml,
			ref: element.getAttribute( 'data-bibliography-ref' ) || '',
			locator: element.getAttribute( 'data-locator' ),
			text: normalizeText( parseFragment( innerHtml ).textContent ),
		} );

		OPEN_A_TAG.lastIndex = close.index + close[ 0 ].length;
	}

	return links;
}

/**
 * The texts the non-numeric families give an entry with a locator.
 *
 * @param {Object} csl     CSL-JSON item.
 * @param {string} locator Locator.
 * @return {string[]} Texts, normalized.
 */
function getFamilyTexts( csl, locator ) {
	return FAMILY_SAMPLE_STYLES.map( ( styleKey ) =>
		normalizeText( getShortFormText( csl, styleKey, { locator } ) )
	);
}

/**
 * Whether text is a numeric citation, "[n]" or "[n, locator]", for any n.
 *
 * @param {string} text    Normalized text.
 * @param {string} locator Locator, or an empty string.
 * @return {boolean} True when it matches.
 */
function isNumericText( text, locator ) {
	const match = text.match( /^\[(?:\d+|\?)(?:, (.+))?\]$/ );

	return Boolean( match ) && ( match[ 1 ] || '' ) === locator;
}

/**
 * Whether text is a short form some family gives the entry with a locator.
 *
 * @param {string} text    Normalized text.
 * @param {Object} csl     CSL-JSON item.
 * @param {string} locator Locator, or an empty string.
 * @return {boolean} True when it matches.
 */
export function isGeneratedText( text, csl, locator ) {
	return (
		getFamilyTexts( csl, locator ).includes( text ) ||
		isNumericText( text, locator )
	);
}

/**
 * Read the locator out of a citation that has no `data-locator`, by matching
 * its text against each family's short form with a locator in it.
 *
 * @param {string} text Normalized text.
 * @param {Object} csl  CSL-JSON item.
 * @return {string|null} The locator, or null when no form matches.
 */
export function recoverLocator( text, csl ) {
	for ( const sample of getFamilyTexts( csl, LOCATOR_PLACEHOLDER ) ) {
		const at = sample.indexOf( LOCATOR_PLACEHOLDER );

		if ( at < 0 ) {
			continue;
		}

		const prefix = sample.slice( 0, at );
		const suffix = sample.slice( at + LOCATOR_PLACEHOLDER.length );

		if (
			text.length > prefix.length + suffix.length &&
			text.startsWith( prefix ) &&
			text.endsWith( suffix )
		) {
			const locator = normalizeLocator(
				text.slice( prefix.length, text.length - suffix.length )
			);

			if ( locator ) {
				return locator;
			}
		}
	}

	const numeric = text.match( /^\[(?:\d+|\?), (.+)\]$/ );

	return numeric ? normalizeLocator( numeric[ 1 ] ) || null : null;
}

/**
 * Decide whether the editor generated a citation, and which locator it has.
 *
 * @param {CitationLink} link Citation link.
 * @param {Object}       csl  The entry's CSL-JSON.
 * @return {CitationClassification} Classification.
 */
export function classifyCitation( link, csl ) {
	if ( link.locator !== null ) {
		const locator = normalizeLocator( link.locator );

		return {
			status: isGeneratedText( link.text, csl, locator )
				? 'generated'
				: 'reworded',
			locator,
			recovered: false,
		};
	}

	if ( isGeneratedText( link.text, csl, '' ) ) {
		return { status: 'generated', locator: '', recovered: false };
	}

	const recovered = recoverLocator( link.text, csl );

	return recovered
		? { status: 'generated', locator: recovered, recovered: true }
		: { status: 'reworded', locator: '', recovered: false };
}

/**
 * The current short form for an entry as HTML: escaped text, italics as
 * `<em>`, as the "Cite" format inserts it.
 *
 * @param {Object} entry   Citable entry (`csl`, `styleKey`, `number`).
 * @param {string} locator Locator.
 * @return {string} HTML.
 */
export function getShortFormHtml( entry, locator ) {
	return getShortFormSegments( entry.csl, entry.styleKey, {
		locator,
		number: entry.number,
	} )
		.map( ( segment ) =>
			segment.italic
				? `<em>${ escapeHtmlText( segment.text ) }</em>`
				: escapeHtmlText( segment.text )
		)
		.join( '' );
}

/**
 * An opening tag with `data-locator` set to a value. An existing attribute is
 * replaced in place; a new one goes last, where the "Cite" format writes it.
 *
 * @param {string} openTag Opening tag.
 * @param {string} locator Locator; empty leaves the tag as it is.
 * @return {string} Opening tag.
 */
export function setLocatorOnTag( openTag, locator ) {
	if ( ! locator ) {
		return openTag;
	}

	const attribute = `data-locator="${ escapeAttribute( locator ) }"`;
	const existing = /\sdata-locator\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/i;

	if ( existing.test( openTag ) ) {
		return openTag.replace( existing, ` ${ attribute }` );
	}

	return openTag.replace( /\s*\/?>$/, ` ${ attribute }>` );
}

/**
 * HTML in a canonical form, for telling a real change from a difference in
 * escaping.
 *
 * @param {string} html HTML.
 * @return {string} Canonical HTML.
 */
function canonicalHtml( html ) {
	return parseFragment( html ).innerHTML;
}

/**
 * Empty counts.
 *
 * @return {CitationUpdateCounts} Counts.
 */
export function emptyCounts() {
	return {
		total: 0,
		updated: 0,
		unchanged: 0,
		reworded: 0,
		stale: 0,
		missing: 0,
	};
}

/**
 * Add one set of counts to another.
 *
 * @param {CitationUpdateCounts} into Counts to add to (changed).
 * @param {CitationUpdateCounts} from Counts to add.
 * @return {CitationUpdateCounts} `into`.
 */
function addCounts( into, from ) {
	for ( const key of Object.keys( into ) ) {
		into[ key ] += from[ key ];
	}

	return into;
}

/**
 * Update the citations of one bibliography in an HTML string.
 *
 * @param {string}                html         HTML (one rich-text value).
 * @param {{entries: Array}}      bibliography Citable bibliography.
 * @param {CitationUpdateOptions} [options]    Options.
 * @return {{html: string, counts: CitationUpdateCounts}} New HTML and counts.
 */
export function updateCitationsInHtml( html, bibliography, options = {} ) {
	const counts = emptyCounts();
	const links = findCitationLinks( html );

	if ( ! links.length ) {
		return { html, counts };
	}

	const entries = new Map(
		( bibliography?.entries || [] ).map( ( entry ) => [ entry.id, entry ] )
	);
	const knownIds = options.knownIds || new Set( entries.keys() );
	let output = '';
	let cursor = 0;

	for ( const link of links ) {
		const entry = entries.get( link.ref );

		if ( ! entry ) {
			if ( ! knownIds.has( link.ref ) ) {
				counts.missing += 1;
			}

			continue;
		}

		counts.total += 1;

		const { status, locator } = classifyCitation( link, entry.csl );

		if ( status === 'reworded' ) {
			counts.reworded += 1;

			if ( ! options.includeReworded ) {
				continue;
			}
		}

		const openTag = setLocatorOnTag( link.openTag, locator );
		const innerHtml = getShortFormHtml( entry, locator );
		const sameText =
			canonicalHtml( innerHtml ) === canonicalHtml( link.innerHtml );

		if ( sameText && openTag === link.openTag ) {
			counts.unchanged += 1;
			continue;
		}

		if ( status === 'generated' && ! sameText ) {
			counts.stale += 1;
		}

		counts.updated += 1;
		output +=
			html.slice( cursor, link.start ) + openTag + innerHtml + '</a>';
		cursor = link.end;
	}

	return { html: output + html.slice( cursor ), counts };
}

/**
 * @typedef {Object} RichTextLike
 * @property {() => string} toHTMLString Serialize to HTML.
 */

/**
 * @typedef {Object} RichTextType
 * @property {(html: string) => RichTextLike} [fromHTMLString] Parse HTML.
 */

/**
 * Whether a value is a rich-text value object (core's RichTextData).
 *
 * @param {unknown} value Value.
 * @return {value is RichTextLike} True for rich-text value objects.
 */
function isRichTextObject( value ) {
	return (
		Boolean( value ) &&
		typeof value === 'object' &&
		typeof ( /** @type {RichTextLike} */ ( value ).toHTMLString ) ===
			'function'
	);
}

/**
 * Whether a value is a plain object or array to look inside.
 *
 * @param {unknown} value Value.
 * @return {value is (Object<string, unknown>|unknown[])} True for arrays
 *     and plain objects.
 */
function isContainer( value ) {
	if ( Array.isArray( value ) ) {
		return true;
	}

	if ( ! value || typeof value !== 'object' ) {
		return false;
	}

	const proto = Object.getPrototypeOf( value );

	return proto === Object.prototype || proto === null;
}

/**
 * Update the citations in one attribute value: a string, a rich-text value
 * object, or arrays and objects holding them (a table's cells).
 *
 * @param {unknown}               value        Attribute value.
 * @param {{entries: Array}}      bibliography Citable bibliography.
 * @param {CitationUpdateOptions} options      Options.
 * @return {{value: unknown, changed: boolean, counts: CitationUpdateCounts}}
 *     The value (the same object when nothing changed) and counts.
 */
export function updateCitationsInValue( value, bibliography, options = {} ) {
	if ( typeof value === 'string' ) {
		const result = updateCitationsInHtml( value, bibliography, options );

		return {
			value: result.html,
			changed: result.html !== value,
			counts: result.counts,
		};
	}

	if ( isRichTextObject( value ) ) {
		const html = value.toHTMLString();
		const result = updateCitationsInHtml( html, bibliography, options );

		if ( result.html === html ) {
			return { value, changed: false, counts: result.counts };
		}

		// Keep the attribute's type: RichTextData.fromHTMLString(), when the
		// value has it; else the HTML string, which rich text also accepts.
		const Type = /** @type {RichTextType} */ ( value.constructor );
		const next =
			typeof Type?.fromHTMLString === 'function'
				? Type.fromHTMLString( result.html )
				: result.html;

		return { value: next, changed: true, counts: result.counts };
	}

	const counts = emptyCounts();

	if ( ! isContainer( value ) ) {
		return { value, changed: false, counts };
	}

	let changed = false;
	const copy = Array.isArray( value ) ? [ ...value ] : { ...value };

	for ( const key of Object.keys( copy ) ) {
		const result = updateCitationsInValue(
			copy[ key ],
			bibliography,
			options
		);

		addCounts( counts, result.counts );

		if ( result.changed ) {
			copy[ key ] = result.value;
			changed = true;
		}
	}

	return { value: changed ? copy : value, changed, counts };
}

/**
 * Plan the citation updates for one bibliography across a block tree.
 *
 * Every block is checked, nested ones included; bibliography blocks
 * themselves are skipped. Entries and numbers come from
 * collectCitableBibliographies(), so they match what save() lists.
 *
 * @param {Array}                 blocks               Block tree.
 * @param {string}                bibliographyClientId The bibliography block.
 * @param {CitationUpdateOptions} [options]            Options.
 * @return {{updates: Array<{clientId: string, attributes: Object}>,
 *     counts: CitationUpdateCounts}} Attribute changes by block, and counts.
 */
export function planCitationUpdates(
	blocks,
	bibliographyClientId,
	options = {}
) {
	const counts = emptyCounts();
	const updates = [];
	const bibliographies = collectCitableBibliographies( blocks );
	const bibliography = bibliographies.find(
		( candidate ) => candidate.clientId === bibliographyClientId
	);

	if ( ! bibliography ) {
		return { updates, counts };
	}

	const knownIds = new Set(
		bibliographies.flatMap( ( candidate ) =>
			candidate.entries.map( ( entry ) => entry.id )
		)
	);
	const settings = { ...options, knownIds };
	const walk = ( list ) => {
		for ( const block of Array.isArray( list ) ? list : [] ) {
			if ( ! block || typeof block !== 'object' ) {
				continue;
			}

			if ( block.name !== BIBLIOGRAPHY_BLOCK_NAME ) {
				const attributes = {};

				for ( const [ key, value ] of Object.entries(
					block.attributes || {}
				) ) {
					const result = updateCitationsInValue(
						value,
						bibliography,
						settings
					);

					addCounts( counts, result.counts );

					if ( result.changed ) {
						attributes[ key ] = result.value;
					}
				}

				if ( Object.keys( attributes ).length ) {
					updates.push( { clientId: block.clientId, attributes } );
				}
			}

			walk( block.innerBlocks );
		}
	};

	walk( blocks );

	return { updates, counts };
}
