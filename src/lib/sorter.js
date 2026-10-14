import { getStyleDefinition } from './formatting';
import { demotesParticleForSort, getSortFamily } from './name-particles';

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
 * The family name a contributor sorts by. With `particles` (current save) a
 * name particle follows the style's demote-non-dropping-particle option; with
 * `particles: null`, `family` is used as stored, the order save() produced
 * before particle-aware sorting.
 *
 * @param {Object}      contributor CSL name.
 * @param {Object|null} particles   `{ demote }`, or null for the legacy key.
 * @return {string} Family sort string, or '' when the name has none.
 */
function getContributorFamily(contributor = {}, particles = null) {
	return particles
		? getSortFamily(contributor, particles.demote)
		: contributor.family || '';
}

/**
 * Get the sortable author string from a CSL-JSON object.
 *
 * @param {Object}      csl       CSL-JSON object.
 * @param {Object|null} particles Particle sort rule (see getContributorFamily).
 * @return {string} Lowercase author string for sorting.
 */
function getAuthorSort(csl = {}, particles = null) {
	const primaryContributors = getPrimaryContributors(csl);

	if (!primaryContributors) {
		return csl.title ? stripArticles(csl.title).toLowerCase() : '\uffff';
	}

	const first = primaryContributors[0];
	return (
		getContributorFamily(first, particles) ||
		first.literal ||
		''
	).toLowerCase();
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

function compareAuthors(a, b, locale, particles) {
	const authorA = getAuthorSort(a.csl, particles);
	const authorB = getAuthorSort(b.csl, particles);

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

function normalizeContributorKey(contributor = {}, particles = null) {
	const family = getContributorFamily(contributor, particles)
		.trim()
		.toLowerCase();
	const given = (contributor.given || '').trim().toLowerCase();
	const literal = (contributor.literal || '').trim().toLowerCase();

	return family ? `${family}|${given}` : literal;
}

function getAuthorChain(csl = {}, particles = null) {
	const primaryContributors = getPrimaryContributors(csl) || [];
	return primaryContributors.map((contributor) =>
		normalizeContributorKey(contributor, particles)
	);
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

function compareNotes(a, b, locale, particles) {
	const authorCmp = compareAuthors(a, b, locale, particles);
	if (authorCmp !== 0) {
		return authorCmp;
	}

	const titleCmp = compareTitles(a, b, locale);
	if (titleCmp !== 0) {
		return titleCmp;
	}

	return compareYears(a, b);
}

function compareAuthorDate(a, b, locale, particles) {
	const chainA = getAuthorChain(a.csl, particles);
	const chainB = getAuthorChain(b.csl, particles);

	if (chainA.length && chainB.length) {
		const chainCmp = compareAuthorChains(chainA, chainB, locale);
		if (chainCmp !== 0) {
			return chainCmp;
		}
	} else {
		const authorCmp = compareAuthors(a, b, locale, particles);
		if (authorCmp !== 0) {
			return authorCmp;
		}
	}

	const authorCmp = compareAuthors(a, b, locale, particles);
	if (authorCmp !== 0) {
		return authorCmp;
	}

	const yearCmp = compareYears(a, b);
	if (yearCmp !== 0) {
		return yearCmp;
	}

	return compareTitles(a, b, locale);
}

function getComparatorForFamily(family, locale, particles) {
	switch (family) {
		case 'notes':
			return (a, b) => compareNotes(a, b, locale, particles);
		case 'author-date':
			return (a, b) => compareAuthorDate(a, b, locale, particles);
		case 'numeric':
			return null;
		default:
			return (a, b) => compareAuthorDate(a, b, locale, particles);
	}
}

/**
 * Sort an array of citation objects by style family rules.
 *
 * Name particles ("van Duijnhoven", "de la Cruz") sort as the style's
 * demote-non-dropping-particle option says: under the surname for Chicago,
 * under the particle for APA and MLA. `particleAwareSort: false` sorts by the
 * stored family as written, the order save() produced before 1.12.0.
 *
 * @param {Array}   citations                   Array of citation objects.
 * @param {string}  styleKey                    Citation style key.
 * @param {Object}  [options]                   Options.
 * @param {boolean} [options.particleAwareSort] Follow the style's particle
 *                                              rule (default true).
 * @return {Array} Sorted citation array.
 *
 * @since 0.1.0
 */
export function sortCitations(
	citations,
	styleKey,
	{ particleAwareSort = true } = {}
) {
	const style = getStyleDefinition(styleKey);
	const particles = particleAwareSort
		? {
				demote: demotesParticleForSort(style.demoteNonDroppingParticle),
		  }
		: null;
	const comparator = getComparatorForFamily(
		style.family,
		style.locale || 'en-US',
		particles
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
