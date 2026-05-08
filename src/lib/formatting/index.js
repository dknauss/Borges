export {
	DEFAULT_CITATION_STYLE,
	STYLE_DEFINITIONS,
	getDefaultHeadingText,
	getHeadingPlaceholder,
	getStyleDefinition,
	getListSemantics,
	getSelectableStyles,
} from './style-registry';

export function getAutoFormattedText(citation) {
	return citation.formattedText || citation.csl.title || '';
}

/**
 * Get the display text for a citation, preferring displayOverride if set.
 *
 * @param {Object} citation Citation object.
 * @return {string} Display text for the citation.
 *
 * @since 0.1.0
 */
export function getDisplayText(citation) {
	return citation.displayOverride || getAutoFormattedText(citation);
}

const URL_PATTERN = /https?:\/\/\S+/gu;

function splitTrailingUrlPunctuation(url) {
	let href = url;
	let trailing = '';

	while (href.length) {
		const lastCharacter = href[href.length - 1];

		if (/[.,;:!?]/u.test(lastCharacter)) {
			trailing = lastCharacter + trailing;
			href = href.slice(0, -1);
			continue;
		}

		if (lastCharacter === ')') {
			const openingCount = (href.match(/\(/gu) || []).length;
			const closingCount = (href.match(/\)/gu) || []).length;

			if (closingCount > openingCount) {
				trailing = lastCharacter + trailing;
				href = href.slice(0, -1);
				continue;
			}
		}

		break;
	}

	return { href, trailing };
}

/**
 * Split text into segments with URL detection for linking.
 *
 * @param {string} text                Text to parse.
 * @param {Object} [options]           Options.
 * @param {string} [options.linkLabel] Accessible label for link segments.
 * @return {Array<{text: string, href?: string, link: boolean, label?: string}>} Segments.
 *
 * @since 0.1.0
 */
export function splitTextIntoLinkParts(text, options = {}) {
	if (!text) {
		return [{ text: '', link: false }];
	}

	const { linkLabel } = options;
	const parts = [];
	let cursor = 0;

	for (const match of text.matchAll(URL_PATTERN)) {
		const matchedUrl = match[0];
		const start = match.index;

		if (start > cursor) {
			parts.push({
				text: text.slice(cursor, start),
				link: false,
			});
		}

		const { href, trailing } = splitTrailingUrlPunctuation(matchedUrl);

		parts.push({
			text: href,
			href,
			link: true,
			...(linkLabel !== undefined ? { label: linkLabel } : {}),
		});

		if (trailing) {
			parts.push({
				text: trailing,
				link: false,
			});
		}

		cursor = start + matchedUrl.length;
	}

	if (cursor < text.length) {
		parts.push({
			text: text.slice(cursor),
			link: false,
		});
	}

	return parts;
}

function isOpeningQuote(character) {
	return character === '"' || character === '“';
}

function isClosingQuote(character) {
	return character === '"' || character === '”';
}

function isQuotedAt(text, start, end) {
	const before = text[start - 1];
	const after = text[end];
	return isOpeningQuote(before) && isClosingQuote(after);
}

function findLastRange(text, value, ranges) {
	let start = text.lastIndexOf(value);

	while (start !== -1) {
		const end = start + value.length;

		if (
			!isQuotedAt(text, start, end) &&
			!ranges.some((range) => start < range.end && end > range.start)
		) {
			return { start, end };
		}

		start = text.lastIndexOf(value, start - 1);
	}

	return null;
}

function addRange(ranges, text, value) {
	if (!value) {
		return;
	}

	const range = findLastRange(text, value, ranges);

	if (!range) {
		return;
	}

	ranges.push(range);
}

function getItalicizedFields(citation) {
	const type = citation.csl.type;

	if (
		[
			'book',
			'broadcast',
			'collection',
			'dataset',
			'entry-dictionary',
			'entry-encyclopedia',
			'graphic',
			'interview',
			'legal_case',
			'legislation',
			'manuscript',
			'map',
			'motion_picture',
			'musical_score',
			'pamphlet',
			'patent',
			'performance',
			'periodical',
			'regulation',
			'report',
			'software',
			'song',
			'speech',
			'standard',
			'thesis',
			'treaty',
			'webpage',
		].includes(type)
	) {
		return [citation.csl.title];
	}

	if (
		[
			'article-journal',
			'article-magazine',
			'article-newspaper',
			'chapter',
			'entry',
			'paper-conference',
			'post',
			'post-weblog',
			'review',
			'review-book',
		].includes(type)
	) {
		return [citation.csl['container-title']];
	}

	return [];
}

/**
 * @typedef {Object} DisplaySegment
 * @property {string}  text   The text content of the segment.
 * @property {boolean} italic Whether the segment should be italicized.
 */

/**
 * Get display segments for a citation with italic formatting.
 *
 * @param {Object} citation Citation object.
 * @return {DisplaySegment[]} Array of text segments with italic flags.
 *
 * @since 0.1.0
 */
export function getDisplaySegments(citation) {
	const displayText = getDisplayText(citation);

	if (!displayText || citation.displayOverride) {
		return [{ text: displayText || '', italic: false }];
	}

	const italicRanges = [];

	for (const value of getItalicizedFields(citation)) {
		addRange(italicRanges, displayText, value);
	}

	if (!italicRanges.length) {
		return [{ text: displayText, italic: false }];
	}

	italicRanges.sort((left, right) => left.start - right.start);

	const segments = [];
	let cursor = 0;

	for (const range of italicRanges) {
		if (range.start > cursor) {
			segments.push({
				text: displayText.slice(cursor, range.start),
				italic: false,
			});
		}

		segments.push({
			text: displayText.slice(range.start, range.end),
			italic: true,
		});
		cursor = range.end;
	}

	if (cursor < displayText.length) {
		segments.push({
			text: displayText.slice(cursor),
			italic: false,
		});
	}

	return segments;
}
