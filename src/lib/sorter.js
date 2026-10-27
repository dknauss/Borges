import styleData from '../../includes/styles.json';
import { getStyleDefinition } from './formatting';
import { demotesParticleForSort, getSortFamily } from './name-particles';

const ENGLISH_ARTICLES = /^(a|an|the)\s+/i;

/**
 * The leading articles a style's titles sort without.
 *
 * English articles always, plus those of the style's locale language listed
 * in `leadingArticles` in includes/styles.json, as ABNT NBR 6033:1989 §3.4
 * ("Artigos iniciais") asks: an article that opens an entry is not counted
 * in alphabetical order. So ABNT (pt-BR) files "O Guarani" under G.
 *
 * @param {string} locale Style locale, such as pt-BR.
 * @return {RegExp} Pattern for one leading article and the space after it.
 */
export function getLeadingArticlesPattern(locale = 'en-US') {
	const language = locale.split('-')[0].toLowerCase();
	const articles = new Set([
		...styleData.leadingArticles.en,
		...(styleData.leadingArticles[language] || []),
	]);

	return new RegExp(`^(${[...articles].join('|')})\\s+`, 'i');
}

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
 * @param {string} title    The title string.
 * @param {RegExp} articles Leading-article pattern (getLeadingArticlesPattern()).
 * @return {string} Title without leading article.
 */
function stripArticles(title, articles = ENGLISH_ARTICLES) {
	return (title || '').replace(articles, '');
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
 * @param {RegExp}      articles  Leading-article pattern for a title entry.
 * @return {string} Lowercase author string for sorting.
 */
function getAuthorSort(
	csl = {},
	particles = null,
	articles = ENGLISH_ARTICLES
) {
	const primaryContributors = getPrimaryContributors(csl);

	if (!primaryContributors) {
		return csl.title
			? stripArticles(csl.title, articles).toLowerCase()
			: '\uffff';
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
 * @param {Object} csl      CSL-JSON object.
 * @param {RegExp} articles Leading-article pattern.
 * @return {string} Lowercase title without leading articles.
 */
function getTitleSort(csl = {}, articles = ENGLISH_ARTICLES) {
	return stripArticles(csl.title || '', articles).toLowerCase();
}

function compareAuthors(a, b, locale, { particles, articles }) {
	const authorA = getAuthorSort(a.csl, particles, articles);
	const authorB = getAuthorSort(b.csl, particles, articles);

	return authorA.localeCompare(authorB, locale, {
		sensitivity: 'base',
	});
}

function compareTitles(a, b, locale, { articles }) {
	const titleA = getTitleSort(a.csl, articles);
	const titleB = getTitleSort(b.csl, articles);

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

/**
 * Compare two entries by their whole primary-contributor chains when both
 * have one, else by the author sort key (a title for an authorless entry).
 *
 * Shared by the notes and author-date comparators, so a single-author work
 * sorts before co-authored works that begin with the same name, and
 * contributors who share a family name sort by given name.
 *
 * @param {Object} a      Citation.
 * @param {Object} b      Citation.
 * @param {string} locale Style locale.
 * @param {Object} rule   Sort rule from sortCitations().
 * @return {number} Comparison result.
 */
function compareAuthorChainsOrKeys(a, b, locale, rule) {
	const chainA = getAuthorChain(a.csl, rule.particles);
	const chainB = getAuthorChain(b.csl, rule.particles);

	if (chainA.length && chainB.length) {
		const chainCmp = compareAuthorChains(chainA, chainB, locale);
		if (chainCmp !== 0) {
			return chainCmp;
		}
	}

	return compareAuthors(a, b, locale, rule);
}

/**
 * Notes-bibliography order: authors, then title, then year.
 *
 * With `rule.authorChains` the authors compare as whole chains, as CMOS
 * 17th ed. 14.67–14.70 asks: "Gessner, Conrad" before "Gessner, Conrad, and
 * Josias Simler", and "Smith, Adam" before "Smith, John". Without it only the
 * first contributor's family name counts, the order save() produced before
 * 1.16.0.
 *
 * @param {Object} a      Citation.
 * @param {Object} b      Citation.
 * @param {string} locale Style locale.
 * @param {Object} rule   Sort rule from sortCitations().
 * @return {number} Comparison result.
 */
function compareNotes(a, b, locale, rule) {
	const authorCmp = rule.authorChains
		? compareAuthorChainsOrKeys(a, b, locale, rule)
		: compareAuthors(a, b, locale, rule);
	if (authorCmp !== 0) {
		return authorCmp;
	}

	const titleCmp = compareTitles(a, b, locale, rule);
	if (titleCmp !== 0) {
		return titleCmp;
	}

	return compareYears(a, b);
}

function compareAuthorDate(a, b, locale, rule) {
	const authorCmp = compareAuthorChainsOrKeys(a, b, locale, rule);
	if (authorCmp !== 0) {
		return authorCmp;
	}

	const yearCmp = compareYears(a, b);
	if (yearCmp !== 0) {
		return yearCmp;
	}

	return compareTitles(a, b, locale, rule);
}

function getComparatorForFamily(family, locale, rule) {
	switch (family) {
		case 'notes':
			return (a, b) => compareNotes(a, b, locale, rule);
		case 'author-date':
			return (a, b) => compareAuthorDate(a, b, locale, rule);
		case 'numeric':
			return null;
		default:
			return (a, b) => compareAuthorDate(a, b, locale, rule);
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
 * Titles sort without a leading article: English ones always, and the style
 * locale's own (getLeadingArticlesPattern()), so ABNT skips "O" and "Uma".
 * `localeArticles: false` skips only the English ones, the order save()
 * produced before 1.16.0.
 *
 * Notes styles compare whole author chains, as author-date styles always
 * have, so a single-author work precedes co-authored works that begin with
 * the same name. `notesAuthorChains: false` compares only the first
 * contributor's family name, the order save() produced before 1.16.0.
 *
 * @param {Array}   citations                   Array of citation objects.
 * @param {string}  styleKey                    Citation style key.
 * @param {Object}  [options]                   Options.
 * @param {boolean} [options.particleAwareSort] Follow the style's particle
 *                                              rule (default true).
 * @param {boolean} [options.localeArticles]    Skip the style locale's
 *                                              leading articles too
 *                                              (default true).
 * @param {boolean} [options.notesAuthorChains] Compare whole author chains
 *                                              in notes styles
 *                                              (default true).
 * @return {Array} Sorted citation array.
 *
 * @since 0.1.0
 */
export function sortCitations(
	citations,
	styleKey,
	{
		particleAwareSort = true,
		localeArticles = true,
		notesAuthorChains = true,
	} = {}
) {
	const style = getStyleDefinition(styleKey);
	const locale = style.locale || 'en-US';
	const rule = {
		particles: particleAwareSort
			? {
					demote: demotesParticleForSort(
						style.demoteNonDroppingParticle
					),
			  }
			: null,
		articles: localeArticles
			? getLeadingArticlesPattern(locale)
			: ENGLISH_ARTICLES,
		authorChains: notesAuthorChains,
	};
	const comparator = getComparatorForFamily(style.family, locale, rule);

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
