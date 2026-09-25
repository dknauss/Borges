export function createWordpressDataNoticesMock() {
	const ReactLocal = require('react');
	let notices = [];
	let removeAllCalls = [];
	const listeners = new Set();

	const emit = () => {
		listeners.forEach((listener) => listener());
	};

	const subscribe = (listener) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	const getSelectApi = () => ({
		getNotices: (context) =>
			notices.filter((notice) => notice.context === context),
	});

	return {
		useDispatch: () => ({
			createNotice: (status, content, options = {}) => {
				notices = [
					...notices.filter(
						(notice) => notice.context !== options.context
					),
					{
						id: options.id || `notice-${notices.length + 1}`,
						status,
						content,
						context: options.context,
						type: options.type || 'default',
					},
				];
				emit();
			},
			removeAllNotices: (type, context) => {
				removeAllCalls.push([type, context]);
				notices = notices.filter(
					(notice) => notice.context !== context
				);
				emit();
			},
			removeNotice: (id, context) => {
				notices = notices.filter(
					(notice) =>
						!(
							notice.id === id &&
							(!context || notice.context === context)
						)
				);
				emit();
			},
		}),
		useSelect: (mapSelect) => {
			const [selected, setSelected] = ReactLocal.useState(() =>
				mapSelect(() => getSelectApi())
			);

			ReactLocal.useEffect(
				() =>
					subscribe(() => {
						setSelected(mapSelect(() => getSelectApi()));
					}),
				[]
			);

			return selected;
		},
		// Block-editor reads (stable IDs) see an empty editor: no other blocks.
		useRegistry: () => ({
			select: () => ({ getClientIdsWithDescendants: () => [] }),
			dispatch: () => ({}),
		}),
		__unstableResetNotices: () => {
			notices = [];
			removeAllCalls = [];
			emit();
		},
		__unstableGetRemoveAllCalls: () => removeAllCalls,
	};
}
