import {
	maybeLowConfidenceAuthorList,
	parseApaAuthors,
	parseAuthors,
} from './free-text-authors';
import {
	MONTH_INDEX,
	getIssuedYear,
	getPublisherFields,
	normalizeDoi,
	normalizeEdition,
	normalizeTitle,
	normalizeTrailingSentence,
} from './free-text-common';
import { parseHarvardCitation } from './free-text-harvard';
import { parseIeeeCitation } from './free-text-ieee';
import { parseVancouverCitation } from './free-text-vancouver';

const QUOTED_TITLE_PATTERN = /[“"](?<title>.+?)(?:,)?[”"]/u;

function extractQuotedTitle( input ) {
	return input.match( QUOTED_TITLE_PATTERN )?.groups?.title || null;
}

function parseNamedDate( dateText ) {
	const match = dateText.match(
		/^(?<month>[A-Za-z]+)\s+(?<day>\d{1,2}),\s+(?<year>\d{4})$/u
	);

	if ( ! match?.groups ) {
		return null;
	}

	const month = MONTH_INDEX[ match.groups.month.toLowerCase() ];

	if ( ! month ) {
		return null;
	}

	return {
		'date-parts': [
			[ Number( match.groups.year ), month, Number( match.groups.day ) ],
		],
	};
}

function getTrailingCslFields( trailingText ) {
	if ( ! trailingText ) {
		return {};
	}

	const normalizedTrailing = normalizeTrailingSentence( trailingText );

	if ( ! normalizedTrailing ) {
		return {};
	}

	const urlMatch = normalizedTrailing.match( /https?:\/\/[^\s]+/iu );

	if ( urlMatch ) {
		return {
			URL: urlMatch[ 0 ].replace( /[).,;:\s]+$/u, '' ),
		};
	}

	return {
		medium: normalizedTrailing,
	};
}

