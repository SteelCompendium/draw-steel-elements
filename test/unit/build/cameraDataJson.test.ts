// SC-406 fix round 1 (MEDIUM-3) — the camera's data.json seeding. `<repo>/data.json` is the live
// plugin data of the demo vault (a symlink to the repo root), so a camera run must put it back
// exactly as found. This is a scripted probe of visual-harness/camera-data-json.cjs, the module
// obsidian-camera.mjs uses (the camera itself needs a display and is not run in jest).
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedExperimental } = require('../../../visual-harness/camera-data-json.cjs');

let dir: string;
let file: string;
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dse-camera-data-'));
	file = path.join(dir, 'data.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('SC-406 camera data.json seeding', () => {
	test('turns the switch on for the run, merged into the existing settings', () => {
		fs.writeFileSync(file, JSON.stringify({ prefs: { textScale: 1.2 }, viewAdoption: false }));
		const seeded = seedExperimental(file);
		expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ prefs: { textScale: 1.2 }, viewAdoption: false, experimental: true });
		seeded.restore();
	});

	test('restore puts back the ORIGINAL BYTES (formatting and all), including after Obsidian rewrote the file mid-run', () => {
		const original = '{\n  "prefs": {"textScale": 1.2},\n  "compendiumLocale": "en"\n}\n';
		fs.writeFileSync(file, original);
		const seeded = seedExperimental(file);
		fs.writeFileSync(file, JSON.stringify({ experimental: true, prefs: { reduceMotion: true } })); // a pref the camera set
		seeded.restore();
		expect(fs.readFileSync(file, 'utf8')).toBe(original);
	});

	test('a file that did not exist is deleted again; restore is idempotent', () => {
		const seeded = seedExperimental(file);
		expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ experimental: true });
		seeded.restore();
		expect(fs.existsSync(file)).toBe(false);
		seeded.restore();
		expect(fs.existsSync(file)).toBe(false);
	});

	test('a file that already has experimental:true comes back byte-identical too', () => {
		const original = '{"experimental":true,"prefs":{}}';
		fs.writeFileSync(file, original);
		const seeded = seedExperimental(file);
		seeded.restore();
		expect(fs.readFileSync(file, 'utf8')).toBe(original);
	});

	test('an unparseable or non-object data.json aborts without touching it', () => {
		for (const bytes of ['{ not json', '[1,2]', 'null', '']) {
			fs.writeFileSync(file, bytes);
			expect(() => seedExperimental(file)).toThrow(/refusing to overwrite/);
			expect(fs.readFileSync(file, 'utf8')).toBe(bytes);
		}
	});
});
