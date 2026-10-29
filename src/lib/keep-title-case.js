/**
 * The per-entry flag that keeps a title's capitalization as entered.
 *
 * APA 7, Vancouver, and IEEE print titles in sentence case, which the PHP
 * formatter derives from the stored title (includes/sentence-case.php). The
 * conversion cannot tell every proper noun from an ordinary word, so an entry
 * can opt out: the editor's "Keep title capitalization as entered" checkbox
 * sets this flag in the CSL `custom` object, which CSL-JSON reserves for
 * application data.
 */

/**
 * The CSL `custom` key that keeps an entry's title as entered, where APA,
 * Vancouver, and IEEE would print it in sentence case. Mirrored by
 * BIBLIOGRAPHY_BUILDER_KEEP_TITLE_CASE_KEY in includes/sentence-case.php.
 */
export const KEEP_TITLE_CASE_KEY = 'borges-keep-title-case';

/**
 * Whether an entry asks to keep its title capitalization as entered.
 *
 * @param {Object} csl CSL-JSON object.
 * @return {boolean} Whether `custom` sets the keep-title-case flag.
 */
export function keepsTitleCase( csl ) {
	return Boolean( csl?.custom?.[ KEEP_TITLE_CASE_KEY ] );
}

/**
 * Set or clear the keep-title-case flag, keeping any other `custom` data.
 *
 * @param {Object}  csl  CSL-JSON object.
 * @param {boolean} keep Whether to keep the title as entered.
 * @return {Object} A copy of the object with the flag set or cleared.
 */
export function setKeepTitleCase( csl, keep ) {
	const { custom, ...rest } = csl;
	const nextCustom = {
		...( custom && typeof custom === 'object' ? custom : {} ),
	};

	if ( keep ) {
		nextCustom[ KEEP_TITLE_CASE_KEY ] = true;
	} else {
		delete nextCustom[ KEEP_TITLE_CASE_KEY ];
	}

	return Object.keys( nextCustom ).length
		? { ...rest, custom: nextCustom }
		: rest;
}
