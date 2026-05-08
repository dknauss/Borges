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
