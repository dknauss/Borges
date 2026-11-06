/**
 * "Cite": a rich-text format that links text to a bibliography entry.
 *
 * Works in any rich text (paragraphs, headings, list items, quotes), so a
 * theme's margin-note paragraph style can hold one too. The saved markup is a
 * plain fragment link, which needs no script on the page:
 *
 *     <a class="bibliography-builder-citation h-cite"
 *        href="#ref-{id}" data-bibliography-ref="{id}">…</a>
 *
 * `#ref-{id}` is the `<li>` ID save() writes for the entry. The text is
 * ordinary post content; the short form inserted here is only a starting
 * point (src/lib/citation-short-form.js).
 */

import { __, sprintf } from '@wordpress/i18n';
import { useMemo, useState } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import {
	RichTextToolbarButton,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import {
	applyFormat,
	concat,
	create,
	insert,
	registerFormatType,
	removeFormat,
	useAnchor,
} from '@wordpress/rich-text';
import {
	Button,
	CheckboxControl,
	Popover,
	SearchControl,
	TextControl,
} from '@wordpress/components';

import {
	collectCitableBibliographies,
	filterCitableBibliographies,
	findCitableEntry,
	getEntryHref,
} from '../lib/citation-entries';
import {
	getShortFormSegments,
	getShortFormText,
} from '../lib/citation-short-form';

export const CITATION_FORMAT_NAME = 'bibliography-builder/citation';
export const CITATION_CLASS_NAME = 'bibliography-builder-citation';

// The microformat class rides along as an extra class; the format is matched
// by CITATION_CLASS_NAME alone.
const MICROFORMAT_CLASS = 'h-cite';

// What useAnchor() needs to find an active citation's element.
const ANCHOR_SETTINGS = {
	tagName: 'a',
	className: CITATION_CLASS_NAME,
};

/**
 * The format object for one entry.
 *
 * @param {string} id Citation ID.
 * @return {Object} Rich-text format.
 */
export function getCitationFormat( id ) {
	return {
		type: CITATION_FORMAT_NAME,
		attributes: {
			href: getEntryHref( id ),
			ref: id,
		},
		// Written first, as it is when saved markup is read back, so the
		// attribute order does not change when a post is saved again.
		unregisteredAttributes: {
			class: MICROFORMAT_CLASS,
		},
	};
}

/**
 * The extent of the citation at or around the selection.
 *
 * @param {Object} value Rich-text value.
 * @return {{start: number, end: number}|null} Range, or null when the
 *     selection is not in a citation.
 */
export function getCitationRange( value ) {
	const { formats = [], start = 0, end = 0 } = value;
	const has = ( index ) =>
		Array.isArray( formats[ index ] ) &&
		formats[ index ].some(
			( format ) => format.type === CITATION_FORMAT_NAME
		);
	let from = start;
	let to = end;

	if ( start === end ) {
		if ( has( start ) ) {
			to = start + 1;
		} else if ( start > 0 && has( start - 1 ) ) {
			from = start - 1;
		} else {
			return null;
		}
	}

	while ( from > 0 && has( from - 1 ) ) {
		from -= 1;
	}

	while ( to < formats.length && has( to ) ) {
		to += 1;
	}

	return { start: from, end: to };
}

/**
 * The short form as a rich-text value, italics included, linked to the entry.
 *
 * @param {Object} entry   Citable entry.
 * @param {string} locator Locator.
 * @return {Object} Rich-text value.
 */
function buildCitationValue( entry, locator ) {
	let value = create();

	for ( const segment of getShortFormSegments( entry.csl, entry.styleKey, {
		locator,
		number: entry.number,
	} ) ) {
		let part = create( { text: segment.text } );

		if ( segment.italic ) {
			part = applyFormat(
				part,
				{ type: 'core/italic' },
				0,
				segment.text.length
			);
		}

		value = concat( value, part );
	}

	return applyFormat(
		value,
		getCitationFormat( entry.id ),
		0,
		value.text.length
	);
}

/**
 * Apply a citation to a rich-text value.
 *
 * @param {Object}  value                 Rich-text value.
 * @param {Object}  entry                 Citable entry.
 * @param {Object}  options               Options.
 * @param {string}  [options.locator]     Locator.
 * @param {boolean} [options.replaceText] Replace the text with the short form.
 * @param {Object}  [options.range]       Range to cite (an existing citation's
 *                                        extent); defaults to the selection.
 * @return {Object} New value.
 */
export function applyCitation(
	value,
	entry,
	{ locator = '', replaceText = false, range = null } = {}
) {
	const { start, end } = range || { start: value.start, end: value.end };
	const hasText = end > start;

	if ( hasText && ! replaceText ) {
		return applyFormat( value, getCitationFormat( entry.id ), start, end );
	}

	const next = insert(
		value,
		buildCitationValue( entry, locator ),
		start,
		end
	);

	// Typing after the citation should not extend the link.
	next.start = next.end;
	next.activeFormats = [];

	return next;
}

/**
 * Remove the citation at the selection, keeping its text.
 *
 * @param {Object} value Rich-text value.
 * @return {Object} New value.
 */
export function removeCitation( value ) {
	const range = getCitationRange( value );

	return range
		? removeFormat( value, CITATION_FORMAT_NAME, range.start, range.end )
		: value;
}

/**
 * One entry as a line in the picker.
 *
 * @param {Object} entry  Citable entry.
 * @param {string} family Style family.
 * @return {string} Label.
 */
function getEntryLabel( entry, family ) {
	const parts = [
		family === 'numeric' ? `[${ entry.number }]` : '',
		entry.author,
		entry.year,
	].filter( Boolean );
	const lead = parts.join( ' ' );
	const title =
		entry.title || __( 'Untitled', 'borges-bibliography-builder' );

	// "n.d." already ends with a period.
	return lead ? `${ lead.replace( /\.$/, '' ) }. ${ title }` : title;
}

function CitationPicker( {
	bibliographies,
	initialRef,
	hasText,
	isActive,
	onApply,
	onRemove,
} ) {
	const [ query, setQuery ] = useState( '' );
	const [ selectedId, setSelectedId ] = useState( initialRef || '' );
	const [ locator, setLocator ] = useState( '' );
	const [ replaceText, setReplaceText ] = useState( isActive );
	const shown = filterCitableBibliographies( bibliographies, query );
	const selected = findCitableEntry( bibliographies, selectedId );
	const willInsert = ! hasText || replaceText;
	const preview =
		selected && willInsert
			? getShortFormText( selected.csl, selected.styleKey, {
					locator,
					number: selected.number,
				} )
			: '';

	if ( ! bibliographies.length ) {
		return (
			<div className="bibliography-builder-citation-picker">
				<p>
					{ __(
						'Add a Bibliography block with at least one entry to this post, then cite its entries here.',
						'borges-bibliography-builder'
					) }
				</p>
			</div>
		);
	}

	return (
		<form
			className="bibliography-builder-citation-picker"
			onSubmit={ ( event ) => {
				event.preventDefault();

				if ( selected ) {
					onApply( selected, { locator, replaceText } );
				}
			} }
		>
			<SearchControl
				__nextHasNoMarginBottom
				label={ __(
					'Search bibliography entries',
					'borges-bibliography-builder'
				) }
				placeholder={ __(
					'Search by author, year, or title',
					'borges-bibliography-builder'
				) }
				value={ query }
				onChange={ setQuery }
			/>
			<div
				className="bibliography-builder-citation-picker__results"
				role="group"
				aria-label={ __(
					'Bibliography entries',
					'borges-bibliography-builder'
				) }
			>
				{ shown.length === 0 ? (
					<p className="bibliography-builder-citation-picker__empty">
						{ __(
							'No entries match.',
							'borges-bibliography-builder'
						) }
					</p>
				) : null }
				{ shown.map( ( bibliography ) => (
					<div
						key={ bibliography.clientId }
						className="bibliography-builder-citation-picker__group"
					>
						{ bibliographies.length > 1 ? (
							<p className="bibliography-builder-citation-picker__group-label">
								{ bibliography.label }
							</p>
						) : null }
						<ul>
							{ bibliography.entries.map( ( entry ) => (
								<li key={ entry.id }>
									<Button
										__next40pxDefaultSize
										className="bibliography-builder-citation-picker__entry"
										isPressed={ entry.id === selectedId }
										onClick={ () =>
											setSelectedId( entry.id )
										}
									>
										{ getEntryLabel(
											entry,
											bibliography.family
										) }
									</Button>
								</li>
							) ) }
						</ul>
					</div>
				) ) }
			</div>
			{ willInsert ? (
				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __(
						'Page or other locator (optional)',
						'borges-bibliography-builder'
					) }
					value={ locator }
					onChange={ setLocator }
				/>
			) : null }
			{ hasText ? (
				<CheckboxControl
					__nextHasNoMarginBottom
					label={ __(
						'Replace the text with a short citation',
						'borges-bibliography-builder'
					) }
					checked={ replaceText }
					onChange={ setReplaceText }
				/>
			) : null }
			<p
				className="bibliography-builder-citation-picker__preview"
				aria-live="polite"
			>
				{ preview
					? sprintf(
							/* translators: %s: the short citation that will be inserted. */
							__( 'Inserts: %s', 'borges-bibliography-builder' ),
							preview
						)
					: null }
			</p>
			<div className="bibliography-builder-citation-picker__actions">
				{ isActive ? (
					<Button
						__next40pxDefaultSize
						variant="tertiary"
						isDestructive
						onClick={ onRemove }
					>
						{ __(
							'Remove citation',
							'borges-bibliography-builder'
						) }
					</Button>
				) : null }
				<Button
					__next40pxDefaultSize
					variant="primary"
					type="submit"
					accessibleWhenDisabled
					disabled={ ! selected }
				>
					{ isActive
						? __( 'Update citation', 'borges-bibliography-builder' )
						: __(
								'Insert citation',
								'borges-bibliography-builder'
							) }
				</Button>
			</div>
		</form>
	);
}

