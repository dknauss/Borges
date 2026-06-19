import {
	buildBibtexExportContent,
	buildBiblatexExportContent,
} from '../lib/export';

/**
 * Pre-compute per-citation BibTeX and BibLaTeX export strings in the editor.
 *
 * save() is synchronous and cannot call the async citation-js export builders,
 * so the strings are computed here (after the format pass, before
 * setAttributes) and stored on each citation alongside `formattedText`. The
 * static save() output then embeds them without any runtime work.
 *
 * Each entry is resolved independently; if either builder throws for an entry,
 * that entry falls back to an empty string for the failed format (never
 * `undefined`), so a single bad citation never blocks the others.
 *
 * @param {Array}  cslObjects    Raw CSL objects (not citation wrapper objects).
 * @param {string} citationStyle Active citation style key.
 * @return {Promise<Array<{exportBibtex: string, exportBiblatex: string}>>}
 *         Results indexed to match `cslObjects`.
 */
export async function computeExportStrings(cslObjects, citationStyle) {
	return Promise.all(
		(cslObjects || []).map(async (csl) => {
			try {
				const [exportBibtex, exportBiblatex] = await Promise.all([
					buildBibtexExportContent([{ csl }], citationStyle),
					buildBiblatexExportContent([{ csl }], citationStyle),
				]);
				return { exportBibtex, exportBiblatex };
			} catch {
				return { exportBibtex: '', exportBiblatex: '' };
			}
		})
	);
}
