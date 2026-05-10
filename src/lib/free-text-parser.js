import {
	maybeLowConfidenceAuthorList,
	parseApaAuthors,
	parseAuthors,
} from './free-text-authors';

const DOI_URL_PREFIX =
	/^(?:https?:\/\/(?:dx\.)?doi\.org\/|https?:\/\/doi:|doi:)/i;
const QUOTED_TITLE_PATTERN = /[“"](?<title>.+?)(?:,)?[”"]/u;
const MONTH_INDEX = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

function normalizeDoi(doiValue) {
	return doiValue
		.trim()
		.replace(DOI_URL_PREFIX, '')
		.replace(/[).,;:\s]+$/u, '');
}

function normalizeTitle(title) {
	return title.trim().replace(/[.,]\s*$/u, '');
}

function normalizeTrailingSentence(value) {
	return value.trim().replace(/[.;,:\s]+$/u, '');
}

function extractQuotedTitle(input) {
	return input.match(QUOTED_TITLE_PATTERN)?.groups?.title || null;
}

function getIssuedYear(yearText) {
	return {
		'date-parts': [[Number(yearText)]],
	};
}

function parseNamedDate(dateText) {
	const match = dateText.match(
		/^(?<month>[A-Za-z]+)\s+(?<day>\d{1,2}),\s+(?<year>\d{4})$/u
	);

	if (!match?.groups) {
		return null;
	}

	const month = MONTH_INDEX[match.groups.month.toLowerCase()];

	if (!month) {
		return null;
	}

	return {
		'date-parts': [
			[Number(match.groups.year), month, Number(match.groups.day)],
		],
	};
}

function getTrailingCslFields(trailingText) {
	if (!trailingText) {
		return {};
	}

	const normalizedTrailing = normalizeTrailingSentence(trailingText);

	if (!normalizedTrailing) {
		return {};
	}

	const urlMatch = normalizedTrailing.match(/https?:\/\/[^\s]+/iu);

	if (urlMatch) {
		return {
			URL: urlMatch[0].replace(/[).,;:\s]+$/u, ''),
		};
	}

	return {
		medium: normalizedTrailing,
	};
}

function normalizeEdition(editionText) {
	if (!editionText) {
		return undefined;
	}

	const numberMatch = editionText.match(/\b(\d+)(?:st|nd|rd|th)?\b/iu);

	if (numberMatch) {
		return numberMatch[1];
	}

	return normalizeTrailingSentence(
		editionText.replace(/\bed\.?$/iu, '').trim()
	);
}

