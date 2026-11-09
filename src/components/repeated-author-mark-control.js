/**
 * Block sidebar control for the `repeatedAuthorMark` setting (since 1.20.0).
 *
 * Shown only for a style that has something to choose: MLA 9 and OSCOLA 5,
 * whose marks can be turned off, and Chicago and ABNT, which offer the older
 * mark their earlier editions used (`repeatedAuthorMarks` in
 * includes/styles.json). For every other style the names are always written
 * out, so the control is hidden and a value left over from another style is
 * ignored (`getRepeatedAuthorRule()`).
 */

import { __ } from '@wordpress/i18n';
import { SelectControl } from '@wordpress/components';

import styleData from '../../includes/styles.json';
import { getOptionalRepeatedAuthorMarks } from '../lib/repeated-authors';

/**
 * The control's options for a style, or an empty list when it has none.
 *
 * @param {string} styleKey Citation style.
 * @return {Array<{label: string, value: string}>} Options.
 */
export function getRepeatedAuthorMarkOptions( styleKey ) {
	const ownRule = styleData.styles[ styleKey ]?.repeatedAuthors || null;
	const marks = getOptionalRepeatedAuthorMarks( styleKey );

	if ( ownRule === null && marks.length === 0 ) {
		return [];
	}

	const labels = {
		dash: __(
			'3-em dash ——— (Chicago 17th edition)',
			'borges-bibliography-builder'
		),
		underscore: __(
			'Underscore line ______ (NBR 6023:2002)',
			'borges-bibliography-builder'
		),
	};
	let styleLabel = __(
		'Write the names out (current edition)',
		'borges-bibliography-builder'
	);

	if ( ownRule === 'allAuthors' ) {
		styleLabel = __(
			'Three hyphens --- (MLA 9)',
			'borges-bibliography-builder'
		);
	} else if ( ownRule === 'firstAuthor' ) {
		styleLabel = __(
			'Double em dash —— (OSCOLA 5)',
			'borges-bibliography-builder'
		);
	}

	return [
		{ label: styleLabel, value: 'style' },
		...marks.map( ( mark ) => ( { label: labels[ mark ], value: mark } ) ),
		// A style with its own mark can drop it; for the others, "style"
		// already writes the names out.
		...( ownRule === null
			? []
			: [
					{
						label: __(
							'Write the names out',
							'borges-bibliography-builder'
						),
						value: 'none',
					},
				] ),
	];
}

/**
 * Repeated-author mark selector.
 *
 * @param {Object}                  props               Props.
 * @param {string}                  props.citationStyle Citation style.
 * @param {string}                  props.value         The block's `repeatedAuthorMark`.
 * @param {(value: string) => void} props.onChange      Called with the new value.
 * @return {Element|null} Control, or null when the style has no choice.
 */
export function RepeatedAuthorMarkControl( {
	citationStyle,
	value,
	onChange,
} ) {
	const options = getRepeatedAuthorMarkOptions( citationStyle );

	if ( options.length === 0 ) {
		return null;
	}

	const selected = options.some( ( option ) => option.value === value )
		? value
		: 'style';

	return (
		<SelectControl
			label={ __( 'Repeated authors', 'borges-bibliography-builder' ) }
			value={ selected }
			options={ options }
			onChange={ onChange }
			help={ __(
				'How an entry by the same author or authors as the entry before it begins. Screen readers always hear the names, and copied text and exports keep them.',
				'borges-bibliography-builder'
			) }
		/>
	);
}
