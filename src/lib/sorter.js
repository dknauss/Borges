import { getStyleDefinition } from './formatting';

const LEADING_ARTICLES = /^(a|an|the)\s+/i;

function getPrimaryContributors(csl = {}) {
	return (
		(csl.author && csl.author.length && csl.author) ||
		(csl.editor && csl.editor.length && csl.editor) ||
		null
	);
}

/**
 * Strip leading articles from a title for sort purposes.
 *
 * @param {string} title The title string.
 * @return {string} Title without leading article.
 */
function stripArticles(title) {
	return (title || '').replace(LEADING_ARTICLES, '');
}

/**
 * Get the sortable author string from a CSL-JSON object.
 *
 * @param {Object} csl CSL-JSON object.
 * @return {string} Lowercase author string for sorting.
 */
function getAuthorSort(csl = {}) {
	const primaryContributors = getPrimaryContributors(csl);

	if (!primaryContributors) {
		return csl.title ? stripArticles(csl.title).toLowerCase() : '\uffff';
	}

	const first = primaryContributors[0];
	return (first.family || first.literal || '').toLowerCase();
}

/**
 * Get the publication year for sorting. Missing dates intentionally return
 * Infinity so undated citations sort after dated citations.
 *
 * @param {Object} csl CSL-JSON object.
 * @return {number} Year or Infinity if not present.
 */
function getSortableYear(csl = {}) {
	if (
		csl.issued &&
		csl.issued['date-parts'] &&
		csl.issued['date-parts'][0] &&
		csl.issued['date-parts'][0][0]
	) {
		return csl.issued['date-parts'][0][0];
	}

	return Infinity;
}

/**
 * Get the sortable title string from a CSL-JSON object.
 *
 * @param {Object} csl CSL-JSON object.
 * @return {string} Lowercase title without leading articles.
 */
function getTitleSort(csl = {}) {
	return stripArticles(csl.title || '').toLowerCase();
}

function compareAuthors(a, b, locale) {
	const authorA = getAuthorSort(a.csl);
	const authorB = getAuthorSort(b.csl);

	return authorA.localeCompare(authorB, locale, {
		sensitivity: 'base',
	});
}

function compareTitles(a, b, locale) {
	const titleA = getTitleSort(a.csl);
	const titleB = getTitleSort(b.csl);

	return titleA.localeCompare(titleB, locale, {
		sensitivity: 'base',
	});
}

function compareYears(a, b) {
	return getSortableYear(a.csl) - getSortableYear(b.csl);
}

function normalizeContributorKey(contributor = {}) {
	const family = (contributor.family || '').trim().toLowerCase();
	const given = (contributor.given || '').trim().toLowerCase();
	const literal = (contributor.literal || '').trim().toLowerCase();

	return family ? `${family}|${given}` : literal;
}

function getAuthorChain(csl = {}) {
	const primaryContributors = getPrimaryContributors(csl) || [];
	return primaryContributors.map(normalizeContributorKey);
}

function compareAuthorChains(chainA, chainB, locale) {
	const firstCmp = (chainA[0] || '').localeCompare(chainB[0] || '', locale, {
		sensitivity: 'base',
	});

	if (firstCmp !== 0) {
		return firstCmp;
	}

	if (chainA.length !== chainB.length) {
		if (chainA.length === 1) {
			return -1;
		}

		if (chainB.length === 1) {
			return 1;
		}
	}

	const chainLength = Math.min(chainA.length, chainB.length);
	for (let index = 1; index < chainLength; index++) {
		const contributorCmp = chainA[index].localeCompare(
			chainB[index],
			locale,
			{
				sensitivity: 'base',
			}
		);

		if (contributorCmp !== 0) {
			return contributorCmp;
		}
	}

	return chainA.length - chainB.length;
}

function compareNotes(a, b, locale) {
	const authorCmp = compareAuthors(a, b, locale);
	if (authorCmp !== 0) {
		return authorCmp;
	}

	const titleCmp = compareTitles(a, b, locale);
	if (titleCmp !== 0) {
		return titleCmp;
	}

	return compareYears(a, b);
}

function compareAuthorDate(a, b, locale) {
	const chainA = getAuthorChain(a.csl);
	const chainB = getAuthorChain(b.csl);

	if (chainA.length && chainB.length) {
		const chainCmp = compareAuthorChains(chainA, chainB, locale);
		if (chainCmp !== 0) {
			return chainCmp;
		}
	} else {
		const authorCmp = compareAuthors(a, b, locale);
		if (authorCmp !== 0) {
			return authorCmp;
		}
	}

	const authorCmp = compareAuthors(a, b, locale);
	if (authorCmp !== 0) {
		return authorCmp;
	}

	const yearCmp = compareYears(a, b);
	if (yearCmp !== 0) {
		return yearCmp;
	}

	return compareTitles(a, b, locale);
}

function getComparatorForFamily(family, locale) {
	switch (family) {
		case 'notes':
			return (a, b) => compareNotes(a, b, locale);
		case 'author-date':
			return (a, b) => compareAuthorDate(a, b, locale);
		case 'numeric':
			return null;
		default:
			return (a, b) => compareAuthorDate(a, b, locale);
	}
}

/**
 * Sort an array of citation objects by style family rules.
 *
 * @param {Array}  citations Array of citation objects.
 * @param {string} styleKey  Citation style key.
 * @return {Array} Sorted citation array.
 *
 * @since 0.1.0
 */
export function sortCitations(citations, styleKey) {
	const style = getStyleDefinition(styleKey);
	const comparator = getComparatorForFamily(
		style.family,
		style.locale || 'en-US'
	);

	if (comparator === null) {
		return [...citations];
	}

	return [...citations]
		.map((citation, index) => ({ citation, index }))
		.sort((left, right) => {
			const comparison = comparator(left.citation, right.citation);
			return comparison === 0 ? left.index - right.index : comparison;
		})
		.map(({ citation }) => citation);
}
