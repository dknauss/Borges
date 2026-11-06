/**
 * "Cite": a rich-text format that links text to a bibliography entry.
 *
 * Works in any rich text (paragraphs, headings, list items, quotes), so a
 * theme's margin-note paragraph style can hold one too. The saved markup is a
 * plain fragment link, which needs no script on the page:
 *
 *     <a class="bibliography-builder-citation h-cite"
 *        href="#ref-{id}" data-bibliography-ref="{id}"
 *        data-locator="{locator}">…</a>
 *
 * `#ref-{id}` is the `<li>` ID save() writes for the entry. `data-locator`
 * holds the page or other locator, when there is one, so the citation can be
 * rebuilt after a style change (src/lib/citation-update.js). The text is
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
	normalizeLocator,
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
 * @param {string} id        Citation ID.
 * @param {string} [locator] Locator; saved as `data-locator` when not empty.
 * @return {Object} Rich-text format.
 */
export function getCitationFormat( id, locator = '' ) {
	const cleanLocator = normalizeLocator( locator );

	return {
		type: CITATION_FORMAT_NAME,
		// In the order of the format's `attributes` setting, which is the
		// order saved markup is read back in.
		attributes: {
			href: getEntryHref( id ),
			ref: id,
			...( cleanLocator ? { locator: cleanLocator } : {} ),
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
 * A citation is a run of characters linked to the same entry, so italics
 * inside it do not split it, and two citations side by side stay apart: the
 * run grows only over characters that cite the same `ref` with the same
 * `locator`, so "[1][2]" and "[1, 12][1, 20]" are each two citations.
 *
 * @param {Object} value Rich-text value.
 * @param {string} [ref] The active citation's entry ID, when known. With a
 *                       caret between two citations, it picks the one the
 *                       toolbar shows as active.
 * @return {{start: number, end: number}|null} Range, or null when the
 *     selection is not in a citation.
 */
export function getCitationRange( value, ref ) {
	const { formats = [], start = 0, end = 0 } = value;
	const formatAt = ( index ) =>
		Array.isArray( formats[ index ] )
			? formats[ index ].find(
					( candidate ) => candidate.type === CITATION_FORMAT_NAME
				)
			: undefined;
	const refAt = ( index ) => {
		const format = formatAt( index );

		return format ? String( format.attributes?.ref ?? '' ) : null;
	};
	// What makes a citation itself: its entry and its locator.
	const keyAt = ( index ) => {
		const format = formatAt( index );

		return format
			? JSON.stringify( [
					String( format.attributes?.ref ?? '' ),
					String( format.attributes?.locator ?? '' ),
				] )
			: null;
	};
	const candidates =
		start === end ? [ start, start - 1 ] : [ start, end - 1 ];
	let anchor = -1;
	let anchorRef = null;

	for ( const index of candidates ) {
		const found = index >= 0 ? refAt( index ) : null;

		if ( found !== null && ( ref === undefined || found === ref ) ) {
			anchor = index;
			anchorRef = found;
			break;
		}
	}

	if ( anchorRef === null ) {
		return start === end ? null : { start, end };
	}

	const anchorKey = keyAt( anchor );
	const isSame = ( index ) => keyAt( index ) === anchorKey;
	let from = start === end ? anchor : start;
	let to = start === end ? anchor + 1 : end;

	while ( from > 0 && isSame( from - 1 ) ) {
		from -= 1;
	}

	while ( to < formats.length && isSame( to ) ) {
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
		getCitationFormat( entry.id, locator ),
		0,
		value.text.length
	);
}

/**
 * Core's link format, which a citation replaces over the text it cites.
 */
const LINK_FORMAT_NAME = 'core/link';

/**
 * Apply a citation to a rich-text value.
 *
 * @param {Object}  value                 Rich-text value.
 * @param {Object}  entry                 Citable entry.
 * @param {Object}  options               Options.
 * @param {string}  [options.locator]     Locator. Saved as `data-locator`,
 *                                        also when the selected text is kept.
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
		// A citation is a link, and links cannot nest: drop any ordinary
		// link over the cited text first, or the saved markup would hold an
		// `<a>` inside an `<a>`, which browsers split apart on reload.
		return applyFormat(
			removeFormat( value, LINK_FORMAT_NAME, start, end ),
			getCitationFormat( entry.id, locator ),
			start,
			end
		);
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
 * @param {string} [ref] The active citation's entry ID, when known.
 * @return {Object} New value.
 */
export function removeCitation( value, ref ) {
	const range = getCitationRange( value, ref );

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

export function CitationPicker( {
	bibliographies,
	initialRef,
	initialLocator = '',
	hasText,
	isActive,
	onApply,
	onRemove,
} ) {
	const [ query, setQuery ] = useState( '' );
	const [ selectedId, setSelectedId ] = useState( initialRef || '' );
	const [ locator, setLocator ] = useState( initialLocator );
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
					// The locator field shows only when the text is replaced;
					// otherwise keep the citation's saved locator, if any.
					onApply( selected, {
						locator: willInsert ? locator : initialLocator,
						replaceText,
					} );
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
						'Page, chapter or section (optional)',
						'borges-bibliography-builder'
					) }
					help={ __(
						'Added to the end of the citation as typed, e.g. 22, chap. 3, § 4.',
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
	const activeRef = isActive ? activeAttributes?.ref : undefined;
	const range = isActive
		? getCitationRange( value, activeRef )
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
						initialLocator={
							isActive ? activeAttributes.locator || '' : ''
						}
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
							onChange( removeCitation( value, activeRef ) );
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
	// `locator` is last, so a new data-locator follows the attributes that
	// were already there and older markup keeps its order when saved again.
	attributes: {
		href: 'href',
		ref: 'data-bibliography-ref',
		locator: 'data-locator',
	},
	interactive: true,
	edit: CitationEdit,
};

export function registerCitationFormat() {
	return registerFormatType( CITATION_FORMAT_NAME, citationSettings );
}
