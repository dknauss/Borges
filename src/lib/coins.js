/**
 * CSL-JSON to COinS (Context Objects in Spans) OpenURL string builder.
 */

import { getPrimaryIdentifierValue } from './csl-utils';

/**
 * Build a COinS title attribute string from a CSL-JSON object.
 *
 * @param {Object} csl CSL-JSON object.
 * @return {string} URL-encoded OpenURL key-value string.
 *
 * @since 0.1.0
 */
export function buildCoins(csl) {
	const params = ['ctx_ver=Z39.88-2004'];
	const type = csl.type || '';

	if (type === 'book' || type === 'chapter') {
		params.push(
			'rft_val_fmt=' + encodeURIComponent('info:ofi/fmt:kev:mtx:book')
		);

		if (type === 'chapter') {
			addParam(params, 'rft.btitle', csl['container-title']);
			addParam(params, 'rft.atitle', csl.title);
		} else {
			addParam(params, 'rft.btitle', csl.title);
		}

		addParam(params, 'rft.pub', csl.publisher);
		addParam(params, 'rft.place', csl['publisher-place']);
		addParam(params, 'rft.isbn', getPrimaryIdentifierValue(csl.ISBN));
	} else if (type === 'thesis') {
		params.push(
			'rft_val_fmt=' +
				encodeURIComponent('info:ofi/fmt:kev:mtx:dissertation')
		);
		addParam(params, 'rft.title', csl.title);
		addParam(params, 'rft.inst', csl.publisher);
		addParam(params, 'rft.degree', csl.genre);
	} else {
		// Default to journal article format for remaining types.
		const pageBounds = getPageBounds(csl.page);

		params.push(
			'rft_val_fmt=' + encodeURIComponent('info:ofi/fmt:kev:mtx:journal')
		);
		addParam(params, 'rft.atitle', csl.title);
		addParam(params, 'rft.jtitle', csl['container-title']);
		addParam(params, 'rft.volume', csl.volume);
		addParam(params, 'rft.issue', csl.issue);
		addParam(params, 'rft.spage', pageBounds?.start);
		addParam(params, 'rft.epage', pageBounds?.end);
	}

	// Author.
	if (csl.author && csl.author.length) {
		const first = csl.author[0];
		addParam(params, 'rft.aulast', first.family || first.literal);
		addParam(params, 'rft.aufirst', first.given);
	}

	// Date.
	if (csl.issued && csl.issued['date-parts'] && csl.issued['date-parts'][0]) {
		const parts = csl.issued['date-parts'][0];
		addParam(
			params,
			'rft.date',
			parts
				.map((part, index) =>
					index === 0 ? String(part) : String(part).padStart(2, '0')
				)
				.join('-')
		);
	}

	// DOI as identifier.
	if (csl.DOI) {
		addParam(params, 'rft_id', 'info:doi/' + csl.DOI);
	}

	return params.join('&');
}

/**
 * Add a parameter to the params array if the value is defined and non-empty.
 *
 * @param {Array}   params Array to push to.
 * @param {string}  key    Parameter key.
 * @param {unknown} value  Parameter value.
 */
function addParam(params, key, value) {
	if (value !== undefined && value !== null && value !== '') {
		params.push(key + '=' + encodeURIComponent(String(value)));
	}
}

function getPageBounds(pageValue) {
	if (!pageValue) {
		return null;
	}

	const [start, end] = String(pageValue)
		.split(/\s*[-–—]\s*/u)
		.filter(Boolean);

	return {
		start,
		end,
	};
}
