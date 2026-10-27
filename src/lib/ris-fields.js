/**
 * RIS record normalization applied after citation-js parsing.
 *
 * `@citation-js/plugin-ris` follows the RIS specification's type tables, and
 * Zotero reads RIS the same way, so most tags need no help: `T2` on a
 * conference paper becomes `event-title` and `A2` on a book becomes
 * `collection-editor` in both. Two things still reach CSL in a shape Borges
 * cannot use, or not at all:
 *
 * - `Y2` on a web page (`ELEC`) is the access date in Zotero's and EndNote's
 *   exports, and Zotero imports it as one. citation-js maps `Y2` to `accessed`
 *   for most types but not `ELEC`, so the page imported without "Accessed".
 * - citation-js gives every record without an `ID` tag a random
 *   `temp_id_…` id, which would change the stored CSL on every paste.
 */

const RIS_TEMP_ID_PREFIX = 'temp_id_';
const RIS_LINE_REGEX = /^\s*([A-Z][A-Z0-9]) {2}-(?: (.*)|\s*)$/u;
const RIS_DATE_REGEX = /^(\d{4})(?:[/-](\d{1,2})?(?:[/-](\d{1,2})?)?)?/u;

/**
 * Collect the values of one tag from a raw RIS record.
 *
 * @param {string} record Raw RIS text, `TY` to `ER`.
 * @param {string} tag    Two-character RIS tag, such as `Y2`.
 * @return {string[]} Trimmed, non-empty values in record order.
 */
export function getRisTagValues(record, tag) {
	return record
		.split(/\r?\n/u)
		.map((line) => line.match(RIS_LINE_REGEX))
		.filter((match) => match && match[1] === tag && match[2]?.trim())
		.map((match) => match[2].trim());
}

/**
 * Read a RIS date (`YYYY/MM/DD/other`, with any part left empty) as CSL.
 *
 * ISO dates (`YYYY-MM-DD`) are accepted too, since some exporters write them.
 * A date in any other shape is ignored rather than guessed.
 *
 * @param {string} value Raw tag value, such as `2024/03/12/`.
 * @return {Object|undefined} CSL date with `date-parts`, or undefined.
 */
export function parseRisDate(value) {
	const match = value.trim().match(RIS_DATE_REGEX);

	if (!match) {
		return undefined;
	}

	const parts = [Number(match[1])];
	const month = Number(match[2]);
	const day = Number(match[3]);

	if (month >= 1 && month <= 12) {
		parts.push(month);

		if (day >= 1 && day <= 31) {
			parts.push(day);
		}
	}

	return { 'date-parts': [parts] };
}

/**
 * Repair the fields citation-js maps from RIS in a way Borges cannot use.
 *
 * @param {Object} csl    CSL item produced by citation-js from one record.
 * @param {string} record The raw RIS record it came from.
 * @return {Object} Normalized CSL item.
 *
 * @since 1.16.0
 */
export function normalizeRisCsl(csl, record) {
	const normalized = { ...csl };

	if (
		typeof normalized.id === 'string' &&
		normalized.id.startsWith(RIS_TEMP_ID_PREFIX)
	) {
		delete normalized.id;
	}

	if (normalized.type === 'webpage' && !normalized.accessed) {
		const [accessed] = getRisTagValues(record, 'Y2');
		const date = accessed ? parseRisDate(accessed) : undefined;

		if (date) {
			normalized.accessed = date;
		}
	}

	return normalized;
}
