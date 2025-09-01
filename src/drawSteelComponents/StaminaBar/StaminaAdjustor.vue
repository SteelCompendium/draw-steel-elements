<template>
    <span class="stamina-adjustor-container">
        <ds-button icon="minus-circle" :icon_button="true" @click="emit('sub-stamina')"></ds-button>
        <input type="text" :value="current_stamina"></input>
        <span class="max-stamina" v-if="!hide_max_stamina">/ {{max_stamina}}</span>
        <ds-button class="plus-button" icon="plus-circle" :icon_button="true" @click="emit('add-stamina')"></ds-button>
    </span>
</template>

<script setup lang="ts">
import DsButton from '@drawSteelComponents/Common/DsButton.vue'

withDefaults(defineProps<{
    max_stamina?: number
    current_stamina?: number
    hide_max_stamina?: boolean
}>(),
{
    max_stamina: 0,
    current_stamina: 0,
    hide_max_stamina: false,
});

const emit = defineEmits(['add-stamina', 'sub-stamina'])
</script>

<style scoped>
input {
    width: 3em;
    margin-left: 1em;
    font-size: 15px;
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
</style>
