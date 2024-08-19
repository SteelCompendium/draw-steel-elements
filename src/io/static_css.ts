const static_css : string = `
span.dsa,
code.dsa {
    background-color: var(--tag-background);
    border: var(--tag-border-width) solid var(--tag-border-color);
    border-radius: var(--tag-radius);
    color: var(--tag-color);
    font-size: var(--tag-size);
    font-weight: var(--tag-weight);
    text-decoration: var(--tag-decoration);
    padding: var(--tag-padding-y) var(--tag-padding-x);
    line-height: 1;
}

.dsa-setting-row {
    display: flex;
    justify-content: end;
}

.dsa-setting-row * {
    margin-left: 0.5em;
}

.dsa-setting-row-title {
    margin-right: auto;
    text-transform: capitalize;
    align-items: center;
    display: flex;
}

.dsa-sample-editor {
    margin: 0.5em;
    display: inline-block;
}

.dsa-hidden {
    display: none;
}

.cm-active .dsa-hidden {
    display: inline;
}
`
