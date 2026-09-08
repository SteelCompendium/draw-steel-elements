// visual-harness/obsidian-app-css.pin.mjs — SC-202 r6a.
//
// THE committed pin for the fetch-and-pin recipe (`fetch-obsidian-app-css.mjs`): a version
// and a sha256, nothing proprietary. Obsidian's `app.css` itself is never committed — not
// even a transcribed excerpt (decisions.md, the 2026-09-02 ruling) — so this file is the
// entire durable record of which sheet the host-leak sweeps (`visual-harness/shoot.mjs`)
// are gated against.
//
// NAMED DIFFERENTLY FROM `obsidian-host-pin.mjs` (SC-205) ON PURPOSE — the two pin DIFFERENT
// things and answer different questions:
//   * `obsidian-host-pin.mjs`'s `PINNED_OBSIDIAN` is a version FLOOR for a hand-maintained
//     MODEL (`OBSIDIAN_HOST_BUTTON_CSS` in shoot.mjs) of six button-reaching rules — "don't
//     compare the model against anything older than this."
//   * This file is an exact CONTENT pin (one specific version's app.css, by hash) for the
//     REAL sheet the five `assert*HostLeak` sweeps inject wholesale — "fetch exactly this."
// A single merged pin would force both concerns to move together for no reason; item 7 of
// the r6a brief asks for this reasoning explicitly if the two are kept separate, which they
// are.
//
// PIN HISTORY (all three verified against the actual GitHub release asset before being
// written here — see the r6a report for the verification transcripts):
//   * 2026-09-02 ruling (decisions.md): starting pin Obsidian 1.13.7, app.css sha256
//     `f612f1e8…`.
//   * 2026-09-07, r6a round 1: the owner asked for 1.14.0 (`013ed841…`) instead, reasoning
//     every SC-202 round 1-5 host-leak proof had actually run against the INSTALLED 1.14.0
//     sheet. Verification (mandatory, brief §2 item 1) found NO public GitHub release for
//     v1.14.0 at all in `obsidianmd/obsidian-releases` (confirmed: enumerated every release,
//     newest is v1.13.8, which itself carries no desktop asset) — the pinned public-URL
//     fetch scheme has nothing to fetch. Implementation STOPPED (NEEDS_CONTEXT) rather than
//     silently substituting a different source.
//   * 2026-09-07, r6a round 2 (THIS pin): the coordinator confirmed 1.14.0 is an Obsidian
//     INSIDER build with no public release asset, and reinstated the 2026-09-02 ruling's
//     original starting pin, 1.13.7. Re-verified end to end at implementation time: the
//     pinned URL's `.asar.gz` sha256, its gunzipped `.asar` sha256, and the extracted
//     `app.css` sha256 (637,090 bytes) all match exactly. CONSEQUENCE: the installed
//     Obsidian on the machine this was built on is 1.14.0, genuinely newer than this pin —
//     the warn-on-drift line in `fetch-obsidian-app-css.mjs` fires on that machine by
//     design (see visual-harness/README.md → "Obsidian app.css pin" for the bump
//     procedure). Bumping this pin to track a newer Obsidian is a deliberate act with its
//     own sanctioned rebaseline once the real sheet is actually turned on in the harness
//     (SC-202 round 6b onward) — see decisions.md's 2026-09-02 ruling.
export const OBSIDIAN_APP_CSS_PIN = Object.freeze({
	obsidianVersion: '1.13.7',
	appCssSha256: 'f612f1e8f36486fa57f3b8bd45f0c848409d5b168002e757a13c6d286a7b4c41',
	asarGzSha256: '69253e39aa0b980e3cf96e9e8a8a4bed6b6481ef7021cd762f67872662d8d25a',
	source: 'https://github.com/obsidianmd/obsidian-releases/releases/download/v1.13.7/obsidian-1.13.7.asar.gz',
});
