export const KNOWN_CSL_TYPES = new Set([
	'article',
	'article-journal',
	'article-magazine',
	'article-newspaper',
	'bill',
	'book',
	'broadcast',
	'chapter',
	'classic',
	'collection',
	'dataset',
	'document',
	'entry',
	'entry-dictionary',
	'entry-encyclopedia',
	'event',
	'figure',
	'graphic',
	'hearing',
	'interview',
	'legal_case',
	'legislation',
	'magazine',
	'manuscript',
	'map',
	'motion_picture',
	'musical_score',
	'performance',
	'pamphlet',
	'paper-conference',
	'patent',
	'periodical',
	'post',
	'post-weblog',
	'personal_communication',
	'regulation',
	'report',
	'review',
	'review-book',
	'software',
	'song',
	'speech',
	'standard',
	'thesis',
	'treaty',
	'webpage',
]);
const STRING_FIELDS = new Set([
	'title',
	'container-title',
	'publisher',
	'page',
	'number',
	'volume',
	'issue',
	'DOI',
	'URL',
	'language',
	'edition',
	'medium',
	'genre',
	'publisher-place',
	'event-place',
	'reviewed-title',
]);
const STRING_OR_STRING_ARRAY_FIELDS = new Set(['ISBN', 'ISSN']);
const NAME_LIST_FIELDS = new Set(['author', 'editor', 'reviewed-author']);

function isPlainObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function sanitizeScalar(value) {
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value;
	}

	return undefined;
}

function sanitizeCslValue(value, depth = 0) {
	if (depth > 10) {
		return undefined;
	}

	if (Array.isArray(value)) {
		return value
			.map((item) => sanitizeCslValue(item, depth + 1))
			.filter((item) => item !== undefined);
	}

	if (isPlainObject(value)) {
		return Object.entries(value).reduce(
			(accumulator, [key, nestedValue]) => {
				if (['__proto__', 'constructor', 'prototype'].includes(key)) {
					return accumulator;
				}

				const sanitizedValue = sanitizeCslValue(nestedValue, depth + 1);

				if (sanitizedValue !== undefined) {
					accumulator[key] = sanitizedValue;
				}

				return accumulator;
			},
			{}
		);
	}

	return sanitizeScalar(value);
}

function sanitizeAuthor(author) {
	if (!isPlainObject(author)) {
		throw new Error('Invalid CSL author entry.');
	}

	const sanitizedAuthor = sanitizeCslValue(author);

	for (const key of ['family', 'given', 'literal', 'ORCID']) {
		if (
			Object.prototype.hasOwnProperty.call(sanitizedAuthor, key) &&
			typeof sanitizedAuthor[key] !== 'string'
		) {
			throw new Error(`Invalid CSL author field: ${key}.`);
		}
	}

	return sanitizedAuthor;
}

function sanitizeNameList(names, field) {
	if (!Array.isArray(names)) {
		throw new Error(`Invalid CSL ${field} list.`);
	}

	return names.map(sanitizeAuthor);
}

function normalizeDatePart(part) {
	if (typeof part === 'number' && Number.isInteger(part)) {
		return part;
	}

	if (typeof part === 'string' && /^\d+$/.test(part)) {
		return Number(part);
	}

	return undefined;
}

function sanitizeIssued(issued) {
	if (!isPlainObject(issued)) {
		throw new Error('Invalid CSL issued value.');
	}

	const sanitizedIssued = sanitizeCslValue(issued);
	let hasValidDate = false;

	if (Object.prototype.hasOwnProperty.call(sanitizedIssued, 'date-parts')) {
		if (
			!Array.isArray(sanitizedIssued['date-parts']) ||
			!sanitizedIssued['date-parts'].length
		) {
			throw new Error('Invalid CSL issued date-parts.');
		}

		const dateParts = sanitizedIssued['date-parts']
			.map((datePart) => {
				if (!Array.isArray(datePart)) {
					return null;
				}

				const normalizedDatePart = datePart
					.map(normalizeDatePart)
					.filter((part) => part !== undefined);

				return normalizedDatePart.length ? normalizedDatePart : null;
			})
			.filter(Boolean);

		if (!dateParts.length) {
			throw new Error('Invalid CSL issued date-parts.');
		}

		sanitizedIssued['date-parts'] = dateParts;
		hasValidDate = true;
	}

	for (const field of ['literal', 'raw']) {
		if (!Object.prototype.hasOwnProperty.call(sanitizedIssued, field)) {
			continue;
		}

		if (typeof sanitizedIssued[field] !== 'string') {
			throw new Error('Invalid CSL issued value.');
		}

		sanitizedIssued[field] = stripHtmlTags(sanitizedIssued[field]);
		hasValidDate = true;
	}

	if (!hasValidDate) {
		throw new Error('Invalid CSL issued date-parts.');
	}

	return sanitizedIssued;
}

export function stripHtmlTags(text) {
	let result = text;
	let previous;
	do {
		previous = result;
		result = result.replace(/<[^>]*>/gu, '');
	} while (result !== previous);
	return result;
}

function sanitizeStringField(value, field) {
	if (typeof value === 'number' && field !== 'title') {
		return String(value);
	}

	if (typeof value !== 'string') {
		throw new Error(`Invalid CSL ${field}.`);
	}

	return stripHtmlTags(value);
}

function sanitizeStringOrStringArrayField(value, field) {
	if (typeof value === 'string') {
		return stripHtmlTags(value);
	}

	if (
		Array.isArray(value) &&
		value.every((item) => typeof item === 'string')
	) {
		return value.map(stripHtmlTags);
	}

	throw new Error(`Invalid CSL ${field}.`);
}

/**
 * Validate and sanitize a CSL-JSON object for safe storage and rendering.
 *
 * @param {Object} csl CSL-JSON object.
 * @return {Object} Sanitized CSL-JSON object.
 * @throws {Error} If the CSL object is invalid.
 *
 * @since 0.1.0
 */
export function validateAndSanitizeCsl(csl) {
	if (!isPlainObject(csl)) {
		throw new Error('Invalid CSL object.');
	}

	const sanitizedCsl = sanitizeCslValue(csl);

	if (!KNOWN_CSL_TYPES.has(sanitizedCsl.type)) {
		throw new Error('Invalid CSL type.');
	}

	for (const field of NAME_LIST_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(sanitizedCsl, field)) {
			sanitizedCsl[field] = sanitizeNameList(sanitizedCsl[field], field);
		}
	}

	if (Object.prototype.hasOwnProperty.call(sanitizedCsl, 'issued')) {
		sanitizedCsl.issued = sanitizeIssued(sanitizedCsl.issued);
	}

	if (Object.prototype.hasOwnProperty.call(sanitizedCsl, 'accessed')) {
		sanitizedCsl.accessed = sanitizeIssued(sanitizedCsl.accessed);
	}

	for (const field of STRING_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(sanitizedCsl, field)) {
			sanitizedCsl[field] = sanitizeStringField(
				sanitizedCsl[field],
				field
			);
		}
	}

	for (const field of STRING_OR_STRING_ARRAY_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(sanitizedCsl, field)) {
			sanitizedCsl[field] = sanitizeStringOrStringArrayField(
				sanitizedCsl[field],
				field
			);
		}
	}

	return sanitizedCsl;
}
