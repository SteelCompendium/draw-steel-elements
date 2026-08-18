# Common Element Fields

Some elements can be collapsed, using three fields you can set on the block itself:

| Field              | Type      | Description                                                                                | Required | Default Value |
|--------------------|-----------|--------------------------------------------------------------------------------------------|----------|---------------|
| `collapsible`      | `boolean` | If `false`, the element cannot be collapsed — no collapse control is shown.                 | No       | `true`        |
| `collapsed`        | `boolean` | If `true`, the element starts collapsed when the note is opened.                            | No       | `false`       |
| `collapse_default` | `boolean` | The same thing as `collapsed`, in the older spelling. Kept so existing notes keep working.  | No       | `false`       |

`collapsed` and `collapse_default` mean exactly the same thing. If a block somehow sets
both, `collapsed` wins.

Where they apply:

- **[Skills](skills-element.md)** honours `collapsible` and `collapse_default` on its own
  disclosure header.
- Every element with the **standard menu panel** — currently the
  **[Statblock](statblock-element.md)**, the **[Hero Sheet](hero-suite.md)** and the
  **[Stamina Bar](stamina-bar.md)** — honours all three. Collapsing one of these shows a
  single line with the element's type, its name and an expand button, and the panel's
  collapse control disappears while it is collapsed so there is only ever one way back.
  If `collapsible: false` leaves the panel with nothing in it, no panel is shown at all.

Collapsing something this way is remembered for the rest of your Obsidian session and is
**never written into your note**. It also never affects printing: a collapsed element prints
in full, and the menu panel is absent from print and from an exported PDF.

Blocks that don't list these fields follow the global defaults on the
**[Element defaults](settings.md#element-defaults)** settings page — **Collapsible by
default** and **Start collapsed** — so you can decide once for your whole vault instead of
writing the fields into every block.

Other elements have their own collapsing behaviour built in (statblock feature bands, for
example) and ignore these two fields.
