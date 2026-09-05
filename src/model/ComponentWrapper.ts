import { AbstractModel } from "@model/AbstractModel";

export class ComponentWrapper extends AbstractModel{
    public collapsible: boolean;
    public collapse_default: boolean;
    public element_name: string;

    public static parse(data: any): ComponentWrapper {
        return new ComponentWrapper(
            data.collapsible,
            data.collapse_default);
    }

    constructor(collapsible: boolean, collapse_default: boolean) {
        super();
        this.collapsible = collapsible ?? true;
        this.collapse_default = collapse_default ?? false;
    }
}
