# Counter Element

The Counter Element is a tool designed to parse and display a numerical counter within Obsidian. It allows you to
define a counter with customizable maximum and minimum values using YAML syntax, and then renders this information in
an interactive format for easy tracking during gameplay or writing.

## Usage

To use the Counter Element, insert a code block with the language identifier `ds-counter` in your Obsidian note, and
then define your counter using YAML syntax inside the code block.

### Example counter:

```
~~~ds-counter
name: Health
current_value: 10
max_value: 20
min_value: 0
~~~
```

This code block will render the counter with interactive buttons to increment or decrement the value

![counter](Media/counter.png)

## Field Definitions

Below is a detailed description of each field used in the counter element, including their types, default values, and whether they are required.

| Field                | Type      | Description                                                                                                                                    | Required | Default Value |
| -------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| `name-top`           | `string`  | The name shown above the counter (e.g., "Stamina", "Heroic Resource").                                                                         | No       | N/A           |
| `name-bottom`        | `string`  | The name shown below the counter (e.g., "Focus", "Drama).                                                                                      | No       | N/A           |
| `current_value`      | `integer` | The current value of the counter.                                                                                                              | No       | `0`           |
| `max_value`          | `integer` | The maximum value the counter can reach.                                                                                                       | No       | `undefined`   |
| `min_value`          | `integer` | The minimum value the counter can reach.                                                                                                       | No       | `undefined`   |
| `value_height`       | `integer` | Adjusts the size of the counter value text in the rendered output as a multiplier.                                                             | No       | `3`           |
| `name_top_height`    | `integer` | Adjusts the size of the counter name_top text in the rendered output as a multiplier.                                                          | No       | `1`           |
| `name_bottom_height` | `integer` | Adjusts the size of the counter name_bottom text in the rendered output as a multiplier.                                                       | No       | `1`           |
| `hide_buttons`       | `string`  | Hides 0, 1 or both buttons depending on the value. \"true\" will hide both buttons, \"plus\" and \"minus\" will hide the corresponding button. | No       | `false`       |
| `style`              | `string`  | Selects the style of Counter. "default", "horizontal" and "vertical" are accepted values.                                                      | No       | `default`     |

### Notes:

-   The `current_value` is the starting point of the counter when it's rendered.
-   If `max_value` is defined, the counter cannot increment beyond this value.
-   If `min_value` is defined, the counter cannot decrement below this value.
-   `value_height`, `name_top_height` and `name_bottom_height` are optional parameters to adjust the visual presentation of the counter in the rendered output. They are useful for customizing the display according to your preferences.
-   You can click on the counter value to edit it directly. Appending a `+` or a `-` to the front of the number will modify the existing value instead of replacing it.
