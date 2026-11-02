// e2e/x11-pointer.mjs - SC-539: park the real X pointer of the e2e runner's PRIVATE Xvfb at 0,0.
//
// WHY. Every shard's Obsidian window lives on one private Xvfb with no window manager, each
// 1440x1100 at +288+200 (size: setWindowSize in driver/session.ts; Chromium centres it on the
// 1600x1200 screen run.mjs asks for). Xvfb starts its pointer at the screen centre (800,600),
// which is INSIDE that rectangle. `dse.hover` places a synthetic CDP pointer, not the X pointer;
// when another shard's window maps or unmaps over (800,600), X sends our window a real
// Leave/Enter, Chromium moves hover to the X pointer and drops the synthetic one, `:hover` is
// lost and the chrome panel stays hidden (CHR-F02 timed out waiting for it; SC-529 / SC-534
// CHR-L01 are the same). At 0,0 no window can be under the pointer. If the window size or
// position ever changes, the pointer must stay outside the new rectangle.
//
// HOW, with no dependency. A raw X11 core-protocol client over the display's unix socket
// (/tmp/.X11-unix/X<n>; Xvfb runs without -auth and with -nolisten tcp, so setup needs no cookie):
// connection setup -> root window id, then CreateWindow + MapWindow (a 1x1 InputOnly "keeper"
// at 0,0), WarpPointer to root 0,0, QueryPointer to read it back. The core protocol is frozen.
//
// THE KEEPER (measured, Xvfb 21.1 / this host). The warp only sticks while at least one window
// is mapped on the display: on a bare Xvfb WarpPointer is a no-op (pointer stays 800,600), and
// when the last mapped window goes away the pointer snaps back to the centre. Obsidian windows
// come and go between spec files, so the returned handle keeps this connection (and its 1x1
// window at 0,0, which no Obsidian window covers) open until `release()`. Closing the socket
// destroys the window.
//
// Only ever call this with the runner's own private display: with --headed the pointer is a
// person's real one.
import net from 'node:net';

const DISPLAY_RE = /^:(\d+)(?:\.\d+)?$/;

/**
 * Park the pointer of the X display `display` (e.g. ":200") at 0,0.
 * Resolves `{ release() }` once QueryPointer reads back 0,0; rejects with an Error whose message is
 * the reason otherwise. Never hangs: everything is bounded by `timeoutMs`.
 */
export function parkPointer(display, { timeoutMs = 2000 } = {}) {
	const m = DISPLAY_RE.exec(display);
	if (!m) return Promise.reject(new Error(`unrecognised display name ${JSON.stringify(display)}`));
	const sockPath = `/tmp/.X11-unix/X${m[1]}`;
	return new Promise((resolve, reject) => {
		const sock = net.createConnection(sockPath);
		let buf = Buffer.alloc(0);
		let phase = 'connect';
		let done = false;
		const finish = (err, value) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			if (err) {
				sock.destroy();
				reject(err);
			} else {
				sock.unref(); // the keeper must not hold the runner's event loop open
				resolve(value);
			}
		};
		const timer = setTimeout(() => finish(new Error(`timed out after ${timeoutMs} ms (${phase})`)), timeoutMs);
		sock.on('error', (e) => finish(new Error(`${sockPath}: ${e.code ?? e.message} (${phase})`)));
		sock.on('close', () => finish(new Error(`${sockPath}: connection closed (${phase})`)));
		sock.on('connect', () => {
			phase = 'setup';
			// byte order 'l' (little endian), protocol 11.0, no authorization name/data.
			const req = Buffer.alloc(12);
			req.write('l', 0, 'latin1');
			req.writeUInt16LE(11, 2);
			sock.write(req);
		});
		sock.on('data', (chunk) => {
			buf = Buffer.concat([buf, chunk]);
			try {
				pump();
			} catch (e) {
				finish(e instanceof Error ? e : new Error(String(e)));
			}
		});

		let ids = null; // { root, wid } once setup is read
		function pump() {
			if (phase === 'setup') {
				if (buf.length < 8) return;
				const status = buf[0];
				const total = 8 + buf.readUInt16LE(6) * 4;
				if (buf.length < total) return;
				if (status !== 1) {
					const why = buf.subarray(8, 8 + buf[1]).toString('latin1');
					throw new Error(`X server refused the connection (${status === 2 ? 'authenticate' : 'failed'}: ${why})`);
				}
				const base = buf.readUInt32LE(12); // resource-id-base
				const vendorLen = buf.readUInt16LE(24);
				const formats = buf[29];
				const screen0 = 8 + 32 + ((vendorLen + 3) & ~3) + formats * 8;
				if (total < screen0 + 40) throw new Error('setup reply has no screen');
				ids = { root: buf.readUInt32LE(screen0), wid: base | 1 };
				buf = buf.subarray(total);
				phase = 'request';
				sendRequests();
			}
			// After the requests, the stream is 32-byte units: error (0), reply (1), event (>=2).
			while (phase === 'request' && buf.length >= 32) {
				const unit = buf.subarray(0, 32);
				buf = buf.subarray(32);
				if (unit[0] === 0) throw new Error(`X error ${unit[1]} on request ${unit.readUInt16LE(2)} (opcode ${unit[10]})`);
				if (unit[0] !== 1) continue; // an event: not selected, but never let one confuse the readback
				const x = unit.readInt16LE(16);
				const y = unit.readInt16LE(18);
				if (x !== 0 || y !== 0) throw new Error(`QueryPointer reads ${x},${y} after WarpPointer to 0,0`);
				phase = 'done';
				finish(null, {
					release() {
						sock.destroy();
					},
				});
			}
		}

		function sendRequests() {
			// CreateWindow (1): 1x1 InputOnly at 0,0, parent = root, depth/visual copied.
			const create = Buffer.alloc(32);
			create[0] = 1;
			create.writeUInt16LE(8, 2);
			create.writeUInt32LE(ids.wid, 4);
			create.writeUInt32LE(ids.root, 8);
			create.writeInt16LE(0, 12);
			create.writeInt16LE(0, 14);
			create.writeUInt16LE(1, 16);
			create.writeUInt16LE(1, 18);
			create.writeUInt16LE(0, 20); // border
			create.writeUInt16LE(2, 22); // class InputOnly
			// visual 0 (copy), value-mask 0
			// MapWindow (8)
			const map = Buffer.alloc(8);
			map[0] = 8;
			map.writeUInt16LE(2, 2);
			map.writeUInt32LE(ids.wid, 4);
			// WarpPointer (41): src None, dst root, dst-x 0, dst-y 0
			const warp = Buffer.alloc(24);
			warp[0] = 41;
			warp.writeUInt16LE(6, 2);
			warp.writeUInt32LE(0, 4);
			warp.writeUInt32LE(ids.root, 8);
			// QueryPointer (38) on root
			const query = Buffer.alloc(8);
			query[0] = 38;
			query.writeUInt16LE(2, 2);
			query.writeUInt32LE(ids.root, 4);
			sock.write(Buffer.concat([create, map, warp, query]));
		}
	});
}
