<template>
    <span class="counter-container" v-if="!model.style || model.style == 'horizontal' || model.style == 'default'">
        <span class="name-top">{{model.name_top}}</span>
        <span class="counter-inner-container">
            <ds-button icon="minus-circle" variant="icon" @click="updateValue('-1')"></ds-button>
            <span class="input-container">
                <input type="text" :value="state.inputValue" @input="validateInput($event)" @change="updateValue" />
                <tooltip-hover class="tooltip-wrapper" tooltip-text='Writing "+" or "-" will modify the existing value instead of overwriting it.' />
            </span>
            <span class="max-value" v-if="model?.max_value">
                / {{ model.max_value }}
            </span>
            <ds-button class="plus-button" icon="plus-circle" variant="icon" @click="updateValue('+1')"></ds-button>
        </span>
        <span class="name-bottom">{{model.name_bottom}}</span>
    </span>
    <span class="counter-container vertical" v-else-if="model.style == 'vertical'">
        <span class="name-top">{{model.name_top}}</span>
        <span class="counter-inner-container">
            <ds-button icon="minus-circle" variant="icon" @click="updateValue('-1')"></ds-button>
            <span class="input-container">
                <input type="text" :value="state.inputValue" @input="validateInput($event)" @change="updateValue" />
                <tooltip-hover class="tooltip-wrapper" tooltip-text='Writing "+" or "-" will modify the existing value instead of overwriting it.' />
            </span>
            <span class="max-value" v-if="model?.max_value">
                / {{ model.max_value }}
            </span>
            <ds-button class="plus-button" icon="plus-circle" variant="icon" @click="updateValue('+1')"></ds-button>
        </span>
        <span class="name-bottom">{{model.name_bottom}}</span>
    </span>
    <span v-else>Unknown style "{{model.style}}"</span>
</template>

<script setup lang="ts">
import DsButton from '@drawSteelComponents/Common/DsButton.vue'
import { Counter } from '@model/Counter';
import TooltipHover from '@drawSteelComponents/Common/TooltipHover.vue'
import { reactive, watch } from 'vue';

const props = defineProps<{
    model: Counter
}>()

const emit = defineEmits(['mod-value', 'set-value'])

const state = reactive({
    inputValue: (props.model?.current_value ?? 0).toString()
})

const validateInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    const regex = /^[\+-]?[0-9]*$/;
    if (regex.test(value)) {
        state.inputValue = value;
    } else {
        target.value = state.inputValue;
    }
}

const updateValue = (input: string | Event) => {
    let value = "";

    if (input instanceof Event) {
        const target = input.target as HTMLInputElement;
        value = target.value;
    }
    else {
        value = input;
    }

    let modifier:string = "";
    let number:number = 0;

    if (value.length > 0 && isNaN(Number(value[0]))) {
        modifier = value[0];
        number = Number(value.slice(1));
    } else {
        number = Number(value);
    }

    if(modifier === '') {
        state.inputValue = number.toString()
        emit('set-value', number);
        return;
    }
    if (modifier === '+') {
        state.inputValue = (Number(state.inputValue) + number).toString()
        if (props.model.max_value && Number(state.inputValue) > props.model.max_value) {
            state.inputValue = props.model.max_value.toString();
        }
        emit('mod-value', number);
        return
    }
    if (modifier === '-') {
        state.inputValue = (Number(state.inputValue) - number).toString()
        if (props.model.max_value && Number(state.inputValue) < props.model.min_value) {
            state.inputValue = props.model.min_value.toString();
        }
        emit('mod-value', -number);
        return
    }
}

watch(() => props.model?.current_value, (newVal: number | undefined) => {
    console.log("model changed")
    state.inputValue = String(newVal ?? 0);
});

</script>

<style scoped>
.counter-container {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.counter-container.vertical {
    flex-direction: row;
}

.name-top {
    margin-bottom: 0.5em;
}

.name-bottom {
    margin-top: 0.5em;
}

.counter-inner-container {
    display: flex;
    align-items: center;
    justify-content: center;
}

.input-container {
    display: flex;
    align-items: start;
    justify-content: start;
    margin-right: 1ch;
    margin-left: 1ch;
    font-size: 15px;
    line-height: 0;
}

.input-container > input {
    height: 2em;
    width: 6ch;
    font-size: 15px;
    text-align: center;
}

.tooltip-wrapper {
    --horizontal-margin: 13px;
    margin-left: calc(-1 * var(--horizontal-margin));
    margin-right: var(--horizontal-margin);
}

.max-value {
    margin-right: 1ch;
}
</style>
