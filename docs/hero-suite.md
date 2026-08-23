# Hero Trackers

Four small blocks, each tracking one thing about a hero — useful on a
[Canvas character sheet](canvas-character-sheet.md), in a session note, or pinned to the
[sidebar](writing-blocks.md#pinning-a-block-to-the-sidebar).

All of these blocks **write their state back into the note** as you play: spend a Recovery
or a surge and the YAML in the block updates itself. You never have to edit those numbers
by hand.

## Conditions (`ds-conditions`)

A conditions strip for one hero or creature, using the same Conditions manager as the
[initiative tracker](initiative-tracker.md#conditions).

```markdown
~~~ds-conditions
conditions:
  - key: bleeding
    effect: save ends
  - key: slowed
    effect: EoT
  - restrained
~~~
```

![A conditions strip](Media/conditions.png)

Each entry is either a bare condition name or an object with a `key` plus an optional
`effect` (its duration — "save ends", "EoT", "EoE") and `color`. Click **+** to add
conditions, click a condition to remove it.

## Heroic resource (`ds-resource`)

```markdown
~~~ds-resource
class: fury
current: 4
~~~
```

![A heroic resource tracker](Media/heroic-resource.png)

Name the `class` and the block labels itself with that class's resource (Ferocity, Focus,
Piety, Clarity, …), applies its floor, and shows a short reminder of how the resource is
gained. Unknown or missing classes get a generic "Resource" label.

| Field | Required | What it is |
|---|---|---|
| `current` | Yes | The current amount. Can be negative (Clarity). |
| `class` | No | Class name, e.g. `fury`. |
| `type` | No | Override the resource's name — for homebrew, or a class not in the list. |
| `min` / `max` | No | Override the floor; add a ceiling. Without `max` the stepper is unbounded. |

## Surges (`ds-surges`)

```markdown
~~~ds-surges
surges: 2
highest_characteristic: 3
~~~
```

![A surge counter](Media/surges.png)

A surge counter. `highest_characteristic` is optional; when present the panel shows what
each surge is worth ("each = +3 damage").

## Hero Tokens (`ds-tokens`)

```markdown
~~~ds-tokens
label: Session 12 party pool
tokens: 3
~~~
```

![The party's hero token pool](Media/hero-tokens.png)

The party's shared Hero Token pool. Keep **one** of these — in your session note or the
sidebar — and everyone reads the same number. `label` is optional; `tokens` is the count.

## Stamina

The Stamina bar has its own page: [Stamina Bar](stamina-bar.md) (`ds-stamina-bar`),
including Recoveries, Catch Breath, and the Winded and Dying states.
