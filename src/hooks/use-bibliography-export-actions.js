import { useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { copyTextToClipboard } from '../lib/clipboard';
import {
	buildPlainTextBibliographyContent,
	downloadBibtexExport,
	downloadBiblatexExport,
	downloadCslJsonExport,
	downloadRisExport,
} from '../lib/export';
import { getPlainDisplayText } from '../lib/formatting';

/**
 * Own clipboard/export actions for the editor shell.
 *
 * The hook keeps side-effect-heavy browser APIs out of `edit.js`; async
 * operation guards remain with citation mutation flows because downloads/copies
 * do not commit block state.
 *
 * @param {Object}   options               Hook options.
 * @param {Function} options.announce      Notice announcer.
 * @param {string}   options.citationStyle Current citation style.
 * @param {Object}   options.citationsRef  Mutable citations ref.
 * @param {Function} options.queueFocus    Focus queue helper.
 * @return {Object} Clipboard/export action handlers.
 */
export function useBibliographyExportActions({
	announce,
	citationStyle,
	citationsRef,
	queueFocus,
}) {
	const handleCopyBibliography = useCallback(async () => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			await copyTextToClipboard(
				buildPlainTextBibliographyContent(
					citationsRef.current,
					citationStyle
				).trimEnd()
			);
			announce(
				'success',
				__('Copied bibliography.', 'borges-bibliography-builder'),
				{
					type: 'snackbar',
				}
			);
		} catch (error) {
			announce(
				'error',
				__(
					'Could not copy bibliography in this browser.',
					'borges-bibliography-builder'
				)
			);
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, citationsRef, queueFocus]);

	const handleCopyCitation = useCallback(
		async (citation) => {
			try {
				await copyTextToClipboard(getPlainDisplayText(citation));
				announce(
					'success',
					__('Copied citation.', 'borges-bibliography-builder'),
					{
						type: 'snackbar',
					}
				);
			} catch (error) {
				announce(
					'error',
					__(
						'Could not copy citation in this browser.',
						'borges-bibliography-builder'
					)
				);
				queueFocus({ type: 'notice' });
			}
		},
		[announce, queueFocus]
	);

	const handleDownloadCslJson = useCallback(() => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			downloadCslJsonExport(citationsRef.current, citationStyle);
			announce(
				'success',
				__(
					'Downloaded CSL-JSON export.',
					'borges-bibliography-builder'
				),
				{
					type: 'snackbar',
				}
			);
		} catch (error) {
			announce(
				'error',
				__(
					'Could not download CSL-JSON export in this browser.',
					'borges-bibliography-builder'
				)
			);
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, citationsRef, queueFocus]);

	const handleDownloadBibtex = useCallback(async () => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			await downloadBibtexExport(citationsRef.current, citationStyle);
			announce(
				'success',
				__('Downloaded BibTeX export.', 'borges-bibliography-builder'),
				{
					type: 'snackbar',
				}
			);
		} catch (error) {
			announce(
				'error',
				__(
					'Could not download BibTeX export in this browser.',
					'borges-bibliography-builder'
				)
			);
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, citationsRef, queueFocus]);

	const handleDownloadBiblatex = useCallback(async () => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			await downloadBiblatexExport(citationsRef.current, citationStyle);
			announce(
				'success',
				__(
					'Downloaded BibLaTeX export.',
					'borges-bibliography-builder'
				),
				{
					type: 'snackbar',
				}
			);
		} catch (error) {
			announce(
				'error',
				__(
					'Could not download BibLaTeX export in this browser.',
					'borges-bibliography-builder'
				)
			);
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, citationsRef, queueFocus]);

	const handleDownloadRis = useCallback(() => {
		if (!citationsRef.current.length) {
			return;
		}

		try {
			downloadRisExport(citationsRef.current, citationStyle);
			announce(
				'success',
				__('Downloaded RIS export.', 'borges-bibliography-builder'),
				{
					type: 'snackbar',
				}
			);
		} catch (error) {
			announce(
				'error',
				__(
					'Could not download RIS export in this browser.',
					'borges-bibliography-builder'
				)
			);
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, citationsRef, queueFocus]);

	return {
		handleCopyBibliography,
		handleCopyCitation,
		handleDownloadBiblatex,
		handleDownloadBibtex,
		handleDownloadCslJson,
		handleDownloadRis,
	};
}
