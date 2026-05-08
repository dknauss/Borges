import apiFetch from '@wordpress/api-fetch';

const BIBLIOGRAPHY_CACHE = new Map();
const MAX_FORMAT_CACHE_ENTRIES = 500;
const FORMAT_ENDPOINT = 'bibliography/v1/format';

function emitFormattingWarning(...args) {
	// eslint-disable-next-line no-console
	console?.warn?.(...args);
}

function getBibliographyCacheKey(cslItems, styleKey, locale = '') {
	return stableStringify({
		styleKey,
		locale,
		cslItems,
	});
}

function getCachedBibliography(cacheKey) {
	if (!BIBLIOGRAPHY_CACHE.has(cacheKey)) {
		return undefined;
	}

	const formattedEntries = BIBLIOGRAPHY_CACHE.get(cacheKey);

	// Refresh insertion order on access so Map behaves as a simple LRU cache.
	BIBLIOGRAPHY_CACHE.delete(cacheKey);
	BIBLIOGRAPHY_CACHE.set(cacheKey, formattedEntries);

	return [...formattedEntries];
}

function setCachedBibliography(cacheKey, formattedEntries) {
	if (BIBLIOGRAPHY_CACHE.has(cacheKey)) {
		BIBLIOGRAPHY_CACHE.delete(cacheKey);
	}

	while (BIBLIOGRAPHY_CACHE.size >= MAX_FORMAT_CACHE_ENTRIES) {
		const leastRecentlyUsedCacheKey =
			BIBLIOGRAPHY_CACHE.keys().next().value;

		if (!leastRecentlyUsedCacheKey) {
			break;
		}

		BIBLIOGRAPHY_CACHE.delete(leastRecentlyUsedCacheKey);
	}

	BIBLIOGRAPHY_CACHE.set(cacheKey, [...formattedEntries]);
	return [...formattedEntries];
}

function getFallbackText(csl) {
	return csl?.title || csl?.['container-title'] || '';
}

async function requestFormattedEntries(cslItems, styleKey) {
	if (typeof apiFetch !== 'function') {
		throw new Error('WordPress API fetch is unavailable.');
	}

	const data = await apiFetch({
		path: `/${FORMAT_ENDPOINT}`,
		method: 'POST',
		data: {
			style: styleKey,
			cslItems,
		},
	});

	if (!Array.isArray(data?.entries)) {
		throw new Error('Formatter response did not include entries.');
	}

	return data.entries.map((entry) => String(entry?.text || ''));
}

/**
 * Clear the citation formatting cache.
 *
 * @since 0.1.0
 */
export function clearFormattingCache() {
	BIBLIOGRAPHY_CACHE.clear();
}

/**
 * Format multiple CSL-JSON items as bibliography entries.
 *
 * @param {Array}  cslItems Array of CSL-JSON objects.
 * @param {string} styleKey Citation style key.
 * @param {Object} options  Formatting options.
 * @return {string[]} Array of formatted bibliography strings.
 *
 * @since 0.1.0
 */
export async function formatBibliographyEntries(
	cslItems,
	styleKey,
	options = {}
) {
	if (!Array.isArray(cslItems) || !cslItems.length) {
		return [];
	}

	const cacheKey = getBibliographyCacheKey(
		cslItems,
		styleKey,
		options.locale || ''
	);
	const cachedEntries = getCachedBibliography(cacheKey);

	if (cachedEntries !== undefined) {
		return cachedEntries;
	}

	let formattedTexts;

	try {
		formattedTexts = await requestFormattedEntries(cslItems, styleKey);
	} catch (error) {
		emitFormattingWarning(
			`Falling back to raw citation text for style "${styleKey}".`,
			error
		);
		options.onFallback?.(error);
		formattedTexts = cslItems.map((csl) => getFallbackText(csl));
	}

	const normalizedEntries = cslItems.map(
		(_, index) => formattedTexts[index] || ''
	);

	return setCachedBibliography(cacheKey, normalizedEntries);
}

/**
 * Format a single CSL-JSON item as a bibliography entry.
 *
 * @param {Object} csl      CSL-JSON object.
 * @param {string} styleKey Citation style key.
 * @param {Object} options  Formatting options.
 * @return {string} Formatted bibliography string.
 *
 * @since 0.1.0
 */
export async function formatBibliographyEntry(csl, styleKey, options = {}) {
	const results = await formatBibliographyEntries([csl], styleKey, options);
	return results[0];
}

function stableStringify(value) {
	return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value) {
	if (Array.isArray(value)) {
		return value.map(sortObjectKeys);
	}

	if (value && typeof value === 'object') {
		return Object.keys(value)
			.sort()
			.reduce((accumulator, key) => {
				accumulator[key] = sortObjectKeys(value[key]);
				return accumulator;
			}, {});
	}

	return value;
}
