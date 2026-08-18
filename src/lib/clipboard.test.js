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
});
