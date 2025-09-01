<template>
    <span class="stamina-adjustor-container">
        <ds-button icon="minus-circle" :icon_button="true" @click="emit('sub-stamina')"></ds-button>
        <input type="text" :value="state.inputValue" @input="validateInput($event)" @change="updateValue"></input>
        <tooltip-hover tooltip-text='Writing "+" or "-" will modify the existing value instead of overwriting it.' class="tooltip-wrapper"/>
        <span class="max-stamina" v-if="!hide_max_stamina">/ {{ max_stamina }}</span>
        <ds-button class="plus-button" icon="plus-circle" :icon_button="true" @click="emit('add-stamina')"></ds-button>
    </span>
</template>

<script setup lang="ts">
import DsButton from '@drawSteelComponents/Common/DsButton.vue'
import TooltipHover from '@drawSteelComponents/Common/TooltipHover.vue'
import { reactive, watch } from 'vue';

const props = withDefaults(defineProps<{
    max_stamina?: number
    current_stamina?: number
    hide_max_stamina?: boolean
}>(),
    {
        max_stamina: 0,
        current_stamina: 0,
        hide_max_stamina: false,
    });

const state = reactive({
    inputValue: props.current_stamina.toString()
})

const emit = defineEmits(['add-stamina', 'sub-stamina', 'mod-stamina', 'set-stamina'])

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

const updateValue = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    let modifier:string = "";
    let number:number = 0;

    if (value.length > 0 && isNaN(Number(value[0]))) {
        modifier = value[0];
        number = Number(value.slice(1));
    } else {
        number = Number(value);
    }

    if(modifier === '') {
        emit('set-stamina', number);
        return;
    }
    if (modifier === '+') {
        emit('mod-stamina', number);
        return
    }
    if (modifier === '-') {
        emit('mod-stamina', -number);
        return
    }
}

watch(() => props.current_stamina, (newVal) => {
    state.inputValue = String(newVal ?? '');
});
</script>

<style scoped>
input {
    width: 3em;
    margin-left: 1em;
    font-size: 15px;
    text-align: center;
}

.stamina-adjustor-container {
    display: flex;
    justify-content: center;
    align-items: center;
}

.max-stamina {
    margin-left: 0.5ch;
}

.plus-button {
    margin-left: 1em;
}

.tooltip-wrapper {
    margin: -2em 14px 0 -14px;
}
</style>
