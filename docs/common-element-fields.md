# Common Element Fields

Common Element Fields are fields that are supported on all (Vue) Elements. IMPORTANT: not all Elements have converted 
over to their Vue implementations yet! Currently, the following Elements support these common fields: 

- [Skills Element](skills-element)
- [Stamina Bar](stamina-bar)

The other Elements are still migrating over.  Thanks for your patience.

## Common Fields

| Field             | Type      | Description                                                                     | Required | Default Value |
|-------------------|-----------|---------------------------------------------------------------------------------|----------|---------------|
| `collapsible`     | `boolean` | If `true` allows the Element to collapse                                        | No       | `true`        |
| `collapse_defaut` | `boolean` | If `true` will set the default state of the Element to collapsed when rendered. | No       | `false`       |
