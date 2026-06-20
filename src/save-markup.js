import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { buildCoins } from './lib/coins';
import {
	getDisplaySegments,
	getListSemantics,
	splitTextIntoLinkParts,
	getStyleDefinition,
} from './lib/formatting';
import { buildJsonLdString, buildCslJsonString } from './lib/jsonld';
import { cslToRisEntry, getCitationExportBasename } from './lib/export';
import { sortCitations } from './lib/sorter';

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

	if (!citations || citations.length === 0) {
		return null;
	}

	const blockProps = useBlockProps.save();
	const renderedCitations = sortEntries
		? sortCitations(citations, citationStyle)
		: citations;
	const cslArray = renderedCitations.map((c) => c.csl);
	const styleDefinition = getStyleDefinition(citationStyle);
	const ListTag = getListSemantics(citationStyle);
	const listClassName = `bibliography-builder-list bibliography-builder-list-${
		styleDefinition.listType === 'ol' ? 'numeric' : 'unordered'
	} bibliography-builder-list-${citationStyle}`;
	const HeadingTag = headingTag;
	const EntryTag = entryTag;

	return (
		<section
			{...blockProps}
			role="doc-bibliography"
			aria-label={ariaLabel || headingText || 'Bibliography'}
		>
			{headingText ? (
				<HeadingTag className="bibliography-builder-heading">
					{headingText}
				</HeadingTag>
			) : null}
			<ListTag className={listClassName}>
				{renderedCitations.map((citation) => {
					const displaySegments = getDisplaySegments(citation);
					const coinsTitle = outputCoins
						? buildCoins(citation.csl)
						: null;
					const exportBase = getCitationExportBasename(citation.csl);

					return (
						<li
							key={citation.id}
							role={
								includeDeprecatedBiblioEntryRole
									? 'doc-biblioentry'
									: undefined
							}
							id={`ref-${citation.id}`}
							lang={citation.csl.language || undefined}
						>
							<EntryTag className="bibliography-builder-entry-text">
								{displaySegments.map((segment, index) => {
									const linkLabel =
										citation.csl.title ||
										citation.csl['container-title'] ||
										__(
											'Link to publication',
											'borges-bibliography-builder'
										);
									const content = linkVisibleUrls
										? splitTextIntoLinkParts(segment.text, {
												linkLabel,
										  }).map((part, partIndex) =>
												part.link ? (
													<a
														key={`${citation.id}-${index}-${partIndex}`}
														href={part.href}
														rel="nofollow noopener noreferrer"
														aria-label={`${part.label} — ${part.href}`}
													>
														{part.text}
													</a>
												) : (
													part.text
												)
										  )
										: segment.text;

									return segment.italic ? (
										<i key={`${citation.id}-${index}`}>
											{content}
										</i>
									) : (
										content
									);
								})}
							</EntryTag>
							{outputCoins ? (
								<span
									className="Z3988"
									aria-hidden="true"
									title={coinsTitle}
								/>
							) : null}
							{includeCiteExport ? (
								<details className="bibliography-builder-cite-export">
									<summary className="bibliography-builder-cite-export-toggle">
										{__(
											'Cite / Export',
											'borges-bibliography-builder'
										)}
									</summary>
									<div className="bibliography-builder-cite-export-panel">
										<button
											type="button"
											className="bibliography-builder-cite-copy"
											aria-live="polite"
											data-cite-text={
												citation.displayOverride ||
												citation.formattedText ||
												''
											}
											data-copied-label={__(
												'Copied',
												'borges-bibliography-builder'
											)}
										>
											{__(
												'Copy citation',
												'borges-bibliography-builder'
											)}
										</button>
										<ul className="bibliography-builder-export-links">
											<li>
												<a
													href={`data:application/x-research-info-systems;charset=utf-8,${encodeURIComponent(
														cslToRisEntry(
															citation.csl
														)
													)}`}
													download={`${exportBase}.ris`}
													data-cite-export-filename={`${exportBase}.ris`}
													rel="noopener"
												>
													{__(
														'RIS',
														'borges-bibliography-builder'
													)}
												</a>
											</li>
											<li>
												<a
													href={`data:application/vnd.citationstyles.csl+json;charset=utf-8,${encodeURIComponent(
														`${JSON.stringify(
															citation.csl,
															null,
															2
														)}\n`
													)}`}
													download={`${exportBase}.csl.json`}
													data-cite-export-filename={`${exportBase}.csl.json`}
													rel="noopener"
												>
													{__(
														'CSL-JSON',
														'borges-bibliography-builder'
													)}
												</a>
											</li>
											{citation.exportBibtex ? (
												<li>
													<a
														href={`data:text/x-bibtex;charset=utf-8,${encodeURIComponent(
															citation.exportBibtex
														)}`}
														download={`${exportBase}.bib`}
														data-cite-export-filename={`${exportBase}.bib`}
														rel="noopener"
													>
														{__(
															'BibTeX',
															'borges-bibliography-builder'
														)}
													</a>
												</li>
											) : null}
											{citation.exportBiblatex ? (
												<li>
													<a
														href={`data:text/x-bibtex;charset=utf-8,${encodeURIComponent(
															citation.exportBiblatex
														)}`}
														download={`${exportBase}.biblatex.bib`}
														data-cite-export-filename={`${exportBase}.biblatex.bib`}
														rel="noopener"
													>
														{__(
															'BibLaTeX',
															'borges-bibliography-builder'
														)}
													</a>
												</li>
											) : null}
										</ul>
									</div>
								</details>
							) : null}
						</li>
					);
				})}
			</ListTag>

			{outputJsonLd ? (
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{
						__html: buildJsonLdString(cslArray),
					}}
				/>
			) : null}

			{outputCslJson ? (
				<script
					type="application/vnd.citationstyles.csl+json"
					dangerouslySetInnerHTML={{
						__html: buildCslJsonString(cslArray),
					}}
				/>
			) : null}
		</section>
	);
}
