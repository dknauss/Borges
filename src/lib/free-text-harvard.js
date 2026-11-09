/**
 * Harvard citations pasted as text, in the Cite Them Right form Borges's
 * `harvard1` style prints:
 *
 *     Knuth, D.E. (1984) ‘Literate programming’, The Computer Journal, 27(2), pp. 97–111. Available at: https://doi.org/10.1093/comjnl/27.2.97.
 *     Cormen, T.H. et al. (2009) Introduction to algorithms. 3rd edn. MIT Press.
 *     Borges, J.L. (1962) ‘The library of Babel’, in Yates, D.A. and Irby, J.E. (eds) Labyrinths. New Directions, pp. 51–58.
 *     WordPress.org (no date) Block editor handbook. Available at: https://developer.wordpress.org/block-editor/ (Accessed: 27 October 2026).
 *
 * What tells Harvard from APA is the year: Harvard writes `(2009)` with no
 * full stop after it, and quotes article and chapter titles in single
 * quotation marks. A citation with `(2009).` is left to the APA patterns.
 * Everything here returns `low` confidence, so the editor asks the author
 * to check the fields, as it does for APA.
 */

import {
	MONTH_INDEX,
	getIssuedYear,
	getPublisherFields,
	normalizeDoi,
	normalizeEdition,
} from './free-text-common';

/**
 * Authors, the year in parentheses (or "no date"), and the rest. The rest
 * must not start with a full stop (that is APA) or a bracket (an original
 * date, "(1968) [1916].", which this pattern does not read).
 */
const HARVARD_HEAD =
	/^(?<head>.+?)\s+\((?:(?<year>\d{4})[a-z]?|n\.?\s?d\.?|no date)\)\s+(?<rest>[^.\s[].*)$/iu;

/**
 * `Available at: URL` and its trailing full stop.
 */
const AVAILABLE_AT =
	/\s*(?:\[Online\]\.?\s*)?Available at:?\s*(?<url>https?:\/\/\S+?)\.?(?=\s|$)/iu;

/**
 * `(Accessed: 27 October 2026)` or `[Accessed 27 October 2026]`.
 */
const ACCESSED = /\s*[([]Accessed:?\s+(?<date>[^)\]]+)[)\]]\.?/iu;

/**
 * A title in single or double quotation marks at the start of the text.
 */
