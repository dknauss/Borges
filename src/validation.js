/**
 * Optional Block Accessibility Checks (BAC) integration.
 *
 * Registers authoring-time accessibility checks for the bibliography block
 * when Troy Chaplin's Block Accessibility Checks plugin is active. This is a
 * soft dependency: the script is only enqueued when the BAC framework is
 * present, and the filter is a no-op if the framework never calls it.
 *
 * Checks registered:
 *   - empty_bibliography    (error)   — block has no citations
 *   - heading_missing       (warning) — headingText is blank; no heading visible
 *   - raw_url_link_text     (warning) — citation uses a raw URL/DOI as link text
 *   - all_metadata_disabled (warning) — all metadata outputs are turned off
 *
 * @see https://github.com/troychaplin/block-accessibility-checks
 * @since 1.1.0
 */
import { addFilter } from '@wordpress/hooks';

const BLOCK_TYPE = 'bibliography-builder/bibliography';
const NAMESPACE = 'borges-bibliography-builder/bac-validation';

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

/**
 * Pure validation logic — exported for unit testing.
 *
 * @param {Object} attributes Block attributes.
 * @param {string} checkName  BAC check identifier.
 * @return {boolean} True if the check passes; false if it fails.
 */
export function validateBibliographyBlock(attributes, checkName) {
	if (checkName === 'empty_bibliography') {
		return (
			Array.isArray(attributes.citations) &&
			attributes.citations.length > 0
		);
	}

	if (checkName === 'heading_missing') {
		const hasCitations =
			Array.isArray(attributes.citations) &&
			attributes.citations.length > 0;
		const hasHeading =
			typeof attributes.headingText === 'string' &&
			attributes.headingText.trim().length > 0;
		return !hasCitations || hasHeading;
	}

	if (checkName === 'raw_url_link_text') {
		return !hasRawUrlLinks(attributes.citations);
	}

	if (checkName === 'all_metadata_disabled') {
		const { outputJsonLd, outputCoins, outputCslJson } = attributes;
		return !!(outputJsonLd || outputCoins || outputCslJson);
	}

	// Unknown checks pass through unchanged.
	return true;
}

/**
 * BAC filter: validate bibliography block attributes.
 *
 * @param {boolean} isValid    Current validity state from previous filters.
 * @param {string}  blockType  Block name.
 * @param {Object}  attributes Block attributes.
 * @param {string}  checkName  BAC check identifier.
 * @return {boolean} Validity result.
 */
export function bacValidateBlock(isValid, blockType, attributes, checkName) {
	if (blockType !== BLOCK_TYPE) {
		return isValid;
	}

	if (isValid === false) {
		return false;
	}

	return validateBibliographyBlock(attributes, checkName);
}

addFilter('ba11yc.validateBlock', NAMESPACE, bacValidateBlock);
