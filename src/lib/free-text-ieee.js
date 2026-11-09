/**
 * IEEE citations pasted as text, in the form Borges's `ieee` style prints:
 *
 *     C. R. Harris, K. J. Millman, and R. Gommers, “Array programming with NumPy,” Nature, vol. 585, no. 7825, pp. 357–362, Sept. 2020, doi: 10.1038/s41586-020-2649-2.
 *     T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, Introduction to algorithms, 3rd ed. Cambridge, MA: MIT Press, 2009.
 *     J. L. Borges, “The library of Babel,” in Labyrinths, D. A. Yates and J. E. Irby, Eds. New York: New Directions, 1962, pp. 51–58.
 *     D. Knauss. “The page is an interface.” Marginalia. [Online]. Available: https://m.arginalia.com/the-page-is-an-interface/
 *
 * What tells IEEE from the other styles is the names: initials first
 * ("C. R. Harris"), where Chicago, MLA, APA, and Harvard put the surname
 * first. A citation whose first author is not initials-first is left to the
 * other patterns. Everything here returns `low` confidence, so the editor asks
 * the author to check the fields.
 */

import {
	getMonthNumber,
	getPublisherFields,
	normalizeDoi,
	normalizeEdition,
	trimTrailing,
	trimUrlEnd,
} from './free-text-common';

/**
 * One initials-first name: "C. R. Harris", "M.-W. Chang", "J-L. Gaudiot",
 * "G.V. Candler", "S. J. van der Walt". The surname must hold a capital.
 */
