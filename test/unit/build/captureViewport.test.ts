import { execFileSync } from 'child_process';
import path from 'path';

// SC-349: the harness's "no capture may come out clipped" arithmetic
// (`visual-harness/capture-viewport.mjs`). It is an ESM `.mjs` module and this repo's jest
// config has no ESM support, so — like `obsidianLightIslandCompare.test.ts` — these tests
// spawn a real `node --input-type=module` subprocess and read back JSON.

const repoRoot = path.resolve(__dirname, '../../..');
const mod = path.join(repoRoot, 'visual-harness/capture-viewport.mjs');

function run(expr: string): unknown {
	const stdout = execFileSync(
		'node',
		[
			'--input-type=module',
			'-e',
			`import { enlargedViewportHeight, captureClipProblems } from ${JSON.stringify(mod)};
			 console.log(JSON.stringify(${expr}));`,
		],
		{ cwd: repoRoot, encoding: 'utf8' },
	);
	return JSON.parse(stdout.trim().split('\n').pop() as string);
}

describe('SC-349 — enlargedViewportHeight', () => {
	it('grows to the ceil of the lowest bottom edge when the capture is taller than the viewport', () => {
		// the skills print twin: #mount 32px down and 2077.98px tall in a 1200px viewport
		expect(run('enlargedViewportHeight(1200, [32 + 2077.984375])')).toBe(2110);
	});

	it('takes the lowest of several bottoms (a full-page shot with a sibling modal)', () => {
		expect(run('enlargedViewportHeight(1200, [900, 3000.2, 1100])')).toBe(3001);
	});

	it('leaves a capture that already fits alone, including one exactly as tall as the viewport', () => {
		expect(run('enlargedViewportHeight(1200, [1199.5])')).toBeNull();
		expect(run('enlargedViewportHeight(1200, [1200])')).toBeNull();
	});

	it('does nothing for no measurable bottoms', () => {
		expect(run('enlargedViewportHeight(1200, [])')).toBeNull();
		expect(run('enlargedViewportHeight(1200, [NaN])')).toBeNull();
	});
});

describe('SC-349 — captureClipProblems (the in-run gate)', () => {
	it('passes a capture whose whole element sits inside the viewport it was taken at', () => {
		expect(run('captureClipProblems({ viewportHeight: 2110, mountTop: 32, mountBottom: 2109.98 })')).toEqual([]);
	});

	it('fails a capture taken with part of the element below the viewport', () => {
		const problems = run(
			'captureClipProblems({ viewportHeight: 1200, mountTop: 32, mountBottom: 2109.98 })',
		) as string[];
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/reaches 2110px but the viewport is 1200px/);
	});

	it('fails a capture whose element starts above the viewport (the page was scrolled)', () => {
		const problems = run(
			'captureClipProblems({ viewportHeight: 1200, mountTop: -729, mountBottom: 1136 })',
		) as string[];
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/starts 729px above the top of the viewport/);
	});

	it('fails a full-page shot behind a scroller that hides overflow, and ignores it for an element shot', () => {
		const hidden = `hiddenOverflow: ['div.markdown-preview-view (overflow-y auto) hides 23864px']`;
		const problems = run(
			`captureClipProblems({ viewportHeight: 1200, mountTop: 0, mountBottom: 1200, fullPage: true, ${hidden} })`,
		) as string[];
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/hides 23864px/);
		expect(
			run(`captureClipProblems({ viewportHeight: 1200, mountTop: 0, mountBottom: 1200, ${hidden} })`),
		).toEqual([]);
	});

	it('fails when growing the viewport changed the element layout, and passes when it did not', () => {
		const base = 'viewportHeight: 2110, mountTop: 32, mountBottom: 2000';
		const problems = run(
			`captureClipProblems({ ${base}, layoutBefore: 'a', layoutAfter: 'b' })`,
		) as string[];
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/changed the element's layout/);
		expect(run(`captureClipProblems({ ${base}, layoutBefore: 'a', layoutAfter: 'a' })`)).toEqual([]);
	});
});
