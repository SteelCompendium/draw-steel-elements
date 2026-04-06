# Reading Mode Only -- No Live Preview

**Date:** 2024-08-18
**Status:** accepted

## Context

Obsidian has two rendering modes: Reading mode (renders full HTML from
markdown) and Live Preview (uses CodeMirror 6 editor with inline rendering).
The plugin needs to decide which modes to support.

## Options Considered

### Support Reading mode only
- Pros: Simpler implementation, full DOM control via `MarkdownPostProcessorContext`, faster development
- Cons: Users must switch to Reading mode to see rendered elements, poor UX for users who prefer Live Preview

### Support both Reading and Live Preview
- Pros: Better user experience, works in the mode users already use
- Cons: Live Preview uses CodeMirror 6 with a completely different rendering pipeline (EditorView decorations), doubles implementation complexity, CM6 API is less documented

## Decision

Support Reading mode only. The plugin registers code block processors via
Obsidian's `registerMarkdownCodeBlockProcessor` API, which only fires in
Reading mode.

## Consequences

- Plugin README prominently warns about this limitation
- Users must switch to Reading mode to see rendered elements
- Implementation is straightforward -- one rendering pipeline to maintain
- Live Preview support is listed as future work but hasn't been prioritized

## Outcome

This has been the primary user-facing limitation. However, the complexity
savings are significant -- maintaining one rendering pipeline for the number
of element types in this plugin (11+) is already substantial. Live Preview
support would roughly double the rendering code. The tradeoff remains
acceptable given the project's scope and contributor count.
