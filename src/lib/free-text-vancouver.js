/**
 * Vancouver citations pasted as text, in the form Borges's `vancouver` style
 * prints (the NLM / ICMJE form):
 *
 *     Harris CR, Millman KJ, van der Walt SJ, Gommers R. Array programming with NumPy. Nature. 2020 Sep 16;585(7825):357-62. doi:10.1038/s41586-020-2649-2
 *     Cormen TH, Leiserson CE, Rivest RL, Stein C. Introduction to algorithms. 3rd ed. Cambridge, MA: MIT Press; 2009.
 *     Borges JL. The library of Babel. In: Yates DA, Irby JE, editors. Labyrinths. New York: New Directions; 1962. p. 51-8.
 *     Knauss D. The page is an interface [Internet]. Marginalia; 2026 Oct 25. Available from: https://m.arginalia.com/the-page-is-an-interface/
 *
 * What tells Vancouver from the other styles is the names: surname, then
 * initials with no full stops ("Harris CR"), and the journal date written
 * `2020;585(7825):357-62`. Everything here returns `low` confidence, so the
 * editor asks the author to check the fields.
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
 * One Vancouver name: "Harris CR", "van der Walt SJ", "Chang M-W".
 */
const VANCOUVER_NAME =
	/^(?<family>\p{L}[\p{L}'’ -]*?)\s+(?<given>\p{Lu}{1,3}(?:-\p{Lu}{1,2})?)$/u;

// Identifiers and links at the end, taken off one at a time: each is a
// pattern and a function turning its named groups into CSL fields.
/** @type {Array<[RegExp, function(Object): Object]>} */
const TRAILING_FIELDS = [
	[ /\.?\s*\[PMCID:\s*PMC\d+\]\.?$/iu, () => ( {} ) ],
	[
		/\.?\s*PubMed PMID:\s*(?<pmid>\d+)(?:;\s*PMCID:\s*PMC\d+)?\.?$/iu,
		( g ) => ( { PMID: g.pmid } ),
	],
	[ /\.?\s*PMID:\s*(?<pmid>\d+)\.?$/iu, ( g ) => ( { PMID: g.pmid } ) ],
	[
		/\.?\s*doi:\s*(?<doi>10\.\S+?)\.?$/iu,
		( g ) => ( { DOI: normalizeDoi( g.doi ) } ),
	],
	[
		/\.?\s*Available from:\s*(?<url>https?:\/\/\S+?)\.?$/iu,
		( g ) => ( { URL: trimUrlEnd( g.url ) } ),
	],
];

/**
 * `[cited 2026 Oct 27]`.
 */
const CITED = /\s*\[cited\s+(?<date>[^\]]+)\]/iu;

/**
 * A journal date and its numbers: `2020 Sep 16;585(7825):357-62`, `1998;2(2):231-52`,
 * `2001 May`. The month or the volume must be there, so a bare year is left
 * to the book pattern.
 */
const JOURNAL =
	/^(?<head>.*[.?!])\s+(?<journal>[^.?!:;[\]]+?)(?:\s\[Internet\])?\.?\s+(?<date>\d{4}(?:\s+[A-Z][a-z]{2}(?:\s+\d{1,2})?)?)(?:;(?<volume>[^:();]+)?(?:\((?<issue>[^)]+)\))?(?::\s?(?<page>[\w–-]+))?)?\.?$/u;

/**
 * Two or more short dotted words ending the title part, as in
 * `A trial. N. Engl. J.`: a journal abbreviated with full stops, which the
 * journal pattern (no full stops in a Vancouver journal name) would split
 * inside. Such a citation is declined rather than read with a broken title.
 */
const DOTTED_JOURNAL_END = /\.\s(?:\p{Lu}\p{L}{0,5}\.\s?){2,}$/u;

/**
 * `Publisher; 2009` or `Place: Publisher; 2009` closing a book.
 */
const PUBLICATION =
	/^(?<head>.+)\.\s+(?<publisher>[^.;]+);\s+(?<date>\d{4}(?:\s+[A-Z][a-z]{2}(?:\s+\d{1,2})?)?|\[date unknown\])\.?$/u;

/**
 * Words allowed in lower case in an organization's name.
 */