function parseChapterCitation(input) {
	const match = input.match(
		/^(?<authors>.+?),\s+[“"](?<title>.+?)(?:,)?[”"](?:,)?\s+in\s+(?<container>.+?),\s+ed\.\s+(?<editor>.+?)\s+\((?<publisher>[^,]+),\s*(?<year>\d{4})\)\s*(?:,\s*(?<page>[^.]+))?\.?$/iu
	);

	if (!match?.groups) {
		return null;
	}

	const authors = parseAuthors(match.groups.authors);
	const editors = parseAuthors(match.groups.editor);

	if (!authors.length || !editors.length) {
		return null;
	}

	return {
		csl: {
			type: 'chapter',
			title: normalizeTitle(match.groups.title),
			'container-title': match.groups.container.trim(),
			editor: editors,
			publisher: match.groups.publisher.trim(),
			issued: getIssuedYear(match.groups.year),
			...(match.groups.page
				? {
						page: match.groups.page.trim(),
				  }
				: {}),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseSentenceChapterCitation(input) {
	const title = extractQuotedTitle(input);
	const titleMatch = input.match(QUOTED_TITLE_PATTERN);

	if (!title || !titleMatch?.index) {
		return null;
	}

	const afterQuote = input.slice(titleMatch.index + titleMatch[0].length);
	const afterIn = afterQuote.replace(/^\s*\.?\s*In\s+/iu, '');

	if (afterIn === afterQuote) {
		return null;
	}

	const tailParts = afterIn.split(/,\s+edited by\s+/iu);

	if (tailParts.length !== 2) {
		return null;
	}

	const [container, editorAndPublication] = tailParts;
	const publicationMatch = editorAndPublication.match(
		/^(?<editor>.+)\.\s+(?<publisher>[^,]+),\s*(?<year>\d{4})(?:,\s*(?<page>[^.]+))?\.?$/u
	);

	if (!publicationMatch?.groups) {
		return null;
	}

	const authorText = input
		.slice(0, titleMatch.index)
		.trim()
		.replace(/[.,;:\s]+$/u, '');

	const authors = parseAuthors(authorText);
	const editors = parseAuthors(publicationMatch.groups.editor);

	if (!authors.length || !editors.length) {
		return null;
	}

	return {
		csl: {
			type: 'chapter',
			title: normalizeTitle(title),
			'container-title': container.trim(),
			editor: editors,
			publisher: publicationMatch.groups.publisher.trim(),
			issued: getIssuedYear(publicationMatch.groups.year),
			...(publicationMatch.groups.page
				? {
						page: publicationMatch.groups.page.trim(),
				  }
				: {}),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseBookCitation(input) {
	const match = input.match(
		/^(?<authors>.+?),\s+(?<title>.+)\s+\((?<publisher>[^,]+),\s*(?<year>\d{4})\)\s*(?:,\s*(?<page>[^.]+))?\.?$/u
	);

	if (!match?.groups) {
		return null;
	}

	const authors = parseAuthors(match.groups.authors);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'book',
			title: match.groups.title.trim(),
			publisher: match.groups.publisher.trim(),
			issued: getIssuedYear(match.groups.year),
			...(match.groups.page
				? {
						page: match.groups.page.trim(),
				  }
				: {}),
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseSentenceBookCitation(input) {
	const match = input.match(
		/^(?<authors>.+?\b[\p{Lu}][\p{L}'’.-]+)\.\s+(?<title>.+?)\.\s+(?:(?<edition>[^.]+?\bed\.?)\s+)?(?<publisher>[^,]+),\s*(?<year>\d{4})(?:,\s*(?<page>[^.]+))?(?:\.\s+(?<trailing>.+?))?\.?$/u
	);

	if (!match?.groups) {
		return null;
	}

	const authors = parseAuthors(match.groups.authors);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'book',
			title: match.groups.title.trim(),
			publisher: match.groups.publisher.trim(),
			issued: getIssuedYear(match.groups.year),
			...(normalizeEdition(match.groups.edition)
				? {
						edition: normalizeEdition(match.groups.edition),
				  }
				: {}),
			...(match.groups.page
				? {
						page: match.groups.page.trim(),
				  }
				: {}),
			...getTrailingCslFields(match.groups.trailing),
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseSentenceEditedBookCitation(input) {
	const match = input.match(
		/^(?<editors>.+?),\s+eds?\.\s+(?<title>.+?)\.\s+(?:(?<edition>[^.]+?\bed\.?)\s+)?(?<publisher>[^,]+),\s*(?<year>\d{4})(?:\.\s+(?<trailing>.+?))?\.?$/iu
	);

	if (!match?.groups) {
		return null;
	}

	const editors = parseAuthors(match.groups.editors);

	if (!editors.length) {
		return null;
	}

	return {
		csl: {
			type: 'collection',
			title: match.groups.title.trim(),
			editor: editors,
			publisher: match.groups.publisher.trim(),
			issued: getIssuedYear(match.groups.year),
			...(normalizeEdition(match.groups.edition)
				? {
						edition: normalizeEdition(match.groups.edition),
				  }
				: {}),
			...getTrailingCslFields(match.groups.trailing),
		},
		confidence: 'medium',
	};
}

function parseSentencePlaceYearBookCitation(input) {
	const match = input.match(
		/^(?<authors>.+?\b[\p{Lu}][\p{L}'’.-]+)\.\s+(?<title>.+?)\.\s+(?<place>[^,]+),\s*(?<year>\d{4})(?:\.\s+(?<trailing>.+?))?\.?$/u
	);

	if (
		!match?.groups ||
		!match.groups.trailing ||
		!/^https?:\/\//iu.test(match.groups.trailing.trim())
	) {
		return null;
	}

	const authors = parseAuthors(match.groups.authors);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'book',
			title: match.groups.title.trim(),
			'publisher-place': match.groups.place.trim(),
			issued: getIssuedYear(match.groups.year),
			...getTrailingCslFields(match.groups.trailing),
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseThesisCitation(input) {
	const title = extractQuotedTitle(input);
	const titleMatch = input.match(QUOTED_TITLE_PATTERN);

	if (!title || !titleMatch?.index) {
		return null;
	}

	const remainder = input
		.slice(titleMatch.index + titleMatch[0].length)
		.trim()
		.replace(/^\.\s*/u, '');
	const remainderMatch = remainder.match(
		/^(?<genre>[^,]+),\s+(?<institution>[^,]+),\s*(?<year>\d{4})(?:\.\s+(?<trailing>.+?))?\.?$/iu
	);

	if (!remainderMatch?.groups) {
		return null;
	}

	const authorText = input
		.slice(0, titleMatch.index)
		.trim()
		.replace(/[.,;:\s]+$/u, '');

	const authors = parseAuthors(authorText);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'thesis',
			title: normalizeTitle(title),
			genre: normalizeTrailingSentence(remainderMatch.groups.genre),
			publisher: remainderMatch.groups.institution.trim(),
			issued: getIssuedYear(remainderMatch.groups.year),
			...getTrailingCslFields(remainderMatch.groups.trailing),
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseReviewCitation(input) {
	const title = extractQuotedTitle(input);
	const titleMatch = input.match(QUOTED_TITLE_PATTERN);

	if (!title || !titleMatch?.index) {
		return null;
	}

	const remainder = input
		.slice(titleMatch.index + titleMatch[0].length)
		.trim()
		.replace(/^\.\s*/u, '');
	const remainderMatch = remainder.match(
		/^Review of\s+(?<reviewedTitle>.+?),\s+by\s+(?<reviewedAuthor>.+?)\.\s+(?<container>.+?),\s+(?<date>[A-Za-z]+\s+\d{1,2},\s+\d{4})\.?$/iu
	);

	if (!remainderMatch?.groups) {
		return null;
	}

	const authorText = input
		.slice(0, titleMatch.index)
		.trim()
		.replace(/[.,;:\s]+$/u, '');
	const authors = parseAuthors(authorText);

	if (!authors.length) {
		return null;
	}

	const reviewedAuthors = parseAuthors(remainderMatch.groups.reviewedAuthor);

	return {
		csl: {
			type: 'review-book',
			title: normalizeTitle(title),
			'reviewed-title': normalizeTitle(
				remainderMatch.groups.reviewedTitle
			),
			...(reviewedAuthors.length
				? {
						'reviewed-author': reviewedAuthors,
				  }
				: {}),
			'container-title': remainderMatch.groups.container.trim(),
			issued: parseNamedDate(remainderMatch.groups.date) || undefined,
			author: authors,
		},
		confidence: 'medium',
	};
}

function parseJournalArticleCitation(input) {
	const match = input.match(
		/^(?<authors>.+?),\s+[“"](?<title>.+?)(?:,)?[”"](?:,)?\s+(?<container>.+?)\s+(?<volume>\d+)(?:,\s+no\.\s+(?<issue>\d+))?\s+\((?<year>\d{4})\):\s+(?<page>[^.]+?)(?:\.\s+(?<doi>(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,}\/\S+))?\.?$/iu
	);

	if (!match?.groups) {
		return null;
	}

	const authors = parseAuthors(match.groups.authors);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle(match.groups.title),
			'container-title': match.groups.container.trim(),
			volume: match.groups.volume.trim(),
			...(match.groups.issue
				? {
						issue: match.groups.issue.trim(),
				  }
				: {}),
			page: match.groups.page.trim(),
			...(match.groups.doi
				? {
						DOI: normalizeDoi(match.groups.doi),
				  }
				: {}),
			issued: getIssuedYear(match.groups.year),
			author: authors,
		},
		confidence: maybeLowConfidenceAuthorList(match.groups.authors),
	};
}

function parseSentenceJournalArticleCitation(input) {
	const title = extractQuotedTitle(input);
	const titleMatch = input.match(QUOTED_TITLE_PATTERN);

	if (!title || !titleMatch?.index) {
		return null;
	}

	const remainderMatch = input
		.slice(titleMatch.index + titleMatch[0].length)
		.trim()
		.replace(/^\.\s*/u, '')
		.match(
			/^(?<container>.+?)\s+(?<volume>\d+)(?:,\s+no\.\s+(?<issue>\d+))?\s+\((?<year>\d{4})\):\s+(?<page>[^.]+?)(?:\.\s+(?<doi>(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,}\/\S+))?\.?$/iu
		);

	if (!remainderMatch?.groups) {
		return null;
	}

	const authorText = input
		.slice(0, titleMatch.index)
		.trim()
		.replace(/[.,;:\s]+$/u, '');
	const authors = parseAuthors(authorText);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle(title),
			'container-title': remainderMatch.groups.container.trim(),
			volume: remainderMatch.groups.volume.trim(),
			...(remainderMatch.groups.issue
				? {
						issue: remainderMatch.groups.issue.trim(),
				  }
				: {}),
			page: remainderMatch.groups.page.trim(),
			...(remainderMatch.groups.doi
				? {
						DOI: normalizeDoi(remainderMatch.groups.doi),
				  }
				: {}),
			issued: getIssuedYear(remainderMatch.groups.year),
			author: authors,
		},
		confidence: maybeLowConfidenceAuthorList(authorText),
	};
}

function parseSeasonJournalArticleCitation(input) {
	const match = input.match(
		/^(?<authors>.+?),\s+[“"](?<title>.+?)(?:,)?[”"](?:,)?\s+(?<container>.+?),\s+(?<season>Spring|Summer|Fall|Autumn|Winter)\s+(?<year>\d{4}),\s+(?<page>[^.]+)\.?$/iu
	);

	if (!match?.groups) {
		return null;
	}

	const authors = parseAuthors(match.groups.authors);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle(match.groups.title),
			'container-title': match.groups.container.trim(),
			page: match.groups.page.trim(),
			issued: getIssuedYear(match.groups.year),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseApaJournalCitation(input) {
	const match = input.match(
		/^(?<authors>.+?)\s+\((?<year>\d{4})\)\.\s+(?<title>.+)\.\s+(?<container>[^.]+?),\s+(?<volume>\d+)(?:\((?<issue>[^)]+)\))?(?:,\s+(?<page>[^.]+))?(?:\.\s+(?<doi>(?:(?:https?:\/\/(?:dx\.)?doi\.org\/)|(?:https?:\/\/)?doi:)?10\.\d{4,}\/\S+))?\.?$/iu
	);

	if (!match?.groups) {
		return null;
	}

	const authors = parseApaAuthors(match.groups.authors);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle(match.groups.title),
			'container-title': match.groups.container.trim(),
			volume: match.groups.volume.trim(),
			...(match.groups.issue
				? {
						issue: match.groups.issue.trim(),
				  }
				: {}),
			...(match.groups.page
				? {
						page: match.groups.page.trim(),
				  }
				: {}),
			...(match.groups.doi
				? {
						DOI: normalizeDoi(match.groups.doi),
				  }
				: {}),
			issued: getIssuedYear(match.groups.year),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseApaVolumePageCitation(input) {
	const match = input.match(
		/^(?<authors>.+?)\s+\((?<year>\d{4})\)\.\s+(?<title>.+?)\s+\(Vol\.\s+(?<volume>[^,]+),\s+pp\.\s+(?<page>[^)]+)\)\.?$/iu
	);

	if (!match?.groups) {
		return null;
	}

	const authors = parseAuthors(match.groups.authors);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'article-journal',
			title: normalizeTitle(match.groups.title),
			volume: match.groups.volume.trim(),
			page: match.groups.page.trim(),
			issued: getIssuedYear(match.groups.year),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseApaBookCitation(input) {
	const match = input.match(
		/^(?<authors>.+?)\s+\((?<year>\d{4})\)\.\s+(?<title>.+?)\.\s+(?<publisher>.+?)\.?$/iu
	);

	if (!match?.groups) {
		return null;
	}

	const authors = parseApaAuthors(match.groups.authors);

	if (!authors.length) {
		return null;
	}

	return {
		csl: {
			type: 'book',
			title: normalizeTitle(match.groups.title),
			publisher: normalizeTrailingSentence(match.groups.publisher),
			issued: getIssuedYear(match.groups.year),
			author: authors,
		},
		confidence: 'low',
	};
}

function parseWebpageCitation(input) {
	const urlMatch = input.match(/https?:\/\/[^\s]+/iu);
	const title = extractQuotedTitle(input);
	const titleMatch = input.match(QUOTED_TITLE_PATTERN);

	if (!urlMatch || !title || !titleMatch?.index) {
		return null;
	}

	const authorText = input
		.slice(0, titleMatch.index)
		.trim()
		.replace(/[.,;:\s]+$/u, '');
	const authors =
		/[,&;]/u.test(authorText) || authorText.includes(',')
			? parseAuthors(authorText)
			: [{ literal: authorText }];

	if (!authorText || !authors.length) {
		return null;
	}

	const trailingText = input
		.slice(titleMatch.index + titleMatch[0].length, urlMatch.index)
		.trim()
		.replace(/^[.,;:\s]+/u, '')
		.replace(/[.,;:\s]+$/u, '');

	const segments = trailingText
		.split(/\.\s+/u)
		.map((segment) => segment.trim())
		.filter(Boolean);
	const csl = {
		type: 'webpage',
		title: normalizeTitle(title),
		URL: urlMatch[0].replace(/[).,;:\s]+$/u, ''),
		author: authors,
	};

	if (segments.length) {
		const lastSegment = segments.at(-1);
		const effectiveMatch = lastSegment.match(/^Effective\s+(.+)$/iu);
		const modifiedMatch = lastSegment.match(
			/^Last modified\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})(?:,.*)?$/iu
		);
		const accessedMatch = lastSegment.match(/^Accessed\s+(.+)$/iu);
		const datedContainerMatch = lastSegment.match(
			/^(?<container>.+?),\s+(?<date>[A-Za-z]+\s+\d{1,2},\s+\d{4})$/u
		);

		if (effectiveMatch) {
			csl.issued = parseNamedDate(effectiveMatch[1]) || undefined;
			segments.pop();
		} else if (modifiedMatch) {
			csl.issued = parseNamedDate(modifiedMatch[1]) || undefined;
			segments.pop();
		} else if (accessedMatch) {
			csl.accessed = parseNamedDate(accessedMatch[1]) || undefined;
			segments.pop();
		} else if (datedContainerMatch?.groups) {
			csl.issued =
				parseNamedDate(datedContainerMatch.groups.date) || undefined;
			segments[segments.length - 1] =
				datedContainerMatch.groups.container;
		}

		if (segments.length) {
			csl['container-title'] = segments.join('. ');
		}
	}

	return {
		csl,
		confidence: 'low',
	};
}

export function parseFreeTextCitation(input) {
	const normalizedInput = input.replace(/\s+/gu, ' ').trim();

	if (!normalizedInput) {
		return null;
	}

	return (
		parseChapterCitation(normalizedInput) ||
		parseSentenceChapterCitation(normalizedInput) ||
		parseReviewCitation(normalizedInput) ||
		parseSentenceJournalArticleCitation(normalizedInput) ||
		parseJournalArticleCitation(normalizedInput) ||
		parseSeasonJournalArticleCitation(normalizedInput) ||
		parseApaJournalCitation(normalizedInput) ||
		parseApaVolumePageCitation(normalizedInput) ||
		parseApaBookCitation(normalizedInput) ||
		parseWebpageCitation(normalizedInput) ||
		parseSentenceEditedBookCitation(normalizedInput) ||
		parseSentencePlaceYearBookCitation(normalizedInput) ||
		parseThesisCitation(normalizedInput) ||
		parseSentenceBookCitation(normalizedInput) ||
		parseBookCitation(normalizedInput) ||
		null
	);
}