const LEADING_QUOTED_TITLE =
	/^[‘'“"](?<title>.+?)[,.]?[’'”"](?=[\s,.]|$)(?<after>.*)$/u;

/**
 * "et al." closing a name list.
 */
const ET_AL = /\s+et al\.?$/iu;

/**
 * Turn "27 October 2026" into CSL date parts.
 *
 * @param {string} text Day, month name, and year.
 * @return {Object|undefined} CSL date, or undefined when it does not read.
 */
function parseDayMonthYear( text ) {
	const match = text
		.trim()
		.match( /^(?<day>\d{1,2})\s+(?<month>[A-Za-z]+)\s+(?<year>\d{4})$/u );
	const month = match && MONTH_INDEX[ match.groups.month.toLowerCase() ];

	if ( ! month ) {
		return undefined;
	}

	return {
		'date-parts': [
			[ Number( match.groups.year ), month, Number( match.groups.day ) ],
		],
	};
}

/**
 * Read a Harvard name list: `Surname, I.`, joined by commas and a final
 * `and`, optionally ending in `et al.`. A name with no comma (an
 * organization, "WordPress.org") becomes a literal.
 *
 * @param {string} text Name list.
 * @return {Array<Object>} CSL names; empty when the list does not read.
 */
export function parseHarvardNames( text ) {
	const trimmed = text.trim().replace( /[,;]\s*$/u, '' );
	const normalized = trimmed.replace( ET_AL, '' );

	if ( ! normalized ) {
		return [];
	}

	if ( ! normalized.includes( ',' ) ) {
		// An organization ("WordPress.org", "Mozilla"). A sentence ending in a
		// full stop is a title that lost its author, not a name.
		return /\.$/u.test( normalized ) ? [] : [ { literal: normalized } ];
	}

	const parts = normalized
		.replace( /\s+(?:and|&)\s+/giu, ', ' )
		.split( /\s*,\s*/u )
		.filter( Boolean );

	if ( parts.length % 2 !== 0 ) {
		return [];
	}

	const names = [];

	for ( let index = 0; index < parts.length; index += 2 ) {
		const family = parts[ index ];
		const given = parts[ index + 1 ];

		// Initials ("J.L.", "D. E.", "Y.") or a given name, never a sentence.
		if (
			! /^[\p{Lu}][\p{L}'’ -]*$/u.test( family ) ||
			! /^[\p{Lu}][\p{L}.' -]*$/u.test( given )
		) {
			return [];
		}

		names.push( { family, given } );
	}

	return ET_AL.test( trimmed ) ? [ ...names, { literal: 'et al.' } ] : names;
}

/**
 * Pull `Available at:` and `Accessed:` off the end of the text.
 *
 * @param {string} text Text after the year.
 * @return {{text: string, fields: Object}} The rest, and URL/DOI/accessed fields.
 */
function takeAccessFields( text ) {
	let rest = text;
	const fields = {};
	const accessed = rest.match( ACCESSED );

	if ( accessed ) {
		const date = parseDayMonthYear( accessed.groups.date );

		if ( date ) {
			fields.accessed = date;
		}

		rest = rest.replace( ACCESSED, '' );
	}

	const available = rest.match( AVAILABLE_AT );

	if ( available ) {
		const url = available.groups.url.replace( /[).,;]+$/u, '' );
		const doi = url.match( /^https?:\/\/(?:dx\.)?doi\.org\/(10\..+)$/iu );

		if ( doi ) {
			fields.DOI = normalizeDoi( doi[ 1 ] );
		} else {
			fields.URL = url;
		}

		rest = rest.replace( AVAILABLE_AT, '' );
	}

	return {
		text: rest.trim().replace( /[.,;:\s]+$/u, '' ),
		fields,
	};
}

/**
 * Read `vol(issue), pp. 1–2` style parts after a journal name.
 *
 * @param {string[]} parts Comma-separated parts after the container.
 * @return {Object|null} volume, issue, page; null when a part does not read.
 */
function readSerialParts( parts ) {
	const fields = {};

	for ( const part of parts ) {
		const volume = part.match(
			/^(?<volume>\d+)(?:\s*\((?<issue>[^)]+)\))?$/u
		);
		const page = part.match( /^pp?\.\s*(?<page>[\w–—-]+)$/u );

		if ( volume && ! fields.volume ) {
			fields.volume = volume.groups.volume;

			if ( volume.groups.issue ) {
				fields.issue = volume.groups.issue;
			}
		} else if ( page && ! fields.page ) {
			fields.page = page.groups.page;
		} else if (
			/^[A-Z][a-z]+(?:[ –-][A-Z][a-z]+)?$/u.test( part ) &&
			MONTH_INDEX[ part.split( /[ –-]/u )[ 0 ].toLowerCase() ]
		) {
			// "May" or "July–August": the issue's month, kept as the issue.
			fields.issue = fields.issue || part;
		} else {
			return null;
		}
	}

	return fields.volume || fields.page ? fields : null;
}

/**
 * The part after a quoted title: a journal, a book or proceedings
 * (`in …`), or a preprint server (`. arXiv [Preprint]`).
 *
 * @param {string} after Text after the closing quotation mark.
 * @return {Object|null} CSL fields with `type`, or null.
 */
function readQuotedTitleTail( after ) {
	const tail = after.trim();

	if ( ! tail ) {
		return { type: 'webpage' };
	}

	const preprint = tail.match(
		/^\.?\s*(?<server>[^.[]+?)\s+\[Preprint\]$/iu
	);

	if ( preprint ) {
		return {
			type: 'article',
			publisher: preprint.groups.server.trim(),
			genre: 'Preprint',
		};
	}

	const inPart = tail.match(
		/^,\s+in\s+(?:(?<editors>.+?)\s+\((?:eds?\.?)\)\s+)?(?<container>.+?)(?:\.\s+(?<publisher>[^.]+?))?(?:,\s+pp?\.\s*(?<page>[\w–—-]+))?$/u
	);

	if ( inPart ) {
		const { editors, container, publisher, page } = inPart.groups;
		const editorNames = editors ? parseHarvardNames( editors ) : [];

		if ( editors && ! editorNames.length ) {
			return null;
		}

		return {
			type: /^Proceedings\b/u.test( container )
				? 'paper-conference'
				: 'chapter',
			'container-title': container.trim(),
			...( editorNames.length ? { editor: editorNames } : {} ),
			...( publisher ? getPublisherFields( publisher ) : {} ),
			...( page ? { page } : {} ),
		};
	}

	if ( tail.startsWith( ',' ) ) {
		const [ container, ...rest ] = tail
			.slice( 1 )
			.split( /\s*,\s*/u )
			.map( ( part ) => part.trim() );
		const serial = container && readSerialParts( rest );

		if ( serial ) {
			return {
				type: 'article-journal',
				'container-title': container,
				...serial,
			};
		}
	}

	return null;
}

/**
 * The part after an unquoted title: `Title. [N edn.] [Place:] Publisher.`,
 * or a title alone (a web page).
 *
 * @param {string} text Title and publication text.
 * @return {Object} CSL fields with `type` and `title`.
 */
function readUnquotedTitle( text ) {
	const match = text.match(
		/^(?<title>.+)\.\s+(?<publisher>[\p{Lu}\d][^.]*)$/u
	);

	if ( ! match ) {
		return { type: 'webpage', title: text };
	}

	let title = match.groups.title;
	const edition = title.match( /\.\s+(?<edition>[^.]+?\s+edn)$/iu );

	if ( edition ) {
		title = title.slice( 0, edition.index );
	}

	return {
		type: 'book',
		title,
		...getPublisherFields( match.groups.publisher ),
		...( edition
			? { edition: normalizeEdition( edition.groups.edition ) }
			: {} ),
	};
}

/**
 * Read one Harvard citation.
 *
 * @param {string} input One citation, white space collapsed.
 * @return {{csl: Object, confidence: string}|null} The record, or null.
 */
export function parseHarvardCitation( input ) {
	const head = input.match( HARVARD_HEAD );

	if ( ! head ) {
		return null;
	}

	const { text: rest, fields: accessFields } = takeAccessFields(
		head.groups.rest
	);
	let csl;

	if ( ! rest || /^Available at/iu.test( rest ) ) {
		// "Title (2025) Available at: …": a page with no author.
		if ( ! accessFields.URL && ! accessFields.DOI ) {
			return null;
		}

		const headQuoted = head.groups.head.match( LEADING_QUOTED_TITLE );

		csl = {
			type: 'webpage',
			title: headQuoted ? headQuoted.groups.title : head.groups.head,
		};
	} else {
		const quoted = rest.match( LEADING_QUOTED_TITLE );
		let parsed;

		if ( quoted ) {
			const tail = readQuotedTitleTail( quoted.groups.after );

			if ( ! tail ) {
				return null;
			}

			parsed = { title: quoted.groups.title, ...tail };
		} else {
			parsed = readUnquotedTitle( rest );
		}

		if ( parsed.type === 'webpage' && ! accessFields.URL ) {
			return null;
		}

		if ( LEADING_QUOTED_TITLE.test( head.groups.head ) ) {
			// "‘Entry’ (no date) ‘Entry’, in Encyclopaedia": no author.
			csl = {
				...parsed,
				type:
					parsed.type === 'chapter'
						? 'entry-encyclopedia'
						: parsed.type,
			};
		} else {
			const authors = parseHarvardNames( head.groups.head );

			if ( ! authors.length ) {
				return null;
			}

			csl = { ...parsed, author: authors };
		}
	}

	if ( ! csl.title ) {
		return null;
	}

	return {
		csl: {
			...csl,
			...( head.groups.year
				? { issued: getIssuedYear( head.groups.year ) }
				: {} ),
			...accessFields,
		},
		confidence: 'low',
	};
}
