export {
	DEFAULT_CITATION_STYLE,
	STYLE_DEFINITIONS,
	getDefaultHeadingText,
	getHeadingPlaceholder,
	getStyleDefinition,
	getListSemantics,
	getSelectableStyles,
} from './style-registry';

/**
 * An HTML tag: a name that starts with a letter, then anything but angle
 * brackets. "a < b" and "<3" are not tags. Mirrored in includes/save-markup.php.
 */
const INLINE_TAG_PATTERN = /<\/?([A-Za-z][A-Za-z0-9]*)\b[^<>]*>/g;
const ITALIC_TAGS = new Set(['i', 'em']);

/**
 * Split text that may carry inline HTML into plain text and italic ranges.
 *
 * Formatted text and titles are stored as plain text, but HTML can reach them
 * through the code editor, pasted block markup, the REST write routes, or a
 * reference source (CrossRef titles often carry `<i>` for taxon names). This
 * keeps `<i>` and `<em>` as italics and drops every other tag, so no tag is
 * ever shown as text.
 *
 * @param {string} text Text that may contain inline HTML.
 * @return {{text: string, ranges: Array<{start: number, end: number}>}} Plain
 *     text, and the italic ranges in it.
 *
 * @since 1.8.1
 */
export function parseInlineMarkup(text) {
	const value = String(text ?? '');
	const ranges = [];
	let plain = '';
	let cursor = 0;
	let depth = 0;
	let start = 0;

	for (const match of value.matchAll(INLINE_TAG_PATTERN)) {
		plain += value.slice(cursor, match.index);
		cursor = match.index + match[0].length;

		if (!ITALIC_TAGS.has(match[1].toLowerCase())) {
			continue;
		}

		if (match[0][1] === '/') {
			if (depth > 0) {
				depth -= 1;

				if (depth === 0 && plain.length > start) {
					ranges.push({ start, end: plain.length });
				}
			}
		} else if (!match[0].endsWith('/>')) {
			if (depth === 0) {
				start = plain.length;
			}

			depth += 1;
		}
	}

	plain += value.slice(cursor);

	// An unclosed <i> runs to the end, as it would in a browser.
	if (depth > 0 && plain.length > start) {
		ranges.push({ start, end: plain.length });
	}

	return { text: plain, ranges };
}

/**
 * Text with any inline HTML tags removed.
 *
 * @param {string} text Text that may contain inline HTML.
 * @return {string} Plain text.
 *
 * @since 1.8.1
 */
export function stripInlineMarkup(text) {
	return parseInlineMarkup(text).text;
}

/**
 * Display text as plain text: what a reader sees, without markup.
 *
 * @param {Object} citation Citation object.
 * @return {string} Plain display text.
 *
 * @since 1.8.1
 */
export function getPlainDisplayText(citation) {
	return stripInlineMarkup(getDisplayText(citation));
}

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

/**
 * Schemes that may appear in a generated `href`.
 *
 * Linked text is baked into `post_content` as static HTML, and React does not
 * sanitize href schemes — a `javascript:` href would execute for every reader.
 * URL_PATTERN happens to require a literal `http(s)://` prefix, so today no
 * other scheme can reach here, but that makes the safety an accident of the
 * regex rather than a rule. State it explicitly, so broadening URL_PATTERN
 * later (to catch bare `www.`, `doi:`, or protocol-relative `//`) cannot
 * silently turn this into a scheme-injection sink.
 */
const ALLOWED_LINK_SCHEMES = ['http:', 'https:'];

/**
 * Whether a candidate URL may be emitted as a link.
 *
 * @param {string} candidate Detected URL text.
 * @return {boolean} True when the scheme is allowed.
 */
function isLinkableUrl(candidate) {
	try {
		return ALLOWED_LINK_SCHEMES.includes(new URL(candidate).protocol);
	} catch {
		return false;
	}
}

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

		if (!isLinkableUrl(href)) {
			// Emit as plain text rather than dropping it: the reader still sees
			// what the citation says, but it never becomes a clickable href.
			parts.push({
				text: matchedUrl,
				link: false,
			});
			cursor = start + matchedUrl.length;
			continue;
		}

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
 * With `inlineMarkup`, `<i>`/`<em>` in the display text become italic and
 * other tags are dropped (see parseInlineMarkup()), and titles are matched
 * without their tags. Without it, text is used as stored: the shape save()
 * had before 1.8.1, which the deprecations reproduce.
 *
 * @param {Object}  citation               Citation object.
 * @param {Object}  [options]              Options.
 * @param {boolean} [options.inlineMarkup] Read inline HTML in the text.
 * @return {DisplaySegment[]} Array of text segments with italic flags.
 *
 * @since 0.1.0
 */
export function getDisplaySegments(citation, { inlineMarkup = false } = {}) {
	const rawText = getDisplayText(citation);
	const { text: displayText, ranges: markupRanges } = inlineMarkup
		? parseInlineMarkup(rawText)
		: { text: rawText, ranges: [] };

	if (!displayText || citation.displayOverride) {
		return markupRanges.length
			? buildSegments(displayText, markupRanges)
			: [{ text: displayText || '', italic: false }];
	}

	const titleRanges = [];

	for (const value of getItalicizedFields(citation)) {
		addRange(
			titleRanges,
			displayText,
			inlineMarkup && value ? stripInlineMarkup(value) : value
		);
	}

	const italicRanges = mergeRanges([...titleRanges, ...markupRanges]);

	if (!italicRanges.length) {
		return [{ text: displayText, italic: false }];
	}

	return buildSegments(displayText, italicRanges);
}

/**
 * Sort ranges and join the ones that overlap. Ranges that only touch stay
 * apart, so title matches render exactly as they did before inline markup.
 *
 * @param {Array<{start: number, end: number}>} ranges Ranges.
 * @return {Array<{start: number, end: number}>} Sorted, non-overlapping ranges.
 */
function mergeRanges(ranges) {
	const merged = [];

	for (const range of [...ranges].sort(
		(left, right) => left.start - right.start
	)) {
		const last = merged[merged.length - 1];

		if (last && range.start < last.end) {
			last.end = Math.max(last.end, range.end);
		} else {
			merged.push({ ...range });
		}
	}

	return merged;
}

/**
 * @param {string}                              displayText  Plain display text.
 * @param {Array<{start: number, end: number}>} italicRanges Sorted ranges.
 * @return {DisplaySegment[]} Segments.
 */
function buildSegments(displayText, italicRanges) {
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
