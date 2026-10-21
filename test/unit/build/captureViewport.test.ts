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
		expect(run('captureClipProblems({ viewportHeight: 2110, bottoms: [2109.98] })')).toEqual([]);
	});

	it('fails a capture taken with part of the element below the viewport', () => {
		const problems = run('captureClipProblems({ viewportHeight: 1200, bottoms: [2109.98] })') as string[];
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/reaches 2110px but the viewport is 1200px/);
	});

	it('fails when growing the viewport changed the element layout', () => {
		const problems = run(
			`captureClipProblems({ viewportHeight: 2110, bottoms: [2000], layoutBefore: 'a', layoutAfter: 'b' })`,
		) as string[];
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/changed the element's layout/);
	});

	it('passes when the layout fingerprints match', () => {
		expect(
			run(`captureClipProblems({ viewportHeight: 2110, bottoms: [2000], layoutBefore: 'a', layoutAfter: 'a' })`),
		).toEqual([]);
	});
});
