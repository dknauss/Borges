/**
 * Cleanup applied to every resolved record: book-review titles, reviewed-author
 * markers, and title and name case.
 *
 * Split from parser.js (refactor memo, Phase E); parser.js re-exports the
 * public names, so importers are unchanged.
 */

import { normalizeCslNameCase } from './normalize-author-names';
import { normalizeCslTitleCase } from './normalize-title-case';

function normalizeWhitespace(value) {
	return (value || '').trim().replace(/\s+/gu, ' ');
}

function stripTrailingReviewExtras(title) {
	return title
		.replace(
			/\.\s+[A-Z][^.]*,\s*\d{4}\.\s+\d+\s+pp\.\s+(?:[$£€]\s*)?\d+[^.]*\.?$/u,
			''
		)
		.replace(/\.\s+\d+\s+pp\.\s+(?:[$£€]\s*)?\d+[^.]*\.?$/u, '')
		.trim();
}

function stripRepeatedReviewTitle(title) {
	const words = title.split(/\s+/u).filter(Boolean);

	if (words.length < 6) {
		return title;
	}

	let secondIndex = -1;

	for (
		let probeLength = Math.min(10, words.length - 1);
		probeLength >= 4 && secondIndex === -1;
		probeLength--
	) {
		const probe = words.slice(0, probeLength).join(' ');
		secondIndex = title.indexOf(probe, probe.length);
	}

	if (secondIndex === -1) {
		return title;
	}

	return title
		.slice(0, secondIndex)
		.replace(/\s+[A-Z][a-z]+[A-Z][\s\S]*$/u, '')
		.trim();
}

function getReviewedAuthorFamilyNames(reviewedAuthors) {
	return reviewedAuthors
		.split(/\band\b|,/iu)
		.map((name) => name.trim().replace(/\.$/u, '').split(/\s+/u).pop())
		.filter(Boolean);
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function stripDuplicatedReviewAuthorMarkers(title, reviewedAuthors) {
	const familyNames = getReviewedAuthorFamilyNames(reviewedAuthors);

	for (const familyName of familyNames) {
		const duplicateMarkerMatch = title.match(
			new RegExp(`\\s+${escapeRegExp(familyName)}[A-Z]`, 'u')
		);

		if (duplicateMarkerMatch?.index) {
			return title.slice(0, duplicateMarkerMatch.index).trim();
		}
	}

	return title;
}

function normalizeReviewRecordTitle(title) {
	const normalizedTitle = normalizeWhitespace(title);
	const titleWithoutReviewExtras = stripTrailingReviewExtras(normalizedTitle);
	const sentenceMatch = titleWithoutReviewExtras.match(
		/^(?<reviewedAuthors>.+?\b[\p{Lu}][\p{L}'’.-]+)\.\s+(?<reviewedTitle>.+)$/u
	);

	if (!sentenceMatch?.groups) {
		return titleWithoutReviewExtras.replace(/\.$/u, '');
	}

	const cleanedReviewedTitle = stripDuplicatedReviewAuthorMarkers(
		stripRepeatedReviewTitle(sentenceMatch.groups.reviewedTitle),
		sentenceMatch.groups.reviewedAuthors
	);

	return `${sentenceMatch.groups.reviewedAuthors}. ${cleanedReviewedTitle}`
		.trim()
		.replace(/\.$/u, '');
}

function getReviewMetadataWarnings(inputFormat, originalCsl, normalizedCsl) {
	if (
		inputFormat === 'doi' &&
		normalizedCsl.type === 'article-journal' &&
		normalizedCsl['container-title'] &&
		typeof originalCsl.title === 'string' &&
		typeof normalizedCsl.title === 'string' &&
		originalCsl.title !== normalizedCsl.title &&
		!normalizedCsl.page
	) {
		return ['review-metadata-incomplete'];
	}

	return [];
}

export function normalizeResolvedCsl(csl, inputFormat) {
	// Title-case ALL-CAPS personal names and titles returned by CrossRef /
	// PubMed before any further normalization or storage. Machine-resolved
	// sources only; manual entry intentionally bypasses this path.
	const normalizedCsl = normalizeCslTitleCase(
		normalizeCslNameCase({
			...csl,
		})
	);

	if (
		normalizedCsl.type === 'article-journal' &&
		typeof normalizedCsl.title === 'string' &&
		normalizedCsl['container-title'] &&
		(/\b\d+\s+pp\./u.test(normalizedCsl.title) ||
			/[$£€]\s*\d+/u.test(normalizedCsl.title) ||
			/[a-z][A-Z][a-z]/u.test(normalizedCsl.title))
	) {
		normalizedCsl.title = normalizeReviewRecordTitle(normalizedCsl.title);
	}

	return {
		csl: normalizedCsl,
		parseWarnings: getReviewMetadataWarnings(
			inputFormat,
			csl,
			normalizedCsl
		),
	};
}
