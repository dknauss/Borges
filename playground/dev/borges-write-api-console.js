/**
 * `borgesWrite`: try Borges' bibliography write routes from the block editor's
 * browser console (development Playground only).
 *
 * Every call makes a dry run first and prints what would change. Pass
 * `{ commit: true }` to then write it, using the ETag from that dry run as
 * If-Match. After a real write the editor still holds the old post, and
 * saving it would overwrite the write, so the page reloads.
 *
 *   await borgesWrite.list()
 *   await borgesWrite.add('demo-try-it', [{ type: 'book', title: 'Ficciones',
 *       author: [{ family: 'Borges', given: 'Jorge Luis' }],
 *       issued: { 'date-parts': [[1944]] } }], { commit: true })
 *   await borgesWrite.update('demo-apa-7', 'demo-apa-7-1', { title: 'New title' })
 *   await borgesWrite.remove('demo-chicago-notes', 'demo-chicago-notes-4', { commit: true })
 *   await borgesWrite.reorder('demo-ieee', ['demo-ieee-3', 'demo-ieee-1', 'demo-ieee-2'], { commit: true })
 *   await borgesWrite.settings('demo-apa-7', { headingText: 'Sources', outputCoins: true }, { commit: true })
 *   await borgesWrite.reformat('demo-apa-7', 'mla-9', { commit: true })
 *
 * `ref` is a block's bibliographyId or its zero-based index.
 */
(function () {
	const postId = () =>
		window.wp.data.select('core/editor').getCurrentPostId();
	const bibliography = (ref) =>
		`/bibliography/v1/posts/${postId()}/bibliographies/${encodeURIComponent(
			ref
		)}`;
	const citations = (ref) => `${bibliography(ref)}/citations`;

	async function send(path, method, data, etag) {
		const response = await window.wp
			.apiFetch({
				path,
				method,
				data,
				headers: etag ? { 'If-Match': etag } : {},
				parse: false,
			})
			.catch((error) => error);
		const body = await response.json();

		if (!response.ok) {
			// eslint-disable-next-line no-console
			console.error(`${response.status} ${body.code}: ${body.message}`);
			throw body;
		}

		return { body, etag: response.headers.get('ETag') };
	}

	async function write(path, method, data, { commit = false } = {}) {
		const preview = await send(path, method, data);
		// eslint-disable-next-line no-console
		console.log(
			'Dry run:',
			preview.body.changes,
			preview.body.bibliography
		);

		if (!commit) {
			return preview.body;
		}

		const separator = path.includes('?') ? '&' : '?';
		const saved = await send(
			`${path}${separator}dry_run=false`,
			method,
			data,
			preview.etag
		);
		// eslint-disable-next-line no-console
		console.log(
			'Written. New ETag:',
			saved.etag,
			'— reloading the editor.'
		);
		window.setTimeout(() => window.location.reload(), 1500);

		return saved.body;
	}

	window.borgesWrite = {
		async list() {
			const { body } = await send(
				`/bibliography/v1/posts/${postId()}/bibliographies`,
				'GET'
			);
			// eslint-disable-next-line no-console
			console.table(
				body.bibliographies.map((b) => ({
					index: b.index,
					bibliographyId: b.bibliographyId,
					style: b.citationStyle,
					citations: b.citations.map((c) => c.id).join(', '),
				}))
			);
			return body;
		},
		add: (ref, items, options) =>
			write(citations(ref), 'POST', { items }, options),
		update: (ref, id, patch, options) =>
			write(
				`${citations(ref)}/${encodeURIComponent(id)}`,
				'PATCH',
				patch,
				options
			),
		remove: (ref, id, options) =>
			write(
				`${citations(ref)}/${encodeURIComponent(id)}`,
				'DELETE',
				undefined,
				options
			),
		reorder: (ref, ids, options) =>
			write(`${citations(ref)}/order`, 'PUT', { ids }, options),
		settings: (ref, settings, options) =>
			write(bibliography(ref), 'PATCH', settings, options),
		reformat: (ref, style, options) =>
			write(`${bibliography(ref)}/reformat`, 'POST', { style }, options),
	};
})();
