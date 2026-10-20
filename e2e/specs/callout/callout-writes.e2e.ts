// SC-455: a DSE block inside a callout / blockquote writes back through the `> ` prefix (before this
// it rendered and accepted clicks but never saved, and said nothing). Driven with a real pointer click
// on ds-stamina-bar's Catch Breath, in Reading view AND Live Preview, then asserted on the NOTE BYTES:
// the edit landed, every line the block wrote still carries its own prefix, both fence lines are
// byte-identical, and everything else in the note (callout header, the other quoted lines, the
// other block) is unchanged. A fence inside a list item stays unsupported - and now says so.
//   Callout/callout.md  [!note] with text above and below one block (12/30, 3 of 6)
//   Callout/nested.md   a [!tip] callout inside a [!note] callout, `> > ` on every block line
//   Callout/quote.md    a plain blockquote (Live Preview does not draw a block in one: Reading view only)
//   Callout/twins.md    two IDENTICAL blocks in one callout
//   Callout/list.md     the block's fence indented inside a list item (unsupported shape); list-lp.md is the same
//                       note for the Live Preview test (the "not saved" Notice is rate-limited per note, 5 s)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { fencesOf, skeletonOf } from '../../driver/invariants';
import { readFixture } from '../../driver/state';

const BAR = 'ds-stamina-bar';
type Mode = 'reading' | 'live-preview';

/** The lines of the n-th fenced block of a note (fence lines included), prefix and all. */
const blockLines = (text: string, n = 0): string[] => fencesOf(text)[n].text.split('\n');

/**
 * Click Catch Breath on the `n`-th block of `note`, wait for the one write, and assert the bytes.
 * `prefix` is what every line of that block starts with in the fixture ("> ", "> > ").
 */
async function catchBreathThroughPrefix(note: string, mode: Mode, prefix: string, n = 0): Promise<void> {
	await dse.openNote(note, { mode });
	const bar = dse.block(BAR, n);
	const w = await dse.waitForWrite(note, () => dse.click(bar.control('recov.catch-breath')));
	expect(w.count).toBe(1);

	const before = readFixture(note);
	const after = await dse.noteText(note);
	const fixtureBlock = blockLines(before, n);
	const written = blockLines(after, n);
	// The edit landed, in the block's own prefix.
	expect(written).toContain(`${prefix}current_stamina: 22`);
	expect(written).toContain(`${prefix}recoveries: 2`);
	// Every line of the block - fences included - is still inside the quote, and both fence lines are exactly as they were.
	expect(written.every((l) => l.startsWith(prefix.trimEnd()))).toBe(true);
	expect(written[0]).toBe(fixtureBlock[0]);
	expect(written.at(-1)).toBe(fixtureBlock.at(-1));
	// Nothing else moved: the callout header, the other quoted lines, the text around (every fence
	// replaced by a placeholder), and every OTHER block byte for byte.
	expect(skeletonOf(after).text).toBe(skeletonOf(before).text);
	for (let i = 0; i < fencesOf(before).length; i++) if (i !== n) expect(blockLines(after, i)).toEqual(blockLines(before, i));
}

describe('a block inside a callout / blockquote saves its changes', () => {
	it('[CALL-R01] Reading view, callout with text above and below: the click lands and every block line keeps `> `', async () => {
		await catchBreathThroughPrefix('Callout/callout.md', 'reading', '> ');
	});

	it('[CALL-R02] Reading view, a callout nested in a callout: `> > ` on every written line', async () => {
		await catchBreathThroughPrefix('Callout/nested.md', 'reading', '> > ');
	});

	it('[CALL-R03] Reading view, a plain blockquote', async () => {
		await catchBreathThroughPrefix('Callout/quote.md', 'reading', '> ');
	});

	it('[CALL-R04] Reading view, two IDENTICAL blocks in one callout: a click on the second writes only the second', async () => {
		await catchBreathThroughPrefix('Callout/twins.md', 'reading', '> ', 1);
	});

	it('[CALL-L01] Live Preview, callout with text above and below: the click lands and every block line keeps `> `', async () => {
		await catchBreathThroughPrefix('Callout/callout.md', 'live-preview', '> ');
	});

	it('[CALL-L02] Live Preview, a callout nested in a callout: `> > ` on every written line', async () => {
		await catchBreathThroughPrefix('Callout/nested.md', 'live-preview', '> > ');
	});

	it('[CALL-L03] Live Preview, two IDENTICAL blocks in one callout: a click on the second writes only the second', async () => {
		await catchBreathThroughPrefix('Callout/twins.md', 'live-preview', '> ', 1);
	});
});

describe('a block in a shape DSE cannot edit yet says so', () => {
	for (const mode of ['reading', 'live-preview'] as const) {
		it(`[CALL-N0${mode === 'reading' ? 1 : 2}] ${mode === 'reading' ? 'Reading view' : 'Live Preview'}, fence inside a list item: a click shows a "not saved" Notice and the note is untouched`, async () => {
			const note = mode === 'reading' ? 'Callout/list.md' : 'Callout/list-lp.md';
			await dse.openNote(note, { mode });
			const bar = dse.block(BAR);
			await dse.expectNoWrite(note, () => dse.click(bar.control('recov.catch-breath')));
			// The exact unsavable text (not the "changed on disk first" one), and exactly ONE Draw Steel Notice.
			const want = `Draw Steel Elements: a change to a block in ${note.slice('Callout/'.length, -'.md'.length)} was not saved — the plugin can't tell where this block sits in the note (blocks inside lists can't be edited yet).`;
			const dseNotices = `Array.from(document.querySelectorAll('.notice')).map((n) => n.textContent).filter((t) => t.startsWith('Draw Steel Elements:'))`;
			await dse.waitFor(`${dseNotices}.includes(${JSON.stringify(want)})`, 'the "not saved" Notice');
			await dse.settle();
			expect(await dse.page<string[]>(dseNotices)).toEqual([want]);
			expect(await dse.noteText(note)).toBe(readFixture(note));
		});
	}
});
