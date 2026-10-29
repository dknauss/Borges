import { useBlockProps } from '@wordpress/block-editor';
import { buildCoins } from './lib/coins';
import {
	getDisplaySegments,
	getDisplayText,
	getPlainDisplayText,
	stripInlineMarkup,
	getListSemantics,
	splitTextIntoLinkParts,
	getStyleDefinition,
} from './lib/formatting';
import {
	buildJsonLdString,
	buildJsonLdItemListString,
	buildCslJsonString,
} from './lib/jsonld';
import { cslToRisEntry, getCitationExportBasename } from './lib/export';
import { sortCitations } from './lib/sorter';
import {
	getGroupIndex,
	getGroupLabelTag,
	getStyleGroups,
	groupCitations,
} from './lib/bibliography-groups';
import {
	getRepeatedAuthorMark,
	getRepeatedAuthorPrefixes,
} from './lib/repeated-authors';
import {
	CITE_EXPORT_LABELS,
	getTranslatedCiteExportLabels,
	getTranslatedLinkFallbackLabel,
} from './lib/cite-export-labels';

/**
 * Labels the current save() writes: fixed English, identical in every editor
 * locale. The copied-state label is omitted (view.js supplies it), and a link
 * whose citation has no title or container title carries no aria-label, so its
 * accessible name is the visible URL.
 */
export const LOCALE_INDEPENDENT_SAVE_LABELS = Object.freeze( {
	...CITE_EXPORT_LABELS,
	copied: null,
	linkFallback: null,
} );

/**
 * Labels as save() wrote them before they were made locale-independent: every
 * one translated into the saving editor's locale. Deprecations reproduce this.
 *
 * @return {Object} Labels keyed as LOCALE_INDEPENDENT_SAVE_LABELS.
 */
export function getLocalizedSaveLabels() {
	return {
		...getTranslatedCiteExportLabels(),
		linkFallback: getTranslatedLinkFallbackLabel(),
	};
}

/**
 * The text "Copy citation" copies: the manual display text, else the
 * formatted text, with inline markup stripped when the block stores it.
 *
 * @param {Object}  citation     Citation record.
 * @param {boolean} inlineMarkup Whether display text may carry `<i>`/`<em>`.
 * @return {string} Plain citation text.
 */
function getCopyText( citation, inlineMarkup ) {
	const text = citation.displayOverride || citation.formattedText || '';

	return inlineMarkup ? stripInlineMarkup( text ) : text;
}

/**
 * Cite / Export data for one entry, as `data-` attributes on its `<li>`.
 *
 * The panel itself is not saved: view.js builds it from these on the page.
 * Email clients, feed readers, and other places that show post content
 * without the block's script and styles see only the bibliography, and
 * `data-` attributes survive the post-content HTML filter for every role.
 *
 * @param {Object}  citation     Citation record.
 * @param {boolean} inlineMarkup Whether display text may carry `<i>`/`<em>`.
 * @return {Object} Attributes, in serialized order.
 */
function getCiteExportData( citation, inlineMarkup ) {
	return {
		'data-cite-text': getCopyText( citation, inlineMarkup ),
		'data-cite-filename': getCitationExportBasename( citation.csl ),
		'data-cite-ris': cslToRisEntry( citation.csl ),
		'data-cite-csl-json': `${ JSON.stringify( citation.csl, null, 2 ) }\n`,
		'data-cite-bibtex': citation.exportBibtex || undefined,
		'data-cite-biblatex': citation.exportBiblatex || undefined,
	};
}

