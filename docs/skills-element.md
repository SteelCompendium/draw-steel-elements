# Skills Element

The Skills Element is a tool designed to parse and display a character's skills within Obsidian. It allows you to 
define a set of skills and custom skills using YAML syntax, and then renders this information in an organized layout 
for easy reference during gameplay or writing.

## Usage

To use the Skills Element, insert a code block with the language identifier `ds-skills` in your Obsidian note, and then 
define your skills using YAML syntax inside the code block.

### Example skills:

```
~~~ds-skills
skills:
  - Heal
  - Sneak
custom_skills:
  - name: Dance
    has_skill: true
    skill_group: Interpersonal
    description: Moving and groovin' to the beat.
~~~
```

This code block will render the character's skills and custom skills in a formatted display.

![Skills](Media/skills.png)

## Field Definitions

The Skills Element supports all three
[common element fields](common-element-fields.md) (`collapsible`, `collapsed` and
`collapse_default`). As of 7.0.0 it also carries the standard
[element menu](common-element-fields.md#the-menu), so it has two ways to fold: the "Skills"
disclosure header inside the card, which hides the skill list, and the menu's collapse
control, which folds the whole block to one line (`SKILLS (12 selected)`). The three fields
drive both.

Below is a detailed description of each field used in the skills element, including their types, default values, and whether they are required.

| Field                | Type                     | Description                                                                  | Required | Default Value |
|----------------------|--------------------------|------------------------------------------------------------------------------|----------|---------------|
| `skills`             | `array` of `string`      | A list of standard skills the character possesses.                           | No       | `[]`          |
| `custom_skills`      | `array` of `CustomSkill` | A list of custom skills defined by the user. See **CustomSkill** below.      | No       | `[]`          |
| `only_show_selected` | `boolean`                | If `true`, will hide skills that are not selected (Group headers still show) | No       | `false`       |
| `style`              | `string`                 | The layout: `list`, `ledger` or `chips`. See **Layouts** below.              | No       | `list`        |

### Notes:

- The `skills` field is an array of skill names (strings) that the character has.
- The `custom_skills` field allows you to define custom skills with additional properties.

## Layouts (`style`)

Under the Steel theme the skill list can render in three layouts, chosen per block:

- **`list`** (the default) — the classic one-column checklist, exactly as it has always
  rendered.
- **`ledger`** — the skill groups become a responsive grid of recessed panels, each with a
  small-caps group title and an **owned/total tally** (`3/11`) in its header; owned skills
  carry a solid ◆ mark and full-weight ink. Roughly three columns in a normal note pane,
  one column in a sidebar leaf.
- **`chips`** — each group is a thin titled band over an inline-wrapped run of skill chips:
  owned skills are raised steel chips with a solid ◆, unowned skills are faint ghost
  chips. The whole catalog fits in about one screen.

```
~~~ds-skills
style: chips
skills:
  - Heal
  - Sneak
~~~
```

Print and export always use the classic list form regardless of `style` — paper gets the
reference layout.

## Showing/hiding unowned skills

`only_show_selected: true` starts the block with unowned skills hidden (in the `list`
layout this is the classic filtered rendering; `ledger` and `chips` keep their group
panels and tallies and just omit the unowned entries — the tally still reads `3/11`, so
you can see how much of the catalog is folded away).

The block's [element menu](common-element-fields.md#the-menu) also carries an **eye
toggle** ("Hide unowned skills" / "Show unowned skills"), so you can flip the same state
at the table without editing the note. The YAML key sets the starting state; the toggle's
choice wins for the rest of the session (per block, never written back to the note —
exactly like the collapse controls).

## CustomSkill Definitions

Each custom skill in the `custom_skills` array can be defined using the following fields:

| Field         | Type      | Description                                                                          | Required | Default Value |
|---------------|-----------|--------------------------------------------------------------------------------------|----------|---------------|
| `name`        | `string`  | The name of the custom skill.                                                        | **Yes**  | N/A           |
| `has_skill`   | `boolean` | Indicates whether the character possesses this custom skill.                         | No       | `true`        |
| `skill_group` | `string`  | The skill group this custom skill belongs to (e.g., "Interpersonal", "Exploration"). | No       | `undefined`   |
| `description` | `string`  | A brief description of the custom skill.                                             | No       | `undefined`   |

### Notes:

- If `has_skill` is set to `false`, the skill will be displayed as not possessed by the character.
- `skill_group` helps categorize custom skills under existing or new skill groups.
- If `skill_group` matches an existing skill group, the custom skill will be displayed under that group; otherwise, it will be placed under "Custom Skills".
