/**
 * Shared helpers for reading common CSL-JSON fields.
 */

/**
 * Return the first usable string from a scalar or array identifier field.
 *
 * CSL-JSON identifier fields such as ISBN and ISSN may be represented as a
 * string or an array of strings. Export and metadata builders should use one
 * primary string value and ignore empty/non-string array entries.
 *
 * @param {unknown} value CSL-JSON identifier field value.
 * @return {string} Primary identifier string, or an empty string.
 */
export function getPrimaryIdentifierValue( value ) {
	if ( Array.isArray( value ) ) {
		return value.find( ( item ) => typeof item === 'string' && item ) || '';
	}

	return typeof value === 'string' ? value : '';
}
