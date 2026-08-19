export async function copyTextToClipboard(
	text,
	{ navigatorRef, documentRef } = {}
) {
	const runtimeNavigator =
		navigatorRef ??
		(typeof window !== 'undefined' ? window.navigator : undefined);
	const runtimeDocument =
		documentRef ?? (typeof document !== 'undefined' ? document : undefined);

	if (runtimeNavigator?.clipboard?.writeText) {
		try {
			await runtimeNavigator.clipboard.writeText(text);
			return true;
		} catch {
			// Presence is not permission. The API can be there and still refuse:
			// permission denied, a document that is not the focused one (common
			// once a control renders inside the iframed block-editor canvas), or
			// a non-secure context. Fall through to the textarea path rather than
			// reporting failure while an option remains untried.
		}
	}

	if (!runtimeDocument?.createElement || !runtimeDocument?.body) {
		throw new Error('Clipboard API unavailable');
	}

	const textarea = runtimeDocument.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'absolute';
	textarea.style.left = '-9999px';
	runtimeDocument.body.appendChild(textarea);
	textarea.select();

	try {
		const copied = runtimeDocument.execCommand?.('copy');

		if (!copied) {
			throw new Error('Clipboard copy command failed');
		}

		return true;
	} finally {
		textarea.remove();
	}
}
