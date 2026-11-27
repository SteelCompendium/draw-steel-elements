// src/elements/display/prose.ts -- SC-391: the internal PROSE card family (`ds-prose`).
//
// Nine compendium types are plain markdown prose with no `ds-*` fence and no SDK model
// (skill, skill-group, monster group lore, saint, god, chapter, project, movement,
// negotiation -- `PROSE_TYPES`, typeAdapters.ts). Before this family `ds-scc` answered
// every one of those 219 entries with the "has no renderer in this plugin" card. They now
// reuse the rule card's whole path: `genericNoteAdapter` builds a `GenericNote {name, type,
// body}` from the resolved file, `DisplayCardView` draws it. Only the Steel composition
// differs from `genericLayout` (rule), which is deliberately NOT touched -- its frozen
// shots stay byte-identical.
//
// The composition is keyed by the entry's `type`:
//  - eyebrow = a plain type label ("Skill", "Monster group", ...) and a per-type crest. A
//    richer, data-driven eyebrow ("God . Vasloria") is out of scope (SC-391 owner decision).
//  - chapters render COMPACT: a chapter entry is the chapter's leftover prose, from empty up
//    to ~156 KB, so the card shows the first paragraph plus an "Open chapter" link to the
//    synced note. Every other type renders its full body.
//
// The family id is `prose`, deliberately NOT `negotiation`/`project`/`skills`: `ds-scc`
// re-stamps `data-dse-element` to the id of the family that rendered, and those three ids
// carry element-scoped tracker CSS (45 + 6 + 4 rules) that must not land on a reference card.
import type { CardLayout, SteelBand } from '@/elements/shared/CardLayout';
import { titleCase } from '@/elements/shared/CardLayout';
import { stampControl } from '@/framework/kit/controlId';
import type { RefSource } from '@/elements/shared/withReference';
import { PROSE_TYPES } from '@/services/typeAdapters';
import type { GenericNote, ProseType } from '@/services/typeAdapters';

interface ProseTypeStyle {
	eyebrow: string;
	/** A canonical Lucide icon id (pinned by test/unit/kit/crestIconValidity.test.ts). */
	crest: string;
}

/**
 * Per-type eyebrow + crest. Keyed by `ProseType`, so adding a type to PROSE_TYPES without a
 * row here is a compile error. `project` is the one row expected to graduate to its own
 * dedicated composition later (SC-704) without touching the family.
 */
export const PROSE_TYPE_STYLE: Record<ProseType, ProseTypeStyle> = {
	skill: { eyebrow: 'Skill', crest: 'wrench' },
	'skill-group': { eyebrow: 'Skill group', crest: 'layers' },
	monster: { eyebrow: 'Monster group', crest: 'skull' },
	saint: { eyebrow: 'Saint', crest: 'sparkles' },
	god: { eyebrow: 'God', crest: 'sun' },
	chapter: { eyebrow: 'Chapter', crest: 'book-open' },
	project: { eyebrow: 'Project', crest: 'hourglass' },
	movement: { eyebrow: 'Movement', crest: 'footprints' },
	negotiation: { eyebrow: 'Negotiation', crest: 'handshake' },
};

/** The type's plain label ("Skill group"); a type outside the table (never reached by
 *  ds-scc, which only routes PROSE_TYPES here) falls back to title-cased, or nothing. */
export function proseLabel(type: string): string | undefined {
	return styleFor(type)?.eyebrow ?? (type ? titleCase(type) : undefined);
}

function styleFor(type: string): ProseTypeStyle | undefined {
	return (PROSE_TYPES as readonly string[]).includes(type) ? PROSE_TYPE_STYLE[type as ProseType] : undefined;
}

/** A block that opens with one of these is not "a paragraph": a heading, table, quote,
 *  list, code fence or raw HTML. */
const NON_PARAGRAPH_START = /^(#{1,6}\s|\||>|[-*+]\s|\d+[.)]\s|```|~~~|<)/;

/**
 * The first plain paragraph of a markdown body: the first blank-line-separated block that
 * is not a heading, table, blockquote, list, fence or HTML. Undefined when there is none
 * (an empty body, or one that opens with nothing but structure). Used by the compact
 * chapter card.
 */
export function firstParagraph(body: string): string | undefined {
	for (const block of body.split(/\n[ \t]*\n/)) {
		const trimmed = block.trim();
		if (trimmed && !NON_PARAGRAPH_START.test(trimmed)) return trimmed;
	}
	return undefined;
}

function fullBody(m: GenericNote): SteelBand[] {
	if (!m.body || !m.body.trim()) return [];
	return [
		{
			render: (container, renderMarkdown) => renderMarkdown(m.body, container.createDiv({ cls: 'dse-card__body' })),
		},
	];
}

/**
 * Compact chapter body: the first paragraph (if the chapter has one) and, when the card was
 * resolved from a real vault file, an "Open chapter" link to it. A body with no plain
 * paragraph (one that opens with a table, say) shows the link alone. The link is the same shape
 * `rewriteSccAnchors` gives a resolved `scc.v1:` link -- an `a.internal-link` carrying the
 * file path in `data-href` -- so Obsidian's own click handling opens the note (plain click,
 * Ctrl/Cmd-click for a new tab) and hover preview works. No file -> no link.
 */
function chapterBody(m: GenericNote, source?: RefSource): SteelBand[] {
	// An empty chapter (two of them, the class intro pages) is a title-only card: there is
	// nothing in its synced note to open either.
	if (!m.body || !m.body.trim()) return [];
	const paragraph = firstParagraph(m.body);
	const path = source?.file?.path;
	if (!paragraph && !path) return [];
	return [
		{
			render: async (container, renderMarkdown) => {
				const body = container.createDiv({ cls: 'dse-card__body' });
				if (paragraph) await renderMarkdown(paragraph, body);
				if (path) {
					const p = body.createEl('p');
					const link = p.createEl('a', {
						cls: 'internal-link dse-prose__open',
						text: 'Open chapter',
						attr: { href: path, 'data-href': path, rel: 'noopener' },
					});
					// SC-408 control id: the e2e drive clicks it in a real Obsidian (e2e/manifest/prose.ts).
					stampControl(link, 'prose.open-chapter');
				}
			},
		},
	];
}

export const proseLayout: CardLayout<GenericNote> = {
	title: (m) => m.name,
	// Same as genericLayout: the GenericNote body IS the card body on every path.
	body: (m) => m.body,
	useSourceBody: false,
	steel: {
		// Suppressed when it would restate the title (a god/skill that shares its type's
		// name), like the rule card's guard -- the crest alone then carries the family.
		eyebrow: (m) => {
			const label = proseLabel(m.type);
			return label !== undefined && label.toLowerCase() === m.name.toLowerCase() ? undefined : label;
		},
		crestIcon: (m) => styleFor(m.type)?.crest ?? 'book-open',
		bands: (m, source) => (m.type === 'chapter' ? chapterBody(m, source) : fullBody(m)),
	},
};
