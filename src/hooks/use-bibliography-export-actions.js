import { useCallback } from '@wordpress/element';
import { copyTextToClipboard } from '../lib/clipboard';
import {
	buildPlainTextBibliographyContent,
	downloadBibtexExport,
	downloadBiblatexExport,
	downloadCslJsonExport,
	downloadRisExport,
} from '../lib/export';
import { getDisplayText } from '../lib/formatting';

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
			announce('success', 'Copied bibliography.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce('error', 'Could not copy bibliography in this browser.');
			queueFocus({ type: 'notice' });
		}
	}, [announce, citationStyle, citationsRef, queueFocus]);

	const handleCopyCitation = useCallback(
		async (citation) => {
			try {
				await copyTextToClipboard(getDisplayText(citation));
				announce('success', 'Copied citation.', {
					type: 'snackbar',
				});
			} catch (error) {
				announce('error', 'Could not copy citation in this browser.');
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
			announce('success', 'Downloaded CSL-JSON export.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce(
				'error',
				'Could not download CSL-JSON export in this browser.'
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
			announce('success', 'Downloaded BibTeX export.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce(
				'error',
				'Could not download BibTeX export in this browser.'
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
			announce('success', 'Downloaded BibLaTeX export.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce(
				'error',
				'Could not download BibLaTeX export in this browser.'
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
			announce('success', 'Downloaded RIS export.', {
				type: 'snackbar',
			});
		} catch (error) {
			announce('error', 'Could not download RIS export in this browser.');
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
