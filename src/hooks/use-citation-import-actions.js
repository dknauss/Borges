import { useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { partitionDuplicateCitations } from '../lib/deduplicate';
import { SUPPORTED_INPUT_MESSAGE } from '../lib/input-support';
import { sortCitations } from '../lib/sorter';
import { computeExportStrings } from './compute-export-strings';
import {
	MAX_CITATIONS_PER_BIBLIOGRAPHY,
	getBibliographyLimitExceededMessage,
	getBibliographyLimitReachedMessage,
} from '../lib/citation-limits';

const FORMATTER_FALLBACK_MESSAGE = __(
	'Formatter unavailable; added fallback citation text.',
	'borges-bibliography-builder'
);

function pluralize(count, singular, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`;
}

function buildParseResultMessage({
	addedCount,
	duplicateCount,
	errorCount,
	reviewWarningCount,
	truncated,
	retainedUnparsedItems,
	formatterFallback,
}) {
	const parts = [];

	if (addedCount > 0) {
		parts.push(`Added ${pluralize(addedCount, 'citation')}.`);
	} else if (duplicateCount > 0 || errorCount > 0 || truncated) {
		parts.push('No new citations added.');
	}

	if (duplicateCount > 0) {
		parts.push(`Skipped ${pluralize(duplicateCount, 'duplicate')}.`);
	}

	if (errorCount > 0) {
		parts.push(`Couldn't parse ${pluralize(errorCount, 'item')}.`);
	}

	if (truncated) {
		parts.push('Only the first 50 items were processed.');
	}

	if (reviewWarningCount > 0) {
		parts.push(
			`Review ${pluralize(
				reviewWarningCount,
				'imported record'
			)} before publishing.`
		);
	}

	if (retainedUnparsedItems) {
		parts.push('Unparsed items remain in the form.');
	}

	if (formatterFallback) {
		parts.push(FORMATTER_FALLBACK_MESSAGE);
	}

	return parts.join(' ');
}

function shouldWarnParseResult({
	duplicateCount,
	errorCount,
	formatterFallback,
	reviewWarningCount,
	truncated,
}) {
	return (
		reviewWarningCount > 0 ||
		duplicateCount > 0 ||
		errorCount > 0 ||
		truncated ||
		formatterFallback
	);
}

/**
 * Own paste/import parsing and full-bibliography formatting side effects.
 *
 * Async operation tokens are injected from `edit.js` so all editor mutations
 * still share one latest-operation guard.
 *
 * @param {Object}   options                         Hook options.
 * @param {Function} options.announce                Notice announcer.
 * @param {Function} options.beginAsyncOperation     Latest-operation starter.
 * @param {string}   options.citationStyle           Current citation style.
 * @param {Object}   options.citationsRef            Mutable citations ref.
 * @param {Function} options.clearNotice             Notice clearer.
 * @param {string}   options.inputValue              Current paste/import text.
 * @param {Function} options.isCurrentAsyncOperation Latest-operation checker.
 * @param {Function} options.queueFocus              Focus queue helper.
 * @param {Function} options.setAttributes           Block attribute setter.
 * @param {Function} options.setIsLoading            Loading state setter.
 * @param {Function} options.updatePasteInput        Paste input updater.
 * @return {Object} Paste/import action handlers.
 */
