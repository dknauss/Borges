const BLOCK_NAME = 'bibliography-builder/bibliography';

const RAW_URL_RE = /^https?:\/\/\S+$|^10\.\d{4,}\/\S+$/i;

function isRawUrlText(text) {
	return typeof text === 'string' && RAW_URL_RE.test(text.trim());
}

function hasRawUrlLinks(citations) {
	if (!Array.isArray(citations)) {
		return false;
	}
	return citations.some((csl) => {
		const url = csl?.URL || csl?.DOI;
		const title = csl?.title;
		if (!url) {
			return false;
		}
		return !title || isRawUrlText(title);
	});
}

const checks = [
	{
		id: 'empty_bibliography',
		message:
			'This bibliography block has no citations. Empty blocks are omitted from the published page.',
		severity: 'error',
		test(attributes) {
			const { citations } = attributes;
			return !Array.isArray(citations) || citations.length === 0;
		},
	},
	{
		id: 'heading_missing',
		message:
			'This bibliography block has citations but no visible heading or accessible label. Add a heading so readers can identify the reference list.',
		severity: 'warning',
		test(attributes) {
			const { citations, headingText } = attributes;
			const hasCitations =
				Array.isArray(citations) && citations.length > 0;
			const hasHeading =
				typeof headingText === 'string' && headingText.trim() !== '';
			return hasCitations && !hasHeading;
		},
	},
	{
		id: 'raw_url_link_text',
		message:
			'One or more citations have a URL or DOI as the only identifier. A descriptive title helps screen reader users understand the link destination.',
		severity: 'warning',
		test(attributes) {
			return hasRawUrlLinks(attributes.citations);
		},
	},
	{
		id: 'all_metadata_disabled',
		message:
			'All machine-readable metadata outputs (JSON-LD, COinS, CSL-JSON) are disabled. Enabling at least one improves citation-manager interoperability.',
		severity: 'warning',
		test(attributes) {
			const { outputJsonLd, outputCoins, outputCslJson } = attributes;
			return !outputJsonLd && !outputCoins && !outputCslJson;
		},
	},
];

export function registerBACChecks() {
	if (
		typeof window === 'undefined' ||
		typeof window.BlockAccessibilityChecks === 'undefined'
	) {
		return;
	}

	const { registerBlockChecks } = window.BlockAccessibilityChecks;
	if (typeof registerBlockChecks !== 'function') {
		return;
	}

	registerBlockChecks(BLOCK_NAME, checks);
}
