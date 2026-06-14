#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Validate checked-in translation artifacts without mutating files.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'languages');
const DOMAIN = 'borges-bibliography-builder';
const POT = path.join(LANG_DIR, `${DOMAIN}.pot`);
const EXPECTED_LOCALES = [
	'bn_BD',
	'de_DE',
	'es_ES',
	'fr_FR',
	'hi_IN',
	'hr',
	'it_IT',
	'ja',
	'ko_KR',
	'nl_NL',
	'pl_PL',
	'pt_BR',
	'pt_PT',
	'ru_RU',
	'sr_RS',
	'sv_SE',
	'ta_IN',
	'te',
	'zh_CN',
];
const FORBIDDEN_TEXT_PATTERNS = [
	/Paste a DOI or BibTeX entry/,
	/translated into 19 locales/i,
	/official generated language pack for\s+the plugin:\s+`?ru_RU`?/i,
];

function decodePoString(raw) {
	return JSON.parse(raw);
}

function parsePoMessages(filePath) {
	const content = fs.readFileSync(filePath, 'utf8');
	const lines = content.split(/\r?\n/);
	const messages = [];
	let current = null;
	let activeField = null;

	for (const line of lines) {
		if (line.startsWith('msgid ')) {
			if (current) {
				messages.push(current);
			}
			current = { msgid: decodePoString(line.slice(6).trim()) };
			activeField = 'msgid';
			continue;
		}

		if (line.startsWith('msgid_plural ')) {
			activeField = null;
			continue;
		}

		if (line.startsWith('msgstr')) {
			activeField = null;
			continue;
		}

		if (current && activeField === 'msgid' && line.startsWith('"')) {
			current.msgid += decodePoString(line.trim());
		}
	}

	if (current) {
		messages.push(current);
	}

	return messages.map((message) => message.msgid).filter(Boolean);
}

function listFiles(dir, extension) {
	return fs
		.readdirSync(dir)
		.filter((file) => file.endsWith(extension))
		.sort();
}

function addFailure(failures, message) {
	failures.push(message);
}

function compareMsgids(failures, potMsgids, poPath) {
	const poMsgids = parsePoMessages(poPath);
	const potSet = new Set(potMsgids);
	const poSet = new Set(poMsgids);
	const missing = potMsgids.filter((msgid) => !poSet.has(msgid));
	const extra = poMsgids.filter((msgid) => !potSet.has(msgid));
	const basename = path.basename(poPath);

	if (missing.length > 0) {
		addFailure(
			failures,
			`${basename} is missing ${missing.length} POT msgid(s): ${missing
				.slice(0, 3)
				.join(' | ')}`
		);
	}

	if (extra.length > 0) {
		addFailure(
			failures,
			`${basename} has ${extra.length} obsolete msgid(s): ${extra
				.slice(0, 3)
				.join(' | ')}`
		);
	}
}

function scanForbiddenText(failures) {
	const filesToScan = [
		'README.md',
		'readme.txt',
		'CHANGELOG.md',
		'package.json',
		'bibliography-builder.php',
		'docs/i18n-process.md',
		'docs/wporg-svn-checklist.md',
		'.planning/ROADMAP.md',
		'.planning/STATE.md',
	].map((file) => path.join(ROOT, file));

	for (const filePath of filesToScan) {
		if (!fs.existsSync(filePath)) {
			continue;
		}

		const content = fs.readFileSync(filePath, 'utf8');
		for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
			if (pattern.test(content)) {
				addFailure(
					failures,
					`${path.relative(
						ROOT,
						filePath
					)} contains stale i18n wording matching ${pattern}`
				);
			}
		}
	}
}

function main() {
	const failures = [];

	if (!fs.existsSync(POT)) {
		addFailure(failures, `Missing POT file: ${path.relative(ROOT, POT)}`);
	} else {
		const potMsgids = parsePoMessages(POT);
		const poFiles = listFiles(LANG_DIR, '.po');
		const moFiles = listFiles(LANG_DIR, '.mo');
		const jsonFiles = listFiles(LANG_DIR, '.json');

		if (potMsgids.length === 0) {
			addFailure(failures, 'POT has no non-empty msgids.');
		}

		for (const locale of EXPECTED_LOCALES) {
			const poName = `${DOMAIN}-${locale}.po`;
			const moName = `${DOMAIN}-${locale}.mo`;

			if (!poFiles.includes(poName)) {
				addFailure(
					failures,
					`Missing seed PO file: languages/${poName}`
				);
				continue;
			}

			if (!moFiles.includes(moName)) {
				addFailure(
					failures,
					`Missing compiled MO file: languages/${moName}`
				);
			}

			compareMsgids(failures, potMsgids, path.join(LANG_DIR, poName));
		}

		const unexpectedPo = poFiles.filter(
			(file) =>
				!EXPECTED_LOCALES.includes(
					file.replace(`${DOMAIN}-`, '').replace(/\.po$/, '')
				)
		);
		if (unexpectedPo.length > 0) {
			addFailure(
				failures,
				`Unexpected PO file(s): ${unexpectedPo.join(', ')}`
			);
		}

		if (jsonFiles.length > 0) {
			addFailure(
				failures,
				`Bundled JS translation JSON files are not expected: ${jsonFiles.join(
					', '
				)}`
			);
		}
	}

	scanForbiddenText(failures);

	if (failures.length > 0) {
		console.error('i18n validation failed:');
		for (const failure of failures) {
			console.error(`- ${failure}`);
		}
		process.exit(1);
	}

	console.log('i18n validation passed.');
}

main();
