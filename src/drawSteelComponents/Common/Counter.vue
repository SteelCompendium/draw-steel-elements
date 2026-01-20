<template>
    <span class="counter-wrapper">
        <span
            class="counter-container vertical"
            v-if="
                !model.style ||
                model.style == 'vertical' ||
                model.style == 'default'
            "
        >
            <span class="counter-inner-container vertical">
                <span
                    class="name-top"
                    :style="`font-size:calc(var(--font-text-size)*${model.name_top_height})`"
                >
                    {{ model.name_top }}
                </span>
                <span class="input-container vertical">
                    <input
                        type="text"
                        :value="state.inputValue"
                        :style="`width:${state.inputValue.length + 0.5}ch; font-size:calc(var(--font-text-size)*${model.value_height})`"
                        @input="validateInput($event)"
                        @change="updateValue"
                    />
                    <tooltip-hover
                        class="tooltip-wrapper vertical"
                        tooltip-text='Writing "+" or "-" will modify the existing value instead of overwriting it.'
                    />
                </span>
                <span
                    class="name-bottom"
                    :style="`font-size:calc(var(--font-text-size)*${model.name_bottom_height})`"
                >
                    {{ model.name_bottom }}
                </span>
            </span>
            <span class="button-wrapper vertical">
                <span class="button-container vertical">
                    <ds-button
                        class="plus-button"
                        icon="chevron-up"
                        variant="simplified"
                        @click="updateValue('+1')"
                        v-if="
                            model.hide_buttons != 'true' &&
                            model.hide_buttons != 'plus'
                        "
                    />
                    <ds-button
                        icon="chevron-down"
                        variant="simplified"
                        @click="updateValue('-1')"
                        v-if="
                            model.hide_buttons != 'true' &&
                            model.hide_buttons != 'minus'
                        "
                    />
                </span>
            </span>
        </span>

        <span class="counter-container" v-else-if="model.style == 'horizontal'">
            <span
                class="name-top"
                :style="`font-size:calc(var(--font-text-size)*${model.name_top_height})`"
            >
                {{ model.name_top }}
            </span>
            <span class="counter-inner-container">
                <ds-button
                    icon="minus-circle"
                    variant="icon"
                    @click="updateValue('-1')"
                    v-if="
                        model.hide_buttons != 'true' &&
                        model.hide_buttons != 'plus'
                    "
                />
                <span class="input-container">
                    <input
                        type="text"
                        :value="state.inputValue"
                        :style="`font-size:calc(var(--font-text-size)*${model.value_height})`"
                        @input="validateInput($event)"
                        @change="updateValue"
                    />
                    <tooltip-hover
                        class="tooltip-wrapper"
                        tooltip-text='Writing "+" or "-" will modify the existing value instead of overwriting it.'
                    />
                </span>
                <span class="max-value" v-if="model?.max_value">
                    / {{ model.max_value }}
                </span>
                <ds-button
                    class="plus-button"
                    icon="plus-circle"
                    variant="icon"
                    @click="updateValue('+1')"
                    v-if="
                        model.hide_buttons != 'true' &&
                        model.hide_buttons != 'minus'
                    "
                />
            </span>
            <span
                class="name-bottom"
                :style="`font-size:calc(var(--font-text-size)*${model.name_bottom_height})`"
            >
                {{ model.name_bottom }}
            </span>
        </span>

        <span v-else> Unknown style "{{ model.style }}" </span>
    </span>
</template>

<script setup lang="ts">
import DsButton from "@drawSteelComponents/Common/DsButton.vue";
import { Counter } from "@model/Counter";
import TooltipHover from "@drawSteelComponents/Common/TooltipHover.vue";
import { reactive, watch } from "vue";

const props = defineProps<{
    model: Counter;
}>();

const emit = defineEmits(["mod-value", "set-value"]);

const state = reactive({
    inputValue: (props.model?.current_value ?? 0).toString(),
});

if (
    !["default", "horizontal", "vertical", undefined].includes(
        props.model.style,
    )
) {
    throw new Error(`Invalid style on Counter: ${props.model.style}`);
}

console.log(props.model);

const validateInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    const regex = /^[\+-]?[0-9]*$/;
    if (regex.test(value)) {
        state.inputValue = value;
    } else {
        target.value = state.inputValue;
    }
};

const updateValue = (input: string | Event) => {
    let value = "";

    if (input instanceof Event) {
        const target = input.target as HTMLInputElement;
        value = target.value;
    } else {
        value = input;
    }

    let modifier: string = "";
    let number: number = 0;

    if (value.length > 0 && isNaN(Number(value[0]))) {
        modifier = value[0];
        number = Number(value.slice(1));
    } else {
        number = Number(value);
    }

    if (modifier === "") {
        state.inputValue = number.toString();
        emit("set-value", number);
        return;
    }
    if (modifier === "+") {
        state.inputValue = (Number(state.inputValue) + number).toString();
        if (
            props.model.max_value &&
            Number(state.inputValue) > props.model.max_value
        ) {
            state.inputValue = props.model.max_value.toString();
        }
        emit("mod-value", number);
        return;
    }
    if (modifier === "-") {
        state.inputValue = (Number(state.inputValue) - number).toString();
        if (
            props.model.max_value &&
            Number(state.inputValue) < props.model.min_value
        ) {
            state.inputValue = props.model.min_value.toString();
        }
        emit("mod-value", -number);
        return;
    }
};

watch(
    () => props.model?.current_value,
    (newVal: number | undefined) => {
        console.log("model changed");
        state.inputValue = String(newVal ?? 0);
    },
);
</script>

<style scoped lang="scss">
.counter-wrapper {
    width: 100%;
    display: flex;
    justify-content: center;
}

.counter-container {
    display: flex;
    flex-direction: column;
    align-items: center;

    &&.vertical {
        flex-direction: row;
    }
}

.button-wrapper.vertical {
    width: 0;
}

.button-container.vertical {
    display: flex;
    flex-direction: column;
    margin: 0;
    align-items: center;
    justify-content: center;
    margin-left: 1ch;
}

.counter-inner-container {
    display: flex;
    align-items: center;
    justify-content: center;

    &&.vertical {
        flex-direction: column;
        margin-right: 1ch;
    }
}

.input-container {
    display: flex;
    align-items: start;
    justify-content: start;
    margin-right: 1ch;
    margin-left: 1ch;
    font-size: 15px;
    line-height: 0;

    &&.vertical {
        margin: 0;

        && > input {
            height: fit-content;
            border: none;
            background: none;
            font-size: 32px;
            padding: 0;
        }
    }

    && > input {
        height: 2em;
        width: 6ch;
        font-size: 15px;
        text-align: center;
    }
}

.tooltip-wrapper {
    --horizontal-margin: 13px;
    margin-left: calc(-1 * var(--horizontal-margin));
    margin-right: var(--horizontal-margin);
    cursor: help;

    &&.vertical {
        padding-left: 0.25em;
        margin-top: 0.5em;
    }
}

.max-value {
    margin-right: 1ch;
}
</style>
