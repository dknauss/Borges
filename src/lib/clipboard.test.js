import { copyTextToClipboard } from './clipboard';

describe('copyTextToClipboard', () => {
	it('uses the async clipboard API when available', async () => {
		const writeText = jest.fn().mockResolvedValue(undefined);

		await copyTextToClipboard('Alpha citation', {
			navigatorRef: { clipboard: { writeText } },
			documentRef: {},
		});

		expect(writeText).toHaveBeenCalledWith('Alpha citation');
	});

	it('falls back to document.execCommand when clipboard API is unavailable', async () => {
		const select = jest.fn();
		const remove = jest.fn();
		const appendChild = jest.fn();
		const textarea = {
			setAttribute: jest.fn(),
			style: {},
			select,
			remove,
		};
		const documentRef = {
			createElement: jest.fn(() => textarea),
			body: { appendChild },
			execCommand: jest.fn(() => true),
		};

		await copyTextToClipboard('Beta citation', {
			navigatorRef: {},
			documentRef,
		});

		expect(documentRef.createElement).toHaveBeenCalledWith('textarea');
		expect(appendChild).toHaveBeenCalledWith(textarea);
		expect(select).toHaveBeenCalled();
		expect(documentRef.execCommand).toHaveBeenCalledWith('copy');
		expect(remove).toHaveBeenCalled();
	});

	it('falls back to execCommand when the clipboard API rejects', async () => {
		// Observed for real: a rejected writeText, not an absent one. The API can
		// be present and still refuse — denied permission, a document that is not
		// the focused one, a non-secure context. Presence is not permission.
		const writeText = jest.fn().mockRejectedValue(
			Object.assign(new Error('Write permission denied.'), {
				name: 'NotAllowedError',
			})
		);
		const select = jest.fn();
		const remove = jest.fn();
		const appendChild = jest.fn();
		const textarea = {
			setAttribute: jest.fn(),
			style: {},
			select,
			remove,
		};
		const documentRef = {
			createElement: jest.fn(() => textarea),
			body: { appendChild },
			execCommand: jest.fn(() => true),
		};

		await expect(
			copyTextToClipboard('Epsilon citation', {
				navigatorRef: { clipboard: { writeText } },
				documentRef,
			})
		).resolves.toBe(true);

		expect(writeText).toHaveBeenCalledWith('Epsilon citation');
		expect(documentRef.execCommand).toHaveBeenCalledWith('copy');
		expect(remove).toHaveBeenCalled();
	});

	it('throws when document API is unavailable', async () => {
		await expect(
			copyTextToClipboard('Delta citation', {
				navigatorRef: {},
				documentRef: {}, // no createElement or body
			})
		).rejects.toThrow('Clipboard API unavailable');
	});

	it('rejects when the fallback copy command fails', async () => {
		const remove = jest.fn();
		const documentRef = {
			createElement: jest.fn(() => ({
				setAttribute: jest.fn(),
				style: {},
				select: jest.fn(),
				remove,
			})),
			body: { appendChild: jest.fn() },
			execCommand: jest.fn(() => false),
		};

		await expect(
			copyTextToClipboard('Gamma citation', {
				navigatorRef: {},
				documentRef,
			})
		).rejects.toThrow('Clipboard copy command failed');
		expect(remove).toHaveBeenCalled();
	});

	it('preserves the original rejection as the error cause', async () => {
		// The modern API refused and the fallback was never available. Without a
		// cause the caller sees only "unavailable" and loses the reason for the
		// refusal — NotAllowedError, non-secure context, unfocused document.
		const refusal = new DOMException(
			'Write permission denied.',
			'NotAllowedError'
		);
		const writeText = jest.fn().mockRejectedValue(refusal);

		// toBe, not toMatchObject: the latter compares structurally, so a
		// DIFFERENT DOMException with the same message and name would satisfy
		// it. Reference equality is what proves the original was carried
		// through rather than a lookalike reconstructed downstream.
		const rejection = await copyTextToClipboard('X', {
			navigatorRef: { clipboard: { writeText } },
			documentRef: {},
		}).catch((error) => error);

		expect(rejection.message).toBe('Clipboard API unavailable');
		expect(rejection.cause).toBe(refusal);
	});

	it('preserves the original rejection when the fallback ALSO fails', async () => {
		// The path that actually matters, and the one the test above cannot
		// reach: writeText refuses, then execCommand fails too. Without its own
		// assertion, reverting the second `cause` would leave the suite green.
		const refusal = new DOMException(
			'Write permission denied.',
			'NotAllowedError'
		);
		const writeText = jest.fn().mockRejectedValue(refusal);
		const textarea = {
			setAttribute: jest.fn(),
			style: {},
			select: jest.fn(),
			remove: jest.fn(),
		};

		const rejection = await copyTextToClipboard('X', {
			navigatorRef: { clipboard: { writeText } },
			documentRef: {
				createElement: jest.fn(() => textarea),
				body: { appendChild: jest.fn() },
				execCommand: jest.fn(() => false),
			},
		}).catch((error) => error);

		expect(rejection.message).toBe('Clipboard copy command failed');
		expect(rejection.cause).toBe(refusal);
	});
});
