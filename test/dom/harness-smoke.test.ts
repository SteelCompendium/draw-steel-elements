// Proves the dom project runs under jsdom.
describe('harness smoke (dom project)', () => {
	test('jsdom provides a document', () => {
		expect(typeof document).toBe('object');
		expect(document.createElement('div').tagName).toBe('DIV');
	});

	test('jsdom provides HTMLElement', () => {
		expect(document.createElement('span')).toBeInstanceOf(HTMLElement);
	});
});