function parseChapterCitation( input ) {
	const match = input.match(
		/^(?<authors>.+?),\s+[“"](?<title>.+?)(?:,)?[”"](?:,)?\s+in\s+(?<container>.+?),\s+ed\.\s+(?<editor>.+?)\s+\((?<publisher>[^,]+),\s*(?<year>\d{4})\)\s*(?:,\s*(?<page>[^.]+))?\.?$/iu
	);

	if ( ! match?.groups ) {
		return null;
	}

	const authors = parseAuthors( match.groups.authors );
	const editors = parseAuthors( match.groups.editor );

	if ( ! authors.length || ! editors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'chapter',
			title: normalizeTitle( match.groups.title ),
			'container-title': match.groups.container.trim(),
			editor: editors,
			...getPublisherFields( match.groups.publisher ),
			issued: getIssuedYear( match.groups.year ),
			...( match.groups.page
				? {
						page: match.groups.page.trim(),
					}
				: {} ),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseSentenceChapterCitation( input ) {
	const title = extractQuotedTitle( input );
	const titleMatch = input.match( QUOTED_TITLE_PATTERN );

	if ( ! title || ! titleMatch?.index ) {
		return null;
	}

	const afterQuote = input.slice( titleMatch.index + titleMatch[ 0 ].length );
	const afterIn = afterQuote.replace( /^\s*\.?\s*In\s+/iu, '' );

	if ( afterIn === afterQuote ) {
		return null;
	}

	const tailParts = afterIn.split( /,\s+edited by\s+/iu );

	if ( tailParts.length !== 2 ) {
		return null;
	}

	const [ container, editorAndPublication ] = tailParts;
	const publicationMatch = editorAndPublication.match(
		/^(?<editor>.+)\.\s+(?<publisher>[^,]+),\s*(?<year>\d{4})(?:,\s*(?<page>[^.]+))?\.?$/u
	);

	if ( ! publicationMatch?.groups ) {
		return null;
	}

	const authorText = input
		.slice( 0, titleMatch.index )
		.trim()
		.replace( /[.,;:\s]+$/u, '' );

	const authors = parseAuthors( authorText );
	const editors = parseAuthors( publicationMatch.groups.editor );

	if ( ! authors.length || ! editors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'chapter',
			title: normalizeTitle( title ),
			'container-title': container.trim(),
			editor: editors,
			...getPublisherFields( publicationMatch.groups.publisher ),
			issued: getIssuedYear( publicationMatch.groups.year ),
			...( publicationMatch.groups.page
				? {
						page: publicationMatch.groups.page.trim(),
					}
				: {} ),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseBookCitation( input ) {
	const match = input.match(
		/^(?<authors>.+?),\s+(?<title>.+)\s+\((?<publisher>[^,]+),\s*(?<year>\d{4})\)\s*(?:,\s*(?<page>[^.]+))?\.?$/u
	);

	if ( ! match?.groups ) {
		return null;
	}

	const authors = parseAuthors( match.groups.authors );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'book',
			title: match.groups.title.trim(),
			...getPublisherFields( match.groups.publisher ),
			issued: getIssuedYear( match.groups.year ),
			...( match.groups.page
				? {
						page: match.groups.page.trim(),
					}
				: {} ),
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseSentenceBookCitation( input ) {
	const match = input.match(
		/^(?<authors>.+?\b[\p{Lu}][\p{L}'’.-]+)\.\s+(?<title>.+?)\.\s+(?:(?<edition>[^.]+?\bed\.?)\s+)?(?<publisher>[^,]+),\s*(?<year>\d{4})(?:,\s*(?<page>[^.]+))?(?:\.\s+(?<trailing>.+?))?\.?$/u
	);

	if ( ! match?.groups ) {
		return null;
	}

	const authors = parseAuthors( match.groups.authors );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'book',
			title: match.groups.title.trim(),
			...getPublisherFields( match.groups.publisher ),
			issued: getIssuedYear( match.groups.year ),
			...( normalizeEdition( match.groups.edition )
				? {
						edition: normalizeEdition( match.groups.edition ),
					}
				: {} ),
			...( match.groups.page
				? {
						page: match.groups.page.trim(),
					}
				: {} ),
			...getTrailingCslFields( match.groups.trailing ),
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseSentenceEditedBookCitation( input ) {
	const match = input.match(
		/^(?<editors>.+?),\s+eds?\.\s+(?<title>.+?)\.\s+(?:(?<edition>[^.]+?\bed\.?)\s+)?(?<publisher>[^,]+),\s*(?<year>\d{4})(?:\.\s+(?<trailing>.+?))?\.?$/iu
	);

	if ( ! match?.groups ) {
		return null;
	}

	const editors = parseAuthors( match.groups.editors );

	if ( ! editors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'collection',
			title: match.groups.title.trim(),
			editor: editors,
			...getPublisherFields( match.groups.publisher ),
			issued: getIssuedYear( match.groups.year ),
			...( normalizeEdition( match.groups.edition )
				? {
						edition: normalizeEdition( match.groups.edition ),
					}
				: {} ),
			...getTrailingCslFields( match.groups.trailing ),
		},
		confidence: 'medium',
	};
}

/**
 * Publication data before the year when no publisher is expected: a place,
 * or a "Place: Publisher" pair when the colon splits as one. Text with a
 * colon that does not split (a lowercase "[s.l.]: 2 vols") stays the place.
 *
 * @param {string} text Publication text.
 * @return {Object} `publisher-place`, and `publisher` when split.
 */
function getPlaceFields( text ) {
	const fields = getPublisherFields( text );

	return fields[ 'publisher-place' ]
		? fields
		: { 'publisher-place': text.trim() };
}

function parseSentencePlaceYearBookCitation( input ) {
	const match = input.match(
		/^(?<authors>.+?\b[\p{Lu}][\p{L}'’.-]+)\.\s+(?<title>.+?)\.\s+(?<place>[^,]+),\s*(?<year>\d{4})(?:\.\s+(?<trailing>.+?))?\.?$/u
	);

	if (
		! match?.groups ||
		! match.groups.trailing ||
		! /^https?:\/\//iu.test( match.groups.trailing.trim() )
	) {
		return null;
	}

	const authors = parseAuthors( match.groups.authors );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'book',
			title: match.groups.title.trim(),
			...getPlaceFields( match.groups.place ),
			issued: getIssuedYear( match.groups.year ),
			...getTrailingCslFields( match.groups.trailing ),
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseThesisCitation( input ) {
	const title = extractQuotedTitle( input );
	const titleMatch = input.match( QUOTED_TITLE_PATTERN );

	if ( ! title || ! titleMatch?.index ) {
		return null;
	}

	const remainder = input
		.slice( titleMatch.index + titleMatch[ 0 ].length )
		.trim()
		.replace( /^\.\s*/u, '' );
	const remainderMatch = remainder.match(
		/^(?<genre>[^,]+),\s+(?<institution>[^,]+),\s*(?<year>\d{4})(?:\.\s+(?<trailing>.+?))?\.?$/iu
	);

	if ( ! remainderMatch?.groups ) {
		return null;
	}

	const authorText = input
		.slice( 0, titleMatch.index )
		.trim()
		.replace( /[.,;:\s]+$/u, '' );

	const authors = parseAuthors( authorText );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'thesis',
			title: normalizeTitle( title ),
			genre: normalizeTrailingSentence( remainderMatch.groups.genre ),
			publisher: remainderMatch.groups.institution.trim(),
			issued: getIssuedYear( remainderMatch.groups.year ),
			...getTrailingCslFields( remainderMatch.groups.trailing ),
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseReviewCitation( input ) {
	const title = extractQuotedTitle( input );
	const titleMatch = input.match( QUOTED_TITLE_PATTERN );

	if ( ! title || ! titleMatch?.index ) {
		return null;
	}

	const remainder = input
		.slice( titleMatch.index + titleMatch[ 0 ].length )
		.trim()
		.replace( /^\.\s*/u, '' );
	const remainderMatch = remainder.match(
		/^Review of\s+(?<reviewedTitle>.+?),\s+by\s+(?<reviewedAuthor>.+?)\.\s+(?<container>.+?),\s+(?<date>[A-Za-z]+\s+\d{1,2},\s+\d{4})\.?$/iu
	);

	if ( ! remainderMatch?.groups ) {
		return null;
	}

	const authorText = input
		.slice( 0, titleMatch.index )
		.trim()
		.replace( /[.,;:\s]+$/u, '' );
	const authors = parseAuthors( authorText );

	if ( ! authors.length ) {
		return null;
	}

	const reviewedAuthors = parseAuthors(
		remainderMatch.groups.reviewedAuthor
	);

	return {
		csl: {
			type: 'review-book',
			title: normalizeTitle( title ),
			'reviewed-title': normalizeTitle(
				remainderMatch.groups.reviewedTitle
			),
			...( reviewedAuthors.length
				? {
						'reviewed-author': reviewedAuthors,
					}
				: {} ),
			'container-title': remainderMatch.groups.container.trim(),
			issued: parseNamedDate( remainderMatch.groups.date ) || undefined,
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseJournalArticleCitation( input ) {
	const match = input.match(
		/^(?<authors>.+?),\s+[“"](?<title>.+?)(?:,)?[”"](?:,)?\s+(?<container>.+?)\s+(?<volume>\d+)(?:,\s+no\.\s+(?<issue>\d+))?\s+\((?<year>\d{4})\):\s+(?<page>[^.]+?)(?:\.\s+(?<doi>(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,}\/\S+))?\.?$/iu
	);

	if ( ! match?.groups ) {
		return null;
	}

	const authors = parseAuthors( match.groups.authors );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle( match.groups.title ),
			'container-title': match.groups.container.trim(),
			volume: match.groups.volume.trim(),
			...( match.groups.issue
				? {
						issue: match.groups.issue.trim(),
					}
				: {} ),
			page: match.groups.page.trim(),
			...( match.groups.doi
				? {
						DOI: normalizeDoi( match.groups.doi ),
					}
				: {} ),
			issued: getIssuedYear( match.groups.year ),
			author: authors,
		},
		confidence: maybeLowConfidenceAuthorList( match.groups.authors ),
	};
}

function parseSentenceJournalArticleCitation( input ) {
	const title = extractQuotedTitle( input );
	const titleMatch = input.match( QUOTED_TITLE_PATTERN );

	if ( ! title || ! titleMatch?.index ) {
		return null;
	}

	const remainderMatch = input
		.slice( titleMatch.index + titleMatch[ 0 ].length )
		.trim()
		.replace( /^\.\s*/u, '' )
		.match(
			/^(?<container>.+?)\s+(?<volume>\d+)(?:,\s+no\.\s+(?<issue>\d+))?\s+\((?<year>\d{4})\):\s+(?<page>[^.]+?)(?:\.\s+(?<doi>(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,}\/\S+))?\.?$/iu
		);

	if ( ! remainderMatch?.groups ) {
		return null;
	}

	const authorText = input
		.slice( 0, titleMatch.index )
		.trim()
		.replace( /[.,;:\s]+$/u, '' );
	const authors = parseAuthors( authorText );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle( title ),
			'container-title': remainderMatch.groups.container.trim(),
			volume: remainderMatch.groups.volume.trim(),
			...( remainderMatch.groups.issue
				? {
						issue: remainderMatch.groups.issue.trim(),
					}
				: {} ),
			page: remainderMatch.groups.page.trim(),
			...( remainderMatch.groups.doi
				? {
						DOI: normalizeDoi( remainderMatch.groups.doi ),
					}
				: {} ),
			issued: getIssuedYear( remainderMatch.groups.year ),
			author: authors,
		},
		confidence: maybeLowConfidenceAuthorList( authorText ),
	};
}

function parseSeasonJournalArticleCitation( input ) {
	const match = input.match(
		/^(?<authors>.+?),\s+[“"](?<title>.+?)(?:,)?[”"](?:,)?\s+(?<container>.+?),\s+(?<season>Spring|Summer|Fall|Autumn|Winter)\s+(?<year>\d{4}),\s+(?<page>[^.]+)\.?$/iu
	);

	if ( ! match?.groups ) {
		return null;
	}

	const authors = parseAuthors( match.groups.authors );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle( match.groups.title ),
			'container-title': match.groups.container.trim(),
			page: match.groups.page.trim(),
			issued: getIssuedYear( match.groups.year ),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseApaJournalCitation( input ) {
	const match = input.match(
		/^(?<authors>.+?)\s+\((?<year>\d{4})\)\.\s+(?<title>.+)\.\s+(?<container>[^.]+?),\s+(?<volume>\d+)(?:\((?<issue>[^)]+)\))?(?:,\s+(?<page>[^.]+))?(?:\.\s+(?<doi>(?:(?:https?:\/\/(?:dx\.)?doi\.org\/)|(?:https?:\/\/)?doi:)?10\.\d{4,}\/\S+))?\.?$/iu
	);

	if ( ! match?.groups ) {
		return null;
	}

	const authors = parseApaAuthors( match.groups.authors );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle( match.groups.title ),
			'container-title': match.groups.container.trim(),
			volume: match.groups.volume.trim(),
			...( match.groups.issue
				? {
						issue: match.groups.issue.trim(),
					}
				: {} ),
			...( match.groups.page
				? {
						page: match.groups.page.trim(),
					}
				: {} ),
			...( match.groups.doi
				? {
						DOI: normalizeDoi( match.groups.doi ),
					}
				: {} ),
			issued: getIssuedYear( match.groups.year ),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseApaVolumePageCitation( input ) {
	const match = input.match(
		/^(?<authors>.+?)\s+\((?<year>\d{4})\)\.\s+(?<title>.+?)\s+\(Vol\.\s+(?<volume>[^,]+),\s+pp\.\s+(?<page>[^)]+)\)\.?$/iu
	);

	if ( ! match?.groups ) {
		return null;
	}

	const authors = parseAuthors( match.groups.authors );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle( match.groups.title ),
			volume: match.groups.volume.trim(),
			page: match.groups.page.trim(),
			issued: getIssuedYear( match.groups.year ),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseApaBookCitation( input ) {
	const match = input.match(
		/^(?<authors>.+?)\s+\((?<year>\d{4})\)\.\s+(?<title>.+?)\.\s+(?<publisher>.+?)\.?$/iu
	);

	if ( ! match?.groups ) {
		return null;
	}

	const authors = parseApaAuthors( match.groups.authors );

	if ( ! authors.length ) {
		return null;
	}

	return {
		csl: {
			type: 'book',
			title: normalizeTitle( match.groups.title ),
			publisher: normalizeTrailingSentence( match.groups.publisher ),
			issued: getIssuedYear( match.groups.year ),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseWebpageCitation( input ) {
	const urlMatch = input.match( /https?:\/\/[^\s]+/iu );
	const title = extractQuotedTitle( input );
	const titleMatch = input.match( QUOTED_TITLE_PATTERN );

	if ( ! urlMatch || ! title || ! titleMatch?.index ) {
		return null;
	}

	const authorText = input
		.slice( 0, titleMatch.index )
		.trim()
		.replace( /[.,;:\s]+$/u, '' );
	const authors =
		/[,&;]/u.test( authorText ) || authorText.includes( ',' )
			? parseAuthors( authorText )
			: [ { literal: authorText } ];

	if ( ! authorText || ! authors.length ) {
		return null;
	}

	const trailingText = input
		.slice( titleMatch.index + titleMatch[ 0 ].length, urlMatch.index )
		.trim()
		.replace( /^[.,;:\s]+/u, '' )
		.replace( /[.,;:\s]+$/u, '' );

	const segments = trailingText
		.split( /\.\s+/u )
		.map( ( segment ) => segment.trim() )
		.filter( Boolean );
	const csl = {
		type: 'webpage',
		title: normalizeTitle( title ),
		URL: urlMatch[ 0 ].replace( /[).,;:\s]+$/u, '' ),
		author: authors,
	};

	if ( segments.length ) {
		const lastSegment = segments.at( -1 );
		const effectiveMatch = lastSegment.match( /^Effective\s+(.+)$/iu );
		const modifiedMatch = lastSegment.match(
			/^Last modified\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})(?:,.*)?$/iu
		);
		const accessedMatch = lastSegment.match( /^Accessed\s+(.+)$/iu );
		const datedContainerMatch = lastSegment.match(
			/^(?<container>.+?),\s+(?<date>[A-Za-z]+\s+\d{1,2},\s+\d{4})$/u
		);

		if ( effectiveMatch ) {
			csl.issued = parseNamedDate( effectiveMatch[ 1 ] ) || undefined;
			segments.pop();
		} else if ( modifiedMatch ) {
			csl.issued = parseNamedDate( modifiedMatch[ 1 ] ) || undefined;
			segments.pop();
		} else if ( accessedMatch ) {
			csl.accessed = parseNamedDate( accessedMatch[ 1 ] ) || undefined;
			segments.pop();
		} else if ( datedContainerMatch?.groups ) {
			csl.issued =
				parseNamedDate( datedContainerMatch.groups.date ) || undefined;
			segments[ segments.length - 1 ] =
				datedContainerMatch.groups.container;
		}

		if ( segments.length ) {
			csl[ 'container-title' ] = segments.join( '. ' );
		}
	}

	return {
		csl,
		confidence: 'low',
	};
}

/**
 * Volume and issue labels in a row: "vol. 12, no. 3" (IEEE) or "v. 12, n. 3"
 * (ABNT). No real title holds them, so a title that does was cut from a
 * labelled journal article.
 */
const VOLUME_ISSUE_LABELS = /\b(?:vol|v)\.\s*\d+\s*,\s*(?:no|n|iss)\.\s*\d/iu;

/**
 * A title that ends in a page label the full stop cut off ("…, pp" or "…, p").
 */
const TRAILING_PAGE_LABEL = /,\s*pp?$/iu;

/**
 * A publisher that is only a page number or page range.
 */
const PAGE_RANGE_PUBLISHER = /^\d+(?:\s*[-–—]\s*\d+)?$/u;

/**
 * A quoted title closed with a comma or full stop inside the quotes
 * ("Title," or “Title.”), the way Chicago, MLA, and IEEE print an article or
 * chapter title. A book title that holds one was cut from an article.
 */
const QUOTED_PART_TITLE = /[“"][^”"]+[,.][”"]/u;

/**
 * An ABNT-style name ("CHABERT, Catherine") at the start of a title: the
 * full stops between ABNT authors made the next author look like the title.
 */
const CAPITALIZED_NAME_TITLE = /^[\p{Lu}][\p{Lu}'’-]+,\s+[\p{Lu}]\p{Ll}/u;

/**
 * Quotation marks, which never belong in a personal name.
 */
const QUOTE_MARK = /["“”]/u;

/**
 * Whether a parse misread its input, so the parser should keep looking or
 * decline.
 *
 * Each pattern is tried in turn and the first match wins, so a broad book
 * pattern can claim a citation in a style it was not written for and return
 * a wrong record instead of declining. A labelled IEEE or ABNT article
 * ("vol. 12, no. 3, pp. 34–43") is the known case: the title runs into the
 * labels, the page range becomes the publisher, and the quoted article title
 * becomes part of an author's name. A book whose title holds a quoted article
 * title, or starts with a second ABNT author, is the same mistake. Rejecting
 * those shapes turns the input back into a notice, which is better than a
 * quietly wrong citation.
 *
 * @param {Object} csl CSL-JSON from one pattern.
 * @return {boolean} True when the result should be discarded.
 */
function isMisreadParse( csl ) {
	const title = typeof csl.title === 'string' ? csl.title : '';

	if (
		VOLUME_ISSUE_LABELS.test( title ) ||
		TRAILING_PAGE_LABEL.test( title )
	) {
		return true;
	}

	if (
		[ 'book', 'collection' ].includes( csl.type ) &&
		( QUOTED_PART_TITLE.test( title ) ||
			CAPITALIZED_NAME_TITLE.test( title ) )
	) {
		return true;
	}

	if (
		typeof csl.publisher === 'string' &&
		PAGE_RANGE_PUBLISHER.test( csl.publisher.trim() )
	) {
		return true;
	}

	return [ ...( csl.author || [] ), ...( csl.editor || [] ) ].some(
		( name ) =>
			QUOTE_MARK.test( name.family || '' ) ||
			QUOTE_MARK.test( name.given || '' ) ||
			QUOTE_MARK.test( name.literal || '' )
	);
}

/**
 * List numbering at the start of an entry: "[12] ", "12. ", "12) ", "(12) ".
 * IEEE and Vancouver lists number their entries, and a pasted list keeps the
 * numbers. Up to three digits, so a leading year ("2001. A Space Odyssey") is
 * left alone.
 */
const LIST_NUMBER_PREFIX = /^(?:\[\d{1,3}\]|\(\d{1,3}\)|\d{1,3}[.)])\s+/u;

/**
 * The patterns, in the order they are tried when no style hint applies. The
 * first match that is not a misread wins. Harvard, IEEE, and Vancouver come
 * last, so they only read what the Chicago and APA patterns turn away.
 */
const FREE_TEXT_PATTERNS = [
	parseChapterCitation,
	parseSentenceChapterCitation,
	parseReviewCitation,
	parseSentenceJournalArticleCitation,
	parseJournalArticleCitation,
	parseSeasonJournalArticleCitation,
	parseApaJournalCitation,
	parseApaVolumePageCitation,
	parseApaBookCitation,
	parseWebpageCitation,
	parseSentenceEditedBookCitation,
	parseSentencePlaceYearBookCitation,
	parseThesisCitation,
	parseSentenceBookCitation,
	parseBookCitation,
	parseHarvardCitation,
	parseIeeeCitation,
	parseVancouverCitation,
];

/**
 * Patterns written for one style, by the style keys in `styles.json`. When
 * the block's style has a group, its patterns are tried first and the rest
 * follow in the usual order: an author pasting into a Harvard bibliography
 * most likely has Harvard citations, but may have copied others.
 */
const STYLE_PATTERN_GROUPS = {
	'apa-7': [
		parseApaJournalCitation,
		parseApaVolumePageCitation,
		parseApaBookCitation,
	],
	harvard: [ parseHarvardCitation ],
	ieee: [ parseIeeeCitation ],
	vancouver: [ parseVancouverCitation ],
};

/**
 * The patterns to try, hinted style first.
 *
 * @param {string} [styleKey] The block's citation style key.
 * @return {Array<(input: string) => ?{csl: Object, confidence: string}>} Pattern functions in order.
 */
function getPatternOrder( styleKey ) {
	const hinted = STYLE_PATTERN_GROUPS[ styleKey ];

	if ( ! hinted ) {
		return FREE_TEXT_PATTERNS;
	}

	return [
		...hinted,
		...FREE_TEXT_PATTERNS.filter(
			( pattern ) => ! hinted.includes( pattern )
		),
	];
}

/**
 * Read one formatted citation that has no identifier into CSL-JSON.
 *
 * @param {string} input              One pasted citation.
 * @param {Object} [options]          Options.
 * @param {string} [options.styleKey] The block's citation style key; that
 *                                    style's patterns are tried first.
 * @return {{csl: Object, confidence: string}|null} The record and how sure
 *     the matching pattern is (`low` or `medium`), or null when no pattern
 *     reads it.
 */
export function parseFreeTextCitation( input, { styleKey } = {} ) {
	const normalizedInput = input
		.replace( /\s+/gu, ' ' )
		.trim()
		.replace( LIST_NUMBER_PREFIX, '' );

	if ( ! normalizedInput ) {
		return null;
	}

	for ( const parsePattern of getPatternOrder( styleKey ) ) {
		const result = parsePattern( normalizedInput );

		if ( result && ! isMisreadParse( result.csl ) ) {
			return result;
		}
	}

	return null;
}