const IEEE_NAME =
	/^(?<given>(?:\p{Lu}(?:-\p{Lu})?\p{Ll}?\.[\s-]*)+)(?<family>\p{L}[\p{L}'’ -]*)$/u;

/**
 * "et al." closing a name list.
 */
const ET_AL = /,?\s+et al\.?$/iu;

/**
 * `, doi: 10.…` at the end.
 */
const TRAILING_DOI = /,?\s*doi:\s*(?<doi>10\.\S+?)\.?$/iu;

/**
 * `[Online]. Available: URL` at the end.
 */
const ONLINE_AVAILABLE =
	/\s*\[Online\]\.?\s*Available:?\s*(?<url>https?:\/\/\S+?)\.?$/iu;

/**
 * `Accessed: Oct. 27, 2026.`
 */
const ACCESSED =
	/\s*Accessed:?\s+(?<month>[A-Za-z]+\.?)\s+(?<day>\d{1,2}),\s+(?<year>\d{4})\.?/iu;

/**
 * A title in double quotation marks, closed with a comma or full stop inside
 * the quotes, after the names (or at the start, for a work with no author).
 */
const QUOTED_TITLE =
	/^(?:(?<names>[^“”"]+?)[,.]\s+)?[“"](?<title>[^“”"]+?)[,.]?[”"](?<rest>.*)$/u;

/**
 * A date part: "2009", "May 2015", "Sept. 2020", "Jan. 5, 2009".
 */
const DATE_PART =
	/^(?:(?<month>[A-Z][a-z]{2,8}\.?)\s+(?:(?<day>\d{1,2})(?:[–-]\d{1,2})?,?\s+)?)?(?<year>\d{4})$/u;

/**
 * Words that mark a proceedings volume rather than a book.
 */
const PROCEEDINGS =
	/\b(?:Proc\.|Conf\.|(?:Proceedings|Conference|Symposium|Workshop)\b)/u;

/**
 * Words that mark the last part of an `in …` container as its publisher.
 */
const PUBLISHER_WORDS =
	/\b(?:Press|Association|Society|Publish\w*|Inc\.?|Ltd\.?|ACM|IEEE|Springer|Elsevier|Wiley|University|Institute)\b/u;

/**
 * Read one initials-first name.
 *
 * @param {string} text One name.
 * @return {Object|null} CSL name, or null.
 */
function parseIeeeName( text ) {
	const match = text.trim().match( IEEE_NAME );

	if ( ! match || ! /\p{Lu}/u.test( match.groups.family ) ) {
		return null;
	}

	return {
		given: match.groups.given.trim(),
		family: match.groups.family.trim(),
	};
}

/**
 * Read an IEEE name list: initials-first names joined by commas and "and",
 * optionally ending in "et al.". With `allowLiteral`, a single name that is
 * not initials-first (an organization, "Mozilla") becomes a literal.
 *
 * @param {string}  text                   Name list.
 * @param {Object}  [options]              Options.
 * @param {boolean} [options.allowLiteral] Accept one organization name.
 * @return {Array<Object>} CSL names; empty when the list does not read.
 */
export function parseIeeeNames( text, { allowLiteral = false } = {} ) {
	const trimmed = text.trim();
	const normalized = trimmed.replace( ET_AL, '' );
	const parts = normalized
		.split( /\s*,\s*(?:and\s+)?|\s+and\s+/u )
		.filter( Boolean );
	const names = parts.map( parseIeeeName );

	if ( parts.length && names.every( Boolean ) ) {
		return ET_AL.test( trimmed )
			? [ ...names, { literal: 'et al.' } ]
			: names;
	}

	// An organization: one name, capitalized, not a sentence.
	if (
		allowLiteral &&
		parts.length === 1 &&
		/^[\p{Lu}\d]/u.test( normalized ) &&
		! /\.$/u.test( normalized ) &&
		normalized.split( /\s+/u ).length <= 6
	) {
		return [ { literal: normalized } ];
	}

	return [];
}

/**
 * Read a date part into CSL date parts.
 *
 * @param {string} text "2009", "May 2015", "Sept. 2020".
 * @return {Object|null} CSL date, or null.
 */
function parseDatePart( text ) {
	const match = text.trim().match( DATE_PART );

	if ( ! match ) {
		return null;
	}

	const parts = [ Number( match.groups.year ) ];
	const month = match.groups.month && getMonthNumber( match.groups.month );

	if ( match.groups.month && ! month ) {
		return null;
	}

	if ( month ) {
		parts.push( month );

		if ( match.groups.day ) {
			parts.push( Number( match.groups.day ) );
		}
	}

	return { 'date-parts': [ parts ] };
}

/**
 * Pull the DOI, `[Online]. Available:`, and `Accessed:` off the text.
 *
 * @param {string} input Whole citation.
 * @return {{text: string, fields: Object}} The rest, and DOI/URL/accessed.
 */
function takeAccessFields( input ) {
	let text = input;
	const fields = {};
	const online = text.match( ONLINE_AVAILABLE );

	if ( online ) {
		fields.URL = trimUrlEnd( online.groups.url );
		text = text.slice( 0, online.index );
	}

	const accessed = text.match( ACCESSED );

	if ( accessed ) {
		const month = getMonthNumber( accessed.groups.month );

		if ( month ) {
			fields.accessed = {
				'date-parts': [
					[
						Number( accessed.groups.year ),
						month,
						Number( accessed.groups.day ),
					],
				],
			};
		}

		text = text.replace( ACCESSED, '' );
	}

	const doi = text.match( TRAILING_DOI );

	if ( doi ) {
		fields.DOI = normalizeDoi( doi.groups.doi );
		text = text.slice( 0, doi.index );
	}

	return { text: trimTrailing( text, '.,;' ), fields };
}

/**
 * Read `Journal, vol. 1, no. 2, pp. 3–4, May 2015` after a quoted title.
 *
 * @param {string} text Text after the title.
 * @return {Object|null} CSL fields, or null when a part does not read.
 */
function readJournal( text ) {
	// Keep "Mar. 15, 2016" in one part.
	const parts = text
		.replace( /\b([A-Z][a-z]{2,8}\.?\s+\d{1,2}),\s+(\d{4})\b/gu, '$1 $2' )
		.split( /,\s+/u );
	const container = parts[ 0 ];

	if ( ! container || /^(?:vol|no|pp?)\.\s/iu.test( container ) ) {
		return null;
	}

	const fields = { type: 'article-journal', 'container-title': container };

	for ( const part of parts.slice( 1 ) ) {
		const label = part.match(
			/^(?<label>vol|no|pp|p|Art\. no)\.\s*(?<value>\S+)$/iu
		);
		const date = parseDatePart( part );

		if ( label ) {
			const key = {
				vol: 'volume',
				no: 'issue',
				pp: 'page',
				p: 'page',
				'art. no': 'number',
			}[ label.groups.label.toLowerCase() ];

			fields[ key ] = label.groups.value;
		} else if ( date && ! fields.issued ) {
			fields.issued = date;
		} else {
			return null;
		}
	}

	return fields.issued ? fields : null;
}

/**
 * Read `in Container, Editors, Eds. Place: Publisher, Year, pp. 1–2` after
 * a quoted title: a chapter, a conference paper, or an encyclopedia entry.
 *
 * @param {string}  text      Text after "in ".
 * @param {boolean} hasAuthor Whether the citation names an author.
 * @return {Object|null} CSL fields, or null.
 */
function readContainer( text, hasAuthor ) {
	let rest = text;
	const fields = {};
	const page = rest.match( /,\s+pp?\.\s*(?<page>[\w–—-]+)$/u );

	if ( page ) {
		fields.page = page.groups.page;
		rest = rest.slice( 0, page.index );
	}

	const date = rest.match( /,\s+(?<date>[^,]+)$/u );
	const issued = date && parseDatePart( date.groups.date );

	if ( issued ) {
		fields.issued = issued;
		rest = rest.slice( 0, date.index );
	}

	// "Container, Editors, Eds. Publisher": found with plain string steps,
	// since a single pattern for the comma-separated editors backtracks
	// exponentially on long runs of commas.
	const eds = rest.match( /,\s+Eds?\.\s*/u );
	const firstComma = eds ? rest.slice( 0, eds.index ).search( /,\s+/u ) : -1;

	if ( eds && firstComma > 0 ) {
		const before = rest.slice( 0, eds.index );
		const editors = parseIeeeNames(
			before.slice( firstComma ).replace( /^,\s+/u, '' )
		);
		const publisher = rest.slice( eds.index + eds[ 0 ].length );

		if ( ! editors.length ) {
			return null;
		}

		fields.editor = editors;
		fields[ 'container-title' ] = before.slice( 0, firstComma );
		Object.assign(
			fields,
			publisher ? getPublisherFields( publisher ) : {}
		);
	} else if ( eds ) {
		return null;
	} else {
		const parts = rest.split( /,\s+/u );
		const last = parts.at( -1 );

		if ( parts.length > 1 && PUBLISHER_WORDS.test( last ) ) {
			fields.publisher = last;
			fields[ 'container-title' ] = parts.slice( 0, -1 ).join( ', ' );
		} else {
			fields[ 'container-title' ] = rest;
		}
	}

	fields[ 'container-title' ] = fields[ 'container-title' ].replace(
		/\.+$/u,
		''
	);

	if ( ! hasAuthor ) {
		return { type: 'entry-encyclopedia', ...fields };
	}

	if ( ! fields.issued ) {
		return null;
	}

	return {
		type: PROCEEDINGS.test( fields[ 'container-title' ] )
			? 'paper-conference'
			: 'chapter',
		...fields,
	};
}

/**
 * The part after a quoted title.
 *
 * @param {string}  rest      Text after the closing quotation mark.
 * @param {boolean} hasAuthor Whether the citation names an author.
 * @param {boolean} hasUrl    Whether the citation has a link.
 * @return {Object|null} CSL fields with `type`, or null.
 */
function readQuotedTitleTail( rest, hasAuthor, hasUrl ) {
	const tail = rest.replace( /^[\s,.]+/u, '' ).trim();

	if ( /^in\s/u.test( tail ) ) {
		return readContainer( tail.slice( 3 ).trim(), hasAuthor );
	}

	const arxiv = tail.match(
		/^arXiv:\s?(?<id>[\w./-]+)(?:\s*\[[^\]]+\])?,\s+(?<date>.+)$/iu
	);

	if ( arxiv && hasAuthor ) {
		const issued = parseDatePart( arxiv.groups.date );

		return issued
			? {
					type: 'article',
					publisher: 'arXiv',
					number: `arXiv:${ arxiv.groups.id }`,
					genre: 'Preprint',
					issued,
				}
			: null;
	}

	const thesis = tail.match(
		/^(?<genre>(?:Ph\.\s?D\.|M\.\s?S\.|Master['’]s|Doctoral)\s+(?:dissertation|thesis)),\s+(?<publisher>.+),\s+(?<date>[^,]+)$/iu
	);

	if ( thesis && hasAuthor ) {
		const issued = parseDatePart( thesis.groups.date );

		return issued
			? {
					type: 'thesis',
					genre: thesis.groups.genre,
					publisher: thesis.groups.publisher,
					issued,
				}
			: null;
	}

	const journal = tail && hasAuthor ? readJournal( tail ) : null;

	if ( journal ) {
		return journal;
	}

	if ( hasUrl ) {
		// “Title.” Site. [Online]. Available: URL
		return {
			type: 'webpage',
			...( tail ? { 'container-title': tail } : {} ),
		};
	}

	return null;
}

/**
 * Read an unquoted book: `Names, Title, 3rd ed. Place: Publisher, Year`.
 *
 * @param {string} text Citation without access fields.
 * @return {Object|null} CSL fields, or null.
 */
function readBook( text ) {
	const parts = text.split( /,\s+/u );
	const names = [];
	let index = 0;

	// Initials-first names, until the first part that is not one.
	while ( index < parts.length ) {
		const part = parts[ index ].replace( /^and\s+/u, '' );
		const etAl = ET_AL.test( part );
		const read = parseIeeeNames( part.replace( ET_AL, '' ) );

		if ( ! read.length ) {
			break;
		}

		names.push( ...read, ...( etAl ? [ { literal: 'et al.' } ] : [] ) );
		index++;
	}

	const rest = parts.slice( index ).join( ', ' );

	// "…, and M. Vardi. Title." or "A. Elmagarmid, editor. Title.": names
	// closed by a full stop, a form IEEE does not print, so the title would
	// start inside the name list.
	if ( ! names.length || /^(?:and\s|eds?\.|editors?\b)/iu.test( rest ) ) {
		return null;
	}

	// The publisher holds no digits, so a journal's volume and pages
	// ("Journal of the ACM, 38(2), 382-428") never pass for one.
	const book = rest.match(
		/^(?<title>[^“”"«»;]+)\.\s+(?<publisher>[^.\d“”"«»;]+?),\s+(?<year>\d{4})$/u
	);

	if ( ! book ) {
		return null;
	}

	let title = book.groups.title;
	const edition = title.match( /,\s+(?<edition>\d+(?:st|nd|rd|th)\s+ed)$/iu );

	if ( edition ) {
		title = title.slice( 0, edition.index );
	}

	return {
		type: 'book',
		title,
		author: names,
		...getPublisherFields( book.groups.publisher ),
		...( edition
			? { edition: normalizeEdition( edition.groups.edition ) }
			: {} ),
		issued: { 'date-parts': [ [ Number( book.groups.year ) ] ] },
	};
}

/**
 * Read one IEEE citation.
 *
 * @param {string} input One citation, white space collapsed.
 * @return {{csl: Object, confidence: string}|null} The record, or null.
 */
export function parseIeeeCitation( input ) {
	const { text, fields: accessFields } = takeAccessFields( input );
	const quoted = text.match( QUOTED_TITLE );
	let csl;

	if ( quoted ) {
		const names = quoted.groups.names
			? parseIeeeNames( quoted.groups.names, { allowLiteral: true } )
			: [];

		// Text before the title that is not a name list: not IEEE.
		if ( quoted.groups.names && ! names.length ) {
			return null;
		}

		// A quoted title with no author needs a link or an `in …` container.
		const tail = readQuotedTitleTail(
			quoted.groups.rest,
			names.length > 0,
			Boolean( accessFields.URL )
		);

		if ( ! tail ) {
			return null;
		}

		csl = {
			...tail,
			title: quoted.groups.title.trim(),
			...( names.length ? { author: names } : {} ),
		};
	} else {
		csl = readBook( text );
	}

	if ( ! csl || ! /[\p{L}\p{N}]/u.test( csl.title ) ) {
		return null;
	}

	return {
		csl: { ...csl, ...accessFields },
		confidence: 'low',
	};
}