function CitationEdit( {
	isActive,
	activeAttributes,
	value,
	onChange,
	onFocus,
	contentRef,
} ) {
	const [ isOpen, setIsOpen ] = useState( false );
	const blocks = useSelect(
		( select ) =>
			isOpen ? select( blockEditorStore ).getBlocks() : undefined,
		[ isOpen ]
	);
	const bibliographies = useMemo(
		() => ( blocks ? collectCitableBibliographies( blocks ) : [] ),
		[ blocks ]
	);
	const anchor = useAnchor( {
		editableContentElement: contentRef.current,
		value,
		settings: ANCHOR_SETTINGS,
	} );
	const range = isActive
		? getCitationRange( value )
		: { start: value.start, end: value.end };
	const hasText = Boolean( range ) && range.end > range.start;
	const close = () => {
		setIsOpen( false );
		onFocus();
	};

	return (
		<>
			<RichTextToolbarButton
				icon="book-alt"
				title={ __( 'Cite', 'borges-bibliography-builder' ) }
				onClick={ () => setIsOpen( true ) }
				isActive={ isActive }
			/>
			{ isOpen ? (
				<Popover
					anchor={ anchor }
					placement="bottom"
					focusOnMount="firstElement"
					onClose={ close }
					className="bibliography-builder-citation-popover"
				>
					<CitationPicker
						bibliographies={ bibliographies }
						initialRef={ isActive ? activeAttributes.ref : '' }
						hasText={ hasText }
						isActive={ isActive }
						onApply={ ( entry, options ) => {
							onChange(
								applyCitation( value, entry, {
									...options,
									range,
								} )
							);
							close();
						} }
						onRemove={ () => {
							onChange( removeCitation( value ) );
							close();
						} }
					/>
				</Popover>
			) : null }
		</>
	);
}

const citationSettings = {
	title: __( 'Citation', 'borges-bibliography-builder' ),
	tagName: 'a',
	className: CITATION_CLASS_NAME,
	attributes: {
		href: 'href',
		ref: 'data-bibliography-ref',
	},
	interactive: true,
	edit: CitationEdit,
};

export function registerCitationFormat() {
	return registerFormatType( CITATION_FORMAT_NAME, citationSettings );
}