export function useCitationImportActions({
	announce,
	beginAsyncOperation,
	citationStyle,
	citationsRef,
	clearNotice,
	inputValue,
	isCurrentAsyncOperation,
	queueFocus,
	setAttributes,
	setIsLoading,
	updatePasteInput,
}) {
	const handleParse = useCallback(async () => {
		if (!inputValue.trim()) {
			return;
		}

		if (citationsRef.current.length >= MAX_CITATIONS_PER_BIBLIOGRAPHY) {
			announce('warning', getBibliographyLimitReachedMessage());
			queueFocus({ type: 'notice' });
			return;
		}

		const operationId = beginAsyncOperation();
		setIsLoading(true);
		clearNotice();

		try {
			const { parsePastedInput } = await import('../lib/parser');
			const {
				entries,
				errors,
				truncated,
				remainingInput = '',
				skippedDuplicateCount = 0,
			} = await parsePastedInput(inputValue, citationStyle, {
				deferFormatting: true,
				existingDoiValues: citationsRef.current
					.map((citation) => citation.csl?.DOI)
					.filter(Boolean),
			});
			if (!isCurrentAsyncOperation(operationId)) {
				return;
			}

			const { uniqueEntries, duplicateEntries } =
				partitionDuplicateCitations(entries, citationsRef.current);
			const duplicateCount =
				duplicateEntries.length + skippedDuplicateCount;
			const retainedUnparsedItems = Boolean(remainingInput.trim());

			if (
				uniqueEntries.length >
				MAX_CITATIONS_PER_BIBLIOGRAPHY - citationsRef.current.length
			) {
				announce(
					'warning',
					getBibliographyLimitExceededMessage(
						uniqueEntries.length,
						citationsRef.current.length
					)
				);
				queueFocus({ type: 'notice' });
			} else if (uniqueEntries.length > 0) {
				const { formatBibliographyEntries } = await import(
					'../lib/formatting/csl'
				);
				const mergedEntries = [
					...citationsRef.current,
					...uniqueEntries,
				];
				let formatterFallback = false;
				const formattedTexts = await formatBibliographyEntries(
					mergedEntries.map((citation) => citation.csl),
					citationStyle,
					{
						onFallback: () => {
							formatterFallback = true;
						},
					}
				);
				if (!isCurrentAsyncOperation(operationId)) {
					return;
				}

				const exportStrings = await computeExportStrings(
					mergedEntries.map((entry) => entry.csl),
					citationStyle
				);
				if (!isCurrentAsyncOperation(operationId)) {
					return;
				}

				const formattedMergedEntries = mergedEntries.map(
					(entry, index) => ({
						...entry,
						id: entry.id || crypto.randomUUID(),
						formattedText: formattedTexts[index],
						exportBibtex: exportStrings[index]?.exportBibtex ?? '',
						exportBiblatex:
							exportStrings[index]?.exportBiblatex ?? '',
					})
				);
				if (!isCurrentAsyncOperation(operationId)) {
					return;
				}

				const updated = sortCitations(
					formattedMergedEntries,
					citationStyle
				);
				const reviewWarningCount = uniqueEntries.filter(
					(entry) => (entry.parseWarnings || []).length > 0
				).length;
				const firstNewEntry = updated.find((citation) =>
					uniqueEntries.some((entry) => entry.id === citation.id)
				);

				citationsRef.current = updated;
				setAttributes({ citations: updated });

				const warningResult = shouldWarnParseResult({
					duplicateCount,
					errorCount: errors.length,
					formatterFallback,
					reviewWarningCount,
					truncated,
				});
				const message = buildParseResultMessage({
					addedCount: uniqueEntries.length,
					duplicateCount,
					errorCount: errors.length,
					reviewWarningCount,
					truncated,
					retainedUnparsedItems,
					formatterFallback,
				});
				announce(
					warningResult ? 'warning' : 'success',
					message,
					warningResult ? {} : { type: 'snackbar' }
				);

				if (warningResult) {
					queueFocus({ type: 'notice' });
				} else if (firstNewEntry) {
					queueFocus({ type: 'entry', id: firstNewEntry.id });
				}
			} else if (duplicateCount > 0) {
				announce(
					'warning',
					buildParseResultMessage({
						addedCount: 0,
						duplicateCount,
						errorCount: errors.length,
						reviewWarningCount: 0,
						truncated,
						retainedUnparsedItems,
					})
				);
				queueFocus({ type: 'notice' });
			} else if (errors.length > 0) {
				announce('warning', errors[0]);
				queueFocus({ type: 'notice' });
			} else {
				announce('warning', SUPPORTED_INPUT_MESSAGE);
				queueFocus({ type: 'notice' });
			}

			updatePasteInput(remainingInput, { syncDom: true });
		} catch (err) {
			announce(
				'error',
				'Something went wrong while parsing. Please try again.'
			);
			queueFocus({ type: 'notice' });
		} finally {
			if (isCurrentAsyncOperation(operationId)) {
				setIsLoading(false);
			}
		}
	}, [
		announce,
		beginAsyncOperation,
		citationStyle,
		citationsRef,
		clearNotice,
		inputValue,
		isCurrentAsyncOperation,
		queueFocus,
		setAttributes,
		setIsLoading,
		updatePasteInput,
	]);

	return { handleParse };
}
