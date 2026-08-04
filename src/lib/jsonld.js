/**
 * CSL-JSON to Schema.org JSON-LD mapper.
 */

import { getPrimaryIdentifierValue } from './csl-utils';

const TYPE_MAP = {
	'article-journal': 'ScholarlyArticle',
	book: 'Book',
	chapter: 'Chapter',
	thesis: 'Thesis',
	report: 'Report',
	'paper-conference': 'ScholarlyArticle',
	'review-book': 'Review',
	webpage: 'WebPage',
};

function isLikelyOrganizationAuthor(author) {
	return Boolean(author?.literal && !author.family && !author.given);
}

/**
 * Map a single CSL-JSON object to a Schema.org JSON-LD object.
 *
 * @param {Object} csl CSL-JSON object.
 * @return {Object} Schema.org typed object.
 *
 * @since 0.1.0
 */
export function cslToJsonLd(csl) {
	const schemaType = TYPE_MAP[csl.type] || 'CreativeWork';

	const result = {
		'@context': 'https://schema.org',
		'@type': schemaType,
		name: csl.title || '',
	};

	// Authors.
	if (csl.author && csl.author.length) {
		result.author = csl.author.map((a) => {
			if (isLikelyOrganizationAuthor(a)) {
				return {
					'@type': 'Organization',
					name: a.literal,
				};
			}

			const person = {
				'@type': 'Person',
				name:
					a.literal || [a.given, a.family].filter(Boolean).join(' '),
			};
			if (a.family) {
				person.familyName = a.family;
			}
			if (a.given) {
				person.givenName = a.given;
			}
			if (a.ORCID) {
				person.sameAs = a.ORCID.startsWith('http')
					? a.ORCID
					: 'https://orcid.org/' + a.ORCID;
			}
			return person;
		});
	}

	// Date.
	if (csl.issued && csl.issued['date-parts'] && csl.issued['date-parts'][0]) {
		const parts = csl.issued['date-parts'][0];
		result.datePublished = parts
			.map((part, index) =>
				index === 0 ? String(part) : String(part).padStart(2, '0')
			)
			.join('-');
	}

	// Publication context.
	if (csl['container-title']) {
		if (csl.type === 'article-journal') {
			result.isPartOf = {
				'@type': 'Periodical',
				name: csl['container-title'],
			};
			if (csl.ISSN) {
				result.isPartOf.issn = Array.isArray(csl.ISSN)
					? csl.ISSN[0]
					: csl.ISSN;
			}
		} else if (csl.type === 'chapter') {
			result.isPartOf = {
				'@type': 'Book',
				name: csl['container-title'],
			};
		} else if (csl.type === 'paper-conference') {
			result.isPartOf = {
				'@type': 'Event',
				name: csl['container-title'],
			};
		}
	}

	if (csl.publisher) {
		result.publisher = {
			'@type': 'Organization',
			name: csl.publisher,
		};
	}

	// Identifiers.
	if (csl.DOI) {
		result.identifier = {
			'@type': 'PropertyValue',
			propertyID: 'DOI',
			value: csl.DOI,
		};
		// Note: Uses https://doi.org/ for Schema.org JSON-LD compatibility.
		// COinS output (coins.js) uses info:doi/ per OpenURL convention.
		result.url = 'https://doi.org/' + encodeURIComponent(csl.DOI);
	}

	const isbn = getPrimaryIdentifierValue(csl.ISBN);
	if (isbn) {
		result.isbn = isbn;
	}

	if (csl.URL && !result.url) {
		result.url = csl.URL;
	}

	return result;
}

/**
 * Escape a JSON string for embedding inside a <script> element.
 *
 * Two separate concerns, both left unhandled by JSON.stringify:
 *
 * - `<` becomes `<`. The HTML parser ends a script element at the literal
 *   bytes `</script` regardless of JSON or JavaScript string context, so
 *   escaping every `<` is what prevents a breakout. Escaping the whole
 *   character rather than the `</script` sequence makes it case- and
 *   delimiter-agnostic for free.
 * - U+2028 and U+2029 become `\\u2028` / `\\u2029`. They are legal inside a JSON
 *   string, so this is not a security issue for `ld+json`, which is never
 *   executed — but they are line terminators to a JavaScript parser, and a
 *   downstream consumer that evals this block rather than parsing it would see
 *   a broken literal.
 *
 * Order matters: JSON.stringify runs first and doubles any backslashes, so the
 * escapes introduced here can never end up behind an odd backslash count.
 *
 * @param {string} json Serialized JSON.
 * @return {string} JSON safe to embed in a script element.
 */
function escapeForScriptContext(json) {
	return json
		.replace(/</g, '\\u003c')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

/**
 * Convert an array of CSL-JSON objects to a JSON-LD array and serialize.
 *
 * @param {Array} cslArray Array of CSL-JSON objects.
 * @return {string} Safe JSON string for embedding in a <script> tag.
 *
 * @since 0.1.0
 */
export function buildJsonLdString(cslArray) {
	const data = cslArray.map(cslToJsonLd);
	return escapeForScriptContext(JSON.stringify(data));
}

/**
 * Serialize a CSL-JSON array for the CSL-JSON script block.
 * Escapes </ sequences to prevent script tag breakout.
 *
 * @param {Array} cslArray Array of CSL-JSON objects.
 * @return {string} Safe JSON string.
 *
 * @since 0.1.0
 */
export function buildCslJsonString(cslArray) {
	return escapeForScriptContext(JSON.stringify(cslArray));
}