export function renderBibliographySave(
	attributes,
	{
		sortEntries = true,
		headingTag = 'p',
		entryTag = 'cite',
		linkVisibleUrls = true,
		ariaLabel = null,
		includeDeprecatedBiblioEntryRole = false,
		includeCiteExport = false,
		repeatedAuthors = false,
		inlineMarkup = false,
		quoteAwareItalics = false,
		urlAwareItalics = false,
		quoteFoldedItalics = false,
		shortContainerItalics = false,
		particleAwareSort = false,
		localeArticles = false,
		notesAuthorChains = false,
		sourceGroups = false,
		chronologicalAuthors = false,
		undatedTitles = false,
		firstAuthorDash = false,
		citeExportData = false,
		canonicalDoiUrl = false,
		jsonLdItemList = false,
		labels: labelOverrides = null,
	} = {}
) {
	const {
		citationStyle,
		citations,
		headingText,
		outputJsonLd = true,
		outputCoins = false,
		outputCslJson = false,
	} = attributes;

	if ( ! citations || citations.length === 0 ) {
		return null;
	}

	const labels = labelOverrides || getLocalizedSaveLabels();
	const blockProps = useBlockProps.save();
	const renderedCitations = sortEntries
		? sortCitations( citations, citationStyle, {
				particleAwareSort,
				localeArticles,
				notesAuthorChains,
				sourceGroups,
				chronologicalAuthors,
				undatedTitles,
			} )
		: citations;
	const cslArray = renderedCitations.map( ( c ) => c.csl );
	const styleGroups =
		sortEntries && sourceGroups ? getStyleGroups( citationStyle ) : null;
	const repeatedAuthorPrefixes = repeatedAuthors
		? getRepeatedAuthorPrefixes(
				renderedCitations,
				citationStyle,
				inlineMarkup ? getPlainDisplayText : getDisplayText,
				{
					firstAuthorDash,
					listOf: ( citation ) =>
						styleGroups
							? getGroupIndex( citation.csl, styleGroups )
							: null,
				}
			)
		: [];
	const repeatedAuthorMark = getRepeatedAuthorMark( citationStyle );
	const styleDefinition = getStyleDefinition( citationStyle );
	const ListTag = getListSemantics( citationStyle );
	const listClassName = `bibliography-builder-list bibliography-builder-list-${
		styleDefinition.listType === 'ol' ? 'numeric' : 'unordered'
	} bibliography-builder-list-${ citationStyle }`;
	const HeadingTag = headingTag;
	const EntryTag = entryTag;
	const groups =
		sortEntries && sourceGroups
			? groupCitations( renderedCitations, citationStyle )
			: null;
	const GroupLabelTag = getGroupLabelTag( headingTag );

	const renderEntry = ( citation, citationIndex, romanTitles = false ) => {
		const displaySegments = getDisplaySegments( citation, {
			inlineMarkup,
			quoteAwareItalics,
			urlAwareItalics,
			quoteFoldedItalics,
			shortContainerItalics,
			romanTitles,
		} );
		const repeatedPrefix = repeatedAuthorPrefixes[ citationIndex ] || null;
		const replacesAuthors =
			repeatedPrefix !== null &&
			displaySegments.length > 0 &&
			! displaySegments[ 0 ].italic &&
			displaySegments[ 0 ].text.startsWith( repeatedPrefix );
		const shownSegments = replacesAuthors
			? [
					{
						...displaySegments[ 0 ],
						text: displaySegments[ 0 ].text.slice(
							repeatedPrefix.length
						),
					},
					...displaySegments.slice( 1 ),
				]
			: displaySegments;
		const coinsTitle = outputCoins ? buildCoins( citation.csl ) : null;
		const exportBase = getCitationExportBasename( citation.csl );

		return (
			<li
				key={ citation.id }
				role={
					includeDeprecatedBiblioEntryRole
						? 'doc-biblioentry'
						: undefined
				}
				id={ `ref-${ citation.id }` }
				lang={ citation.csl.language || undefined }
				{ ...( includeCiteExport && citeExportData
					? getCiteExportData( citation, inlineMarkup )
					: {} ) }
			>
				<EntryTag className="bibliography-builder-entry-text">
					{ replacesAuthors ? (
						<span className="bibliography-builder-repeated-author">
							<span
								className="bibliography-builder-repeated-author-mark"
								aria-hidden="true"
							>
								{ repeatedAuthorMark }
							</span>
							<span className="bibliography-builder-visually-hidden screen-reader-text">
								{ repeatedPrefix }
							</span>
						</span>
					) : null }
					{ shownSegments.map( ( segment, index ) => {
						const titleLabel =
							citation.csl.title ||
							citation.csl[ 'container-title' ];
						const linkLabel =
							( inlineMarkup && titleLabel
								? stripInlineMarkup( titleLabel )
								: titleLabel ) || labels.linkFallback;
						const content = linkVisibleUrls
							? splitTextIntoLinkParts( segment.text, {
									linkLabel,
								} ).map( ( part, partIndex ) =>
									part.link ? (
										<a
											key={ `${ citation.id }-${ index }-${ partIndex }` }
											href={ part.href }
											rel="nofollow noopener noreferrer"
											aria-label={
												linkLabel
													? `${ part.label } — ${ part.href }`
													: undefined
											}
										>
											{ part.text }
										</a>
									) : (
										part.text
									)
								)
							: segment.text;

						return segment.italic ? (
							<i key={ `${ citation.id }-${ index }` }>
								{ content }
							</i>
						) : (
							content
						);
					} ) }
				</EntryTag>
				{ outputCoins ? (
					<span
						className="Z3988"
						aria-hidden="true"
						title={ coinsTitle }
					/>
				) : null }
				{ includeCiteExport && ! citeExportData ? (
					<details className="bibliography-builder-cite-export">
						<summary className="bibliography-builder-cite-export-toggle">
							{ labels.toggle }
						</summary>
						<div className="bibliography-builder-cite-export-panel">
							<button
								type="button"
								className="bibliography-builder-cite-copy"
								aria-live="polite"
								data-cite-text={ getCopyText(
									citation,
									inlineMarkup
								) }
								data-copied-label={ labels.copied || undefined }
							>
								{ labels.copy }
							</button>
							<ul className="bibliography-builder-export-links">
								<li>
									<a
										href={ `data:application/x-research-info-systems;charset=utf-8,${ encodeURIComponent(
											cslToRisEntry( citation.csl )
										) }` }
										download={ `${ exportBase }.ris` }
										data-cite-export-filename={ `${ exportBase }.ris` }
										rel="noopener"
									>
										{ labels.ris }
									</a>
								</li>
								<li>
									<a
										href={ `data:application/vnd.citationstyles.csl+json;charset=utf-8,${ encodeURIComponent(
											`${ JSON.stringify(
												citation.csl,
												null,
												2
											) }\n`
										) }` }
										download={ `${ exportBase }.csl.json` }
										data-cite-export-filename={ `${ exportBase }.csl.json` }
										rel="noopener"
									>
										{ labels.cslJson }
									</a>
								</li>
								{ citation.exportBibtex ? (
									<li>
										<a
											href={ `data:text/x-bibtex;charset=utf-8,${ encodeURIComponent(
												citation.exportBibtex
											) }` }
											download={ `${ exportBase }.bib` }
											data-cite-export-filename={ `${ exportBase }.bib` }
											rel="noopener"
										>
											{ labels.bibtex }
										</a>
									</li>
								) : null }
								{ citation.exportBiblatex ? (
									<li>
										<a
											href={ `data:text/x-bibtex;charset=utf-8,${ encodeURIComponent(
												citation.exportBiblatex
											) }` }
											download={ `${ exportBase }.biblatex.bib` }
											data-cite-export-filename={ `${ exportBase }.biblatex.bib` }
											rel="noopener"
										>
											{ labels.biblatex }
										</a>
									</li>
								) : null }
							</ul>
						</div>
					</details>
				) : null }
			</li>
		);
	};

	return (
		<section
			{ ...blockProps }
			role="doc-bibliography"
			aria-label={ ariaLabel || headingText || 'Bibliography' }
		>
			{ headingText ? (
				<HeadingTag className="bibliography-builder-heading">
					{ headingText }
				</HeadingTag>
			) : null }
			{ groups ? (
				groups.map( ( group ) => {
					const labelId = `bibliography-group-${ group.key }-${ group.citations[ 0 ].id }`;

					return (
						<div
							key={ group.key }
							className={ `bibliography-builder-group bibliography-builder-group-${ group.key }` }
						>
							<GroupLabelTag
								className="bibliography-builder-group-heading"
								id={ labelId }
							>
								{ group.label }
							</GroupLabelTag>
							<ListTag
								className={ listClassName }
								aria-labelledby={ labelId }
							>
								{ group.citations.map( ( citation ) =>
									renderEntry(
										citation,
										renderedCitations.indexOf( citation ),
										group.romanTitles
									)
								) }
							</ListTag>
						</div>
					);
				} )
			) : (
				<ListTag className={ listClassName }>
					{ renderedCitations.map( ( citation, citationIndex ) =>
						renderEntry( citation, citationIndex )
					) }
				</ListTag>
			) }

			{ outputJsonLd ? (
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={ {
						__html: ( jsonLdItemList
							? buildJsonLdItemListString
							: buildJsonLdString )( cslArray, {
							canonicalDoiUrl,
						} ),
					} }
				/>
			) : null }

			{ outputCslJson ? (
				<script
					type="application/vnd.citationstyles.csl+json"
					dangerouslySetInnerHTML={ {
						__html: buildCslJsonString( cslArray ),
					} }
				/>
			) : null }
		</section>
	);
}