const ORGANIZATION_JOINERS = new Set( [ 'of', 'and', 'for', 'the', '&' ] );

/**
 * Read a Vancouver name list: `Surname AB` names joined by commas, optionally
 * ending in `et al`.
 *
 * @param {string} text Name list, without its closing full stop.
 * @return {Array<Object>} CSL names; empty when the list does not read.
 */
export function parseVancouverNames( text ) {
	const parts = text
		.trim()
		.split( /\s*,\s*/u )
		.filter( Boolean );
	/** @type {Array<Object>} */
	const names = [];

	for ( const part of parts ) {
		const match = part.match( VANCOUVER_NAME );

		if ( /^et al\.?$/iu.test( part ) && names.length ) {
			names.push( { literal: 'et al.' } );
		} else if ( /^(?:Jr|Sr|[IV]{2,3})\.?$/u.test( part ) && names.length ) {
			names.at( -1 ).suffix = part.replace( /\.$/u, '' );
		} else if ( match && /\p{Lu}/u.test( match.groups.family ) ) {
			names.push( {
				family: match.groups.family,
				given: match.groups.given,
			} );
		} else {
			return [];
		}
	}

	return names;
}

/**
 * Whether a sentence reads as an organization's name ("Adobe", "University
 * of Chicago Press", "WordPress.org"): a few capitalized words.
 *
 * @param {string} text First sentence of the citation.
 * @return {boolean} True for an organization.
 */
function isOrganization( text ) {
	const words = text.split( /\s+/u );

	// No commas or lone initials: "Coleman B, L" is a broken name list.
	return (
		! text.includes( ',' ) &&
		words.length <= 6 &&
		words.every( ( word ) => word.length > 1 || word === '&' ) &&
		words.every(
			( word ) =>
				/^\p{Lu}/u.test( word ) || ORGANIZATION_JOINERS.has( word )
		)
	);
}

/**
 * Split the text before the publication data into authors and title.
 *
 * @param {string} head Authors and title, sentences ending in full stops.
 * @return {{author?: Array<Object>, title: string}} Authors and title.
 */
function splitHead( head ) {
	const text = head.trim().replace( /\.$/u, '' );
	const first = text.match( /^(?<first>[^.]+?)\.\s+(?<rest>.+)$/u );

	if ( first ) {
		const names = parseVancouverNames( first.groups.first );

		if ( names.length ) {
			return { author: names, title: first.groups.rest };
		}
	}

	// An organization: its own sentence, before the title.
	const org = text.match( /^(?<org>.+?)\.\s+(?<rest>\p{Lu}.+)$/u );

	if ( org && isOrganization( org.groups.org ) ) {
		return {
			author: [ { literal: org.groups.org } ],
			title: org.groups.rest,
		};
	}

	return { title: text };
}

/**
 * Whether a title read with no author still holds names ("Dietz, R. S.,
 * McHone, J. F., Volcanic landforms"): the citation's names did not read,
 * so the whole head became the title.
 *
 * @param {string} title Title from `splitHead()`.
 * @return {boolean} True when the title starts with or holds names.
 */
