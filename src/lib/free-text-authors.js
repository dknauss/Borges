function parseAuthorName(name) {
	const normalizedName = name.trim().replace(/[.;,]\s*$/u, '');

	if (!normalizedName) {
		return null;
	}

	if (normalizedName.includes(',')) {
		const [family, given] = normalizedName.split(/\s*,\s*/, 2);

		if (!family || !given) {
			return null;
		}

		return {
			given: given.trim(),
			family: family.trim(),
		};
	}

	const parts = normalizedName.split(/\s+/u);

	if (parts.length === 1) {
		return {
			literal: normalizedName,
		};
	}

	return {
		given: parts.slice(0, -1).join(' '),
		family: parts.at(-1),
	};
}

export function parseAuthors(authorText) {
	const hasEtAl = /(?:,\s*|\s+)et al\.?$/iu.test(authorText);
	const normalizedAuthorText = authorText
		.replace(/(?:,\s*|\s+)et al\.?$/iu, '')
		.trim();

	const commaParts = normalizedAuthorText
		.split(/\s*,\s*/u)
		.map((part) => part.trim())
		.filter(Boolean);

	if (
		!normalizedAuthorText.includes(';') &&
		!/\s+(?:and|&)\s+/iu.test(normalizedAuthorText) &&
		commaParts.length >= 3
	) {
		const authors = [
			parseAuthorName(`${commaParts[0]}, ${commaParts[1]}`),
			...commaParts.slice(2).map(parseAuthorName),
		].filter(Boolean);

		return hasEtAl ? [...authors, { literal: 'et al.' }] : authors;
	}

	const separatorPattern = authorText.includes(';')
		? /\s*;\s*/u
		: /\s+(?:and|&)\s+/iu;

	const authors = normalizedAuthorText
		.split(separatorPattern)
		.map(parseAuthorName)
		.filter(Boolean);

	return hasEtAl ? [...authors, { literal: 'et al.' }] : authors;
}

export function parseApaAuthors(authorText) {
	const normalized = authorText
		.trim()
		.replace(/[.;]\s*$/u, '')
		.replace(/\s*&\s*/gu, ', ');

	if (!normalized.includes(',') && !/[;&]/u.test(normalized)) {
		return [{ literal: normalized }];
	}

	const parts = normalized
		.split(/\s*,\s*/u)
		.map((part) => part.trim())
		.filter(Boolean);

	if (parts.length < 2 || parts.length % 2 !== 0) {
		return parseAuthors(authorText);
	}

	const authors = [];

	for (let index = 0; index < parts.length; index += 2) {
		const family = parts[index].replace(/^&\s*/u, '').trim();
		const given = parts[index + 1]?.trim();

		if (!family || !given) {
			return parseAuthors(authorText);
		}

		authors.push({ family, given });
	}

	return authors;
}

export function maybeLowConfidenceAuthorList(authorText, fallback = 'medium') {
	return authorText.includes(';') || /\bet al\.?$/iu.test(authorText)
		? 'low'
		: fallback;
}
