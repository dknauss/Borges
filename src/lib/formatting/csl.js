import apiFetch from '@wordpress/api-fetch';

const BIBLIOGRAPHY_CACHE = new Map();
const MAX_FORMAT_CACHE_ENTRIES = 500;
const MAX_FORMAT_CACHE_BYTES = 256 * 1024;
const FORMAT_ENDPOINT = 'bibliography/v1/format';
let bibliographyCacheBytes = 0;

function emitFormattingWarning(...args) {
	// eslint-disable-next-line no-console
	console?.warn?.(...args);
}

function getBibliographyCacheKey(cslItems, styleKey, locale = '') {
	return [
		styleKey || '',
		locale || '',
		cslItems.length,
		hashStableValue({
			styleKey,
			locale,
			cslItems,
		}),
	].join('|');
}

function getCachedBibliography(cacheKey) {
	if (!BIBLIOGRAPHY_CACHE.has(cacheKey)) {
		return undefined;
	}

	const cacheEntry = BIBLIOGRAPHY_CACHE.get(cacheKey);

	// Refresh insertion order on access so Map behaves as a simple LRU cache.
	BIBLIOGRAPHY_CACHE.delete(cacheKey);
	BIBLIOGRAPHY_CACHE.set(cacheKey, cacheEntry);

	return [...cacheEntry.formattedEntries];
}

function setCachedBibliography(cacheKey, formattedEntries) {
	if (BIBLIOGRAPHY_CACHE.has(cacheKey)) {
		bibliographyCacheBytes -= BIBLIOGRAPHY_CACHE.get(cacheKey).bytes;
		BIBLIOGRAPHY_CACHE.delete(cacheKey);
	}

	const cacheEntry = {
		formattedEntries: [...formattedEntries],
		bytes: getApproximateCacheEntryBytes(cacheKey, formattedEntries),
	};

	while (
		BIBLIOGRAPHY_CACHE.size >= MAX_FORMAT_CACHE_ENTRIES ||
		(BIBLIOGRAPHY_CACHE.size > 0 &&
			bibliographyCacheBytes + cacheEntry.bytes > MAX_FORMAT_CACHE_BYTES)
	) {
		const leastRecentlyUsedCacheKey =
			BIBLIOGRAPHY_CACHE.keys().next().value;

		if (!leastRecentlyUsedCacheKey) {
			break;
		}

		bibliographyCacheBytes -= BIBLIOGRAPHY_CACHE.get(
			leastRecentlyUsedCacheKey
		).bytes;
		BIBLIOGRAPHY_CACHE.delete(leastRecentlyUsedCacheKey);
	}

	BIBLIOGRAPHY_CACHE.set(cacheKey, cacheEntry);
	bibliographyCacheBytes += cacheEntry.bytes;
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

	if (data.entries.length !== cslItems.length) {
		throw new Error(
			'Formatter response entry count did not match request.'
		);
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
	bibliographyCacheBytes = 0;
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
	let formatterSucceeded = false;

	try {
		formattedTexts = await requestFormattedEntries(cslItems, styleKey);
		formatterSucceeded = true;
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

	if (formatterSucceeded) {
		return setCachedBibliography(cacheKey, normalizedEntries);
	}

	return normalizedEntries;
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

function getApproximateCacheEntryBytes(cacheKey, formattedEntries) {
	return (
		cacheKey.length +
		formattedEntries.reduce(
			(total, entry) => total + String(entry || '').length,
			0
		)
	);
}

/* eslint-disable no-bitwise */
function updateHashState(state, chunk) {
	const stringValue = String(chunk);

	for (let index = 0; index < stringValue.length; index += 1) {
		const code = stringValue.charCodeAt(index);
		state.primary ^= code;
		state.primary = Math.imul(state.primary, 16777619) >>> 0;
		state.secondary = Math.imul(state.secondary ^ code, 2246822519) >>> 0;
	}
}
/* eslint-enable no-bitwise */

function hashStableInto(state, value) {
	if (Array.isArray(value)) {
		updateHashState(state, '[');
		updateHashState(state, value.length);
		for (const item of value) {
			hashStableInto(state, item);
			updateHashState(state, ',');
		}
		updateHashState(state, ']');
		return;
	}

	if (value && typeof value === 'object') {
		updateHashState(state, '{');
		const keys = Object.keys(value).sort();
		updateHashState(state, keys.length);
		for (const key of keys) {
			updateHashState(state, key.length);
			updateHashState(state, key);
			updateHashState(state, ':');
			hashStableInto(state, value[key]);
			updateHashState(state, ';');
		}
		updateHashState(state, '}');
		return;
	}

	updateHashState(state, typeof value);
	updateHashState(state, ':');
	updateHashState(state, value === undefined ? 'undefined' : value);
}

function hashStableValue(value) {
	const state = {
		primary: 2166136261,
		secondary: 374761393,
	};

	hashStableInto(state, value);

	return `${state.primary.toString(36)}${state.secondary.toString(36)}`;
}
