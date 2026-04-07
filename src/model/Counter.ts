import { parseYaml } from "obsidian";
import {
    validateDataWithSchema,
    ValidationError,
} from "@utils/JsonSchemaValidator";
import { ComponentWrapper } from "@model/ComponentWrapper";
import counterSchemaYaml from "@model/schemas/Counter.yaml";

type HideButtonsType = "both" | "neither" | "plus" | "minus" | undefined;
type StyleType = "default" | "horizontal" | "vertical" | undefined;
export class Counter extends ComponentWrapper {
    name_top: string;
    name_bottom: string;
    current_value: number;
    max_value?: number;
    min_value: number;
    auto_save: boolean;
    name_top_height: number;
    name_bottom_height: number;
    value_height: number;
    max_value_height: number;
    hide_buttons: HideButtonsType;
    style: StyleType;

    public static parseYaml(source: string) {
        try {
            // Validate YAML content against YAML schema (all dependencies pre-registered)
            const validation = validateDataWithSchema(
                source,
                counterSchemaYaml,
            );
            if (!validation.valid) {
                const errorMessages = validation.errors
                    .map(
                        (error: ValidationError) =>
                            `${error.path}: ${error.message}`,
                    )
                    .join(", ");
                throw new Error("Schema validation failed: " + errorMessages);
            }

            // Parse the YAML after validation
            const data = parseYaml(source);
            return Counter.parse(data);
        } catch (error: any) {
            throw new Error("Invalid YAML format: " + error.message);
        }
    }

    public static parse(data: any): Counter {
        return {
            collapsible: data.collapsible,
            collapse_default: data.collapse_default,
            name_top: data.name_top,
            name_bottom: data.name_bottom ?? data.name,
            current_value: data.current_value,
            max_value: data.max_value,
            min_value: data.min_value,
            auto_save: data.auto_save,
            name_top_height: data.name_top_height ?? data.name_height ?? 1,
            name_bottom_height:
                data.name_bottom_height ?? data.name_height ?? 1,
            value_height: data.value_height ?? 3,
            max_value_height: data.max_value_height ?? data.value_height,
            hide_buttons: data.hide_buttons,
            style: data.style,
        } as Counter;
    }

    constructor(
        collapsible: boolean,
        collapse_default: boolean,
        max_value: number | undefined,
        current_value: number,
        min_value: number,
        auto_save: boolean,
        name_top: string,
        name_bottom: string,
        value_height: number,
        name_top_height: number,
        name_bottom_height: number,
        hide_buttons: HideButtonsType,
        style: StyleType,
    ) {
        super(collapsible, collapse_default);
        this.current_value = current_value ?? 0;
        this.min_value = min_value ?? undefined;
        this.max_value = max_value ?? undefined;
        this.auto_save = auto_save == false;
        this.name_top = name_top;
        this.name_bottom = name_bottom;
        this.value_height = value_height ?? 3;
        this.max_value_height = this.max_value_height ?? this.value_height;
        this.name_top_height = name_top_height ?? 1;
        this.name_bottom_height = name_bottom_height ?? 1;
        this.hide_buttons = hide_buttons ?? "neither";
        this.style = style ?? "default";
    }
}
