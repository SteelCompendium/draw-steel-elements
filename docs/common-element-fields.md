# Common Element Fields

Some elements can be collapsed, using two fields you can set on the block itself:

| Field              | Type      | Description                                                                     | Required | Default Value |
|--------------------|-----------|---------------------------------------------------------------------------------|----------|---------------|
| `collapsible`      | `boolean` | If `true`, the element can be collapsed by clicking its header.                 | No       | `true`        |
| `collapse_default` | `boolean` | If `true`, the element starts collapsed when the note is opened.                | No       | `false`       |

Where they apply:

- **[Skills](skills-element.md)** honours both fields.
- **[Stamina Bar](stamina-bar.md)** is always collapsible, and honours
  `collapse_default`.

Blocks that don't list these fields follow the global defaults on the
**[Element defaults](settings.md#element-defaults)** settings page — **Collapsible by
default** and **Start collapsed** — so you can decide once for your whole vault instead of
writing the fields into every block.

Other elements have their own collapsing behaviour built in (statblock feature bands, for
example) and ignore these two fields.