function holdsNames( title ) {
	return (
		/^[\p{Lu}][\p{L}'’-]+,\s/u.test( title ) ||
		/\b\p{Lu}\.(?:\s?\p{Lu}\.)*,/u.test( title ) ||
		/\bet al\b/iu.test( title )
	);
}

/**
 * Read `2020 Sep 16` into CSL date parts.
 *
 * @param {string} text Year, optional month abbreviation, optional day.
 * @return {Object|undefined} CSL date, or undefined for `[date unknown]`.
 */
function parseVancouverDate( text ) {
	const match = text.match(
		/^(?<year>\d{4})(?:\s+(?<month>[A-Z][a-z]{2})(?:\s+(?<day>\d{1,2}))?)?$/u
	);

	if ( ! match ) {
		return undefined;
	}

	const parts = [ Number( match.groups.year ) ];
	const month = match.groups.month && getMonthNumber( match.groups.month );

	if ( month ) {
		parts.push( month );

		if ( match.groups.day ) {
			parts.push( Number( match.groups.day ) );
		}
	}

	return { 'date-parts': [ parts ] };
}

/**
 * Write out a Vancouver page range in full: "357-62" is 357-362, "51-8" is
 * 51-58. A range that does not shorten that way is kept as printed.
 *
 * @param {string} page Page or range.
 * @return {string} Page range with the last page in full.
 */
export function expandPageRange( page ) {
	const match = page.match( /^(?<first>\d+)[-–](?<last>\d+)$/u );

	if ( ! match || match.groups.last.length >= match.groups.first.length ) {
		return page;
	}

	const { first, last } = match.groups;
	const full = first.slice( 0, first.length - last.length ) + last;

	return Number( full ) > Number( first ) ? `${ first }-${ full }` : page;
}

/**
 * Take the identifiers, link, and cited date off the end.
 *
 * @param {string} input Whole citation.
 * @return {{text: string, fields: Object}} The rest, and DOI/PMID/URL/accessed.
 */
function takeTrailingFields( input ) {
	let text = input.trim();
	const fields = {};
	let found = true;

	while ( found ) {
		found = false;

		for ( const [ pattern, read ] of TRAILING_FIELDS ) {
			const match = text.match( pattern );

			if ( match ) {
				Object.assign( fields, read( match.groups || {} ) );
				text = text.slice( 0, match.index ).trim();
				found = true;
			}
		}
	}

	const cited = text.match( CITED );

	if ( cited ) {
		const accessed = parseVancouverDate( cited.groups.date.trim() );

		if ( accessed ) {
			fields.accessed = accessed;
		}

		text = text.replace( CITED, '' );
	}

	return { text: trimTrailing( text, '.' ) + '.', fields };
}

/**
 * Read `Title. In: Editors, editors. Book. Place: Publisher; Year. p. 1-2.`
 *
 * @param {string} text Citation without trailing fields.
 * @return {Object|null} CSL fields, or null.
 */
function readChapter( text ) {
	const match = text.match( /^(?<head>.+?)\.\s+In:\s+(?<rest>.+)$/u );

	if ( ! match ) {
		return null;
	}

	let rest = match.groups.rest;
	const fields = {};
	const page = rest.match( /\.\s+p\.\s*(?<page>[\w–-]+)\.?$/u );

	if ( page ) {
		fields.page = expandPageRange( page.groups.page );
		rest = rest.slice( 0, page.index ) + '.';
	}

	const editors = rest.match(
		/^(?<names>[^.]+?),\s+editors?\.\s+(?<rest>.+)$/u
	);

	if ( editors ) {
		const names = parseVancouverNames( editors.groups.names );

		if ( ! names.length ) {
			return null;
		}

		fields.editor = names;
		rest = editors.groups.rest;
	}

	const published = rest.match( PUBLICATION );
	const dated = rest.match(
		/^(?<container>.+?)\.\s+(?<date>\d{4}|\[date unknown\])\.?$/u
	);
	let container;

	if ( published ) {
		container = published.groups.head;
		Object.assign(
			fields,
			getPublisherFields( published.groups.publisher )
		);
		fields.issued = parseVancouverDate( published.groups.date );
	} else if ( dated ) {
		container = dated.groups.container;
		fields.issued = parseVancouverDate( dated.groups.date );
	} else {
		return null;
	}

	const { author, title } = splitHead( match.groups.head );

	if ( ! author && holdsNames( title ) ) {
		return null;
	}

	let type = 'entry-encyclopedia';

	if ( author ) {
		type = /^Proc(?:eedings|\.)?\b/u.test( container )
			? 'paper-conference'
			: 'chapter';
	}

	return {
		type,
		title,
		...( author ? { author } : {} ),
		'container-title': container,
		...fields,
	};
}

/**
 * Read `Title [Internet]. Site; 2026 Oct 25 [cited …].` (the cited date and
 * link already taken off), or `Title [Preprint]. arXiv; 2017.`
 *
 * @param {string}  text   Citation without trailing fields.
 * @param {boolean} hasUrl Whether the citation has a link.
 * @return {Object|null} CSL fields, or null.
 */
function readOnline( text, hasUrl ) {
	const match = text.match(
		/^(?<head>.+?)\s+\[(?<kind>Internet|Preprint)\]\.\s+(?<site>[^;]+?)(?:;\s+(?<date>[^.]+))?\.$/u
	);

	if ( ! match ) {
		return null;
	}

	const { head, kind, site, date } = match.groups;
	const issued = date ? parseVancouverDate( date.trim() ) : undefined;

	if ( date && ! issued ) {
		return null;
	}

	// The head of an online item: names or one organization word, then title.
	const split = splitHead( head );

	if ( ! split.author && holdsNames( split.title ) ) {
		return null;
	}

	const fields = {
		...split,
		...( issued ? { issued } : {} ),
	};

	if ( kind === 'Preprint' ) {
		return {
			type: 'article',
			...fields,
			publisher: site,
			genre: 'Preprint',
		};
	}

	return hasUrl
		? { type: 'webpage', ...fields, 'container-title': site }
		: null;
}

/**
 * Read `Title. Journal. 2020;585(7825):357-62.`
 *
 * @param {string} text Citation without trailing fields.
 * @return {Object|null} CSL fields, or null.
 */
function readArticle( text ) {
	const match = text.match( JOURNAL );

	if ( ! match ) {
		return null;
	}

	const { head, journal, date, volume, issue, page } = match.groups;

	if ( DOTTED_JOURNAL_END.test( head ) ) {
		return null;
	}

	if ( ! volume && ! /\s/u.test( date ) ) {
		// A bare year with no volume reads as a book, not a journal.
		return null;
	}

	const split = splitHead( head );

	if ( ! split.author ) {
		return null;
	}

	return {
		type: 'article-journal',
		...split,
		'container-title': journal.trim(),
		issued: parseVancouverDate( date ),
		...( volume ? { volume: volume.trim() } : {} ),
		...( issue ? { issue } : {} ),
		...( page ? { page: expandPageRange( page ) } : {} ),
	};
}

/**
 * Read `Title. 3rd ed. Editors, editors. Place: Publisher; Year.`
 *
 * @param {string} text Citation without trailing fields.
 * @return {Object|null} CSL fields, or null.
 */
function readBook( text ) {
	const match = text.match( PUBLICATION );

	if ( ! match ) {
		return null;
	}

	let head = match.groups.head;
	const fields = {};
	const editors = head.match( /\.\s+(?<names>[^.]+?),\s+editors?$/u );

	if ( editors ) {
		const names = parseVancouverNames( editors.groups.names );

		if ( ! names.length ) {
			return null;
		}

		fields.editor = names;
		head = head.slice( 0, editors.index );
	}

	const edition = head.match( /\.\s+(?<edition>\d+(?:st|nd|rd|th)\s+ed)$/iu );

	if ( edition ) {
		fields.edition = normalizeEdition( edition.groups.edition );
		head = head.slice( 0, edition.index );
	}

	const split = splitHead( head );

	if ( ! split.author ) {
		return null;
	}

	const issued = parseVancouverDate( match.groups.date );

	return {
		type: 'book',
		...split,
		...getPublisherFields( match.groups.publisher ),
		...fields,
		...( issued ? { issued } : {} ),
	};
}

/**
 * Read one Vancouver citation.
 *
 * @param {string} input One citation, white space collapsed.
 * @return {{csl: Object, confidence: string}|null} The record, or null.
 */
export function parseVancouverCitation( input ) {
	const { text, fields } = takeTrailingFields( input );
	let csl;

	// A marker decides the form: a chapter (`In:`) or an online item
	// (`[Internet]`, `[Preprint]`) that does not read is declined, not read
	// again as a book with the marker in its title. A journal can carry
	// `[Internet]` too, so the article pattern still gets a try.
	if ( /\.\s+In:\s/u.test( text ) ) {
		csl = readChapter( text );
	} else if ( /\s\[(?:Internet|Preprint)\]/u.test( text ) ) {
		csl = readOnline( text, Boolean( fields.URL ) ) || readArticle( text );
	} else {
		csl = readArticle( text ) || readBook( text );
	}

	if ( ! csl || ! /[\p{L}\p{N}]/u.test( csl.title || '' ) ) {
		return null;
	}

	return {
		csl: { ...csl, ...fields },
		confidence: 'low',
	};
}
