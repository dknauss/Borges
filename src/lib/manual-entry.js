import { validateAndSanitizeCsl } from './csl-sanitize';
import { createCitationId } from './citation-id';

export const MANUAL_ENTRY_TYPE_OPTIONS = [
	{
		label: 'Book',
		value: 'book',
	},
	{
		label: 'Journal article',
		value: 'article-journal',
	},
	{
		label: 'Chapter',
		value: 'chapter',
	},
	{
		label: 'Edited collection',
		value: 'collection',
	},
	{
		label: 'Thesis / dissertation',
		value: 'thesis',
	},
	{
		label: 'Webpage',
		value: 'webpage',
	},
];

export const DEFAULT_MANUAL_ENTRY_FIELDS = {
	type: '',
	authors: '',
	title: '',
	containerTitle: '',
	publisher: '',
	year: '',
	page: '',
	doi: '',
	url: '',
};

function normalizeFieldValue(value) {
	return typeof value === 'string' ? value.trim() : '';
}

export function normalizeDoiValue(value) {
	const normalized = normalizeFieldValue(value)
		.replace(/[).,;:\s]+$/u, '')
		.replace(/^(?:https?:\/\/)?doi:/iu, '');

	if (!normalized) {
		return '';
	}

	return /^10\.\d{4,}\/[^\s]+$/iu.test(normalized) ? normalized : null;
}

export function normalizeUrlValue(value) {
	const normalized = normalizeFieldValue(value).replace(/[).,;]+$/u, '');

	if (!normalized) {
		return '';
	}

	return /^https?:\/\/\S+$/iu.test(normalized) ? normalized : null;
}

export function validateIdentifierFields(fields) {
	if (
		normalizeFieldValue(fields.doi) &&
		normalizeDoiValue(fields.doi) === null
	) {
		return 'Enter a valid DOI before adding.';
	}

	if (
		normalizeFieldValue(fields.url) &&
		normalizeUrlValue(fields.url) === null
	) {
		return 'Enter a valid URL beginning with http:// or https:// before adding.';
	}

	return null;
}

function parseAuthorFieldEntry(value) {
	const normalized = value.trim().replace(/[.;]\s*$/u, '');

	if (!normalized) {
		return null;
	}

	if (normalized.includes(',')) {
		const [family, given] = normalized.split(/\s*,\s*/, 2);

		if (!family || !given) {
			return {
				literal: normalized,
			};
		}

		return {
			family: family.trim(),
			given: given.trim(),
		};
	}

	const parts = normalized.split(/\s+/u);

	if (parts.length === 1) {
		return {
			literal: normalized,
		};
	}

	return {
		given: parts.slice(0, -1).join(' '),
		family: parts.at(-1),
	};
}

function parseAuthorFieldList(value) {
	return value
		.split(/\s*;\s*/u)
		.map(parseAuthorFieldEntry)
		.filter(Boolean);
}

export function createEmptyManualEntryFields(preservedType = '') {
	return {
		...DEFAULT_MANUAL_ENTRY_FIELDS,
		type: preservedType,
	};
}

export function validateManualEntry(fields) {
	if (!normalizeFieldValue(fields.type)) {
		return 'Choose a publication type before adding.';
	}

	if (!normalizeFieldValue(fields.title)) {
		return 'Enter a title before adding.';
	}

	return validateIdentifierFields(fields);
}

export function buildManualCsl(fields) {
	const type = normalizeFieldValue(fields.type);
	const title = normalizeFieldValue(fields.title);
	const contributors = parseAuthorFieldList(
		normalizeFieldValue(fields.authors)
	);
	const csl = {
		type,
		title,
	};

	if (contributors.length > 0) {
		if (type === 'collection') {
			csl.editor = contributors;
		} else {
			csl.author = contributors;
		}
	}

	if (normalizeFieldValue(fields.containerTitle)) {
		csl['container-title'] = normalizeFieldValue(fields.containerTitle);
	}

	if (normalizeFieldValue(fields.publisher)) {
		csl.publisher = normalizeFieldValue(fields.publisher);
	}

	if (normalizeFieldValue(fields.page)) {
		csl.page = normalizeFieldValue(fields.page);
	}

	const normalizedDoi = normalizeDoiValue(fields.doi);
	if (normalizedDoi) {
		csl.DOI = normalizedDoi;
	}

	const normalizedUrl = normalizeUrlValue(fields.url);
	if (normalizedUrl) {
		csl.URL = normalizedUrl;
	}

	if (/^\d{4}$/u.test(normalizeFieldValue(fields.year))) {
		csl.issued = {
			'date-parts': [[Number(normalizeFieldValue(fields.year))]],
		};
	}

	return validateAndSanitizeCsl(csl);
}

export async function createManualCitationFromCsl(csl, styleKey, options = {}) {
	let formattedText = null;

	if (!options.deferFormatting) {
		const { formatBibliographyEntry } = await import('./formatting/csl');

		formattedText = await formatBibliographyEntry(csl, styleKey, {
			onFallback: options.onFormatFallback,
		});
	}

	return {
		id: createCitationId(),
		csl,
		formattedText,
		displayOverride: null,
		inputFormat: 'manual',
		parseWarnings: [],
	};
}

export async function createManualCitation(fields, styleKey, options = {}) {
	return createManualCitationFromCsl(
		buildManualCsl(fields),
		styleKey,
		options
	);
}
