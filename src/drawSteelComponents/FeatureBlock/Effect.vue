<template>
    <div class="effect-container">
        <span v-if="model?.name">
            <b class="bold">{{ model?.name }}:&nbsp;</b>
        </span>
        <conditional-span>{{ model?.effect }}</conditional-span>
        <power-roll class="power-roll" :model="model?.powerRoll" v-if="model?.powerRoll"></power-roll>
    </div>
</template>

<script setup lang="ts">
import { Effect } from '@/model/Effect';
import ConditionalSpan from '@drawSteelComponents/Common/ConditionalSpan.vue';
import PowerRoll from '@drawSteelComponents/FeatureBlock/PowerRoll.vue';

const props = defineProps<{
    model?: Effect,
}>();
</script>

<style lang="scss" scoped>
.power-roll {
    margin-top: 0.5em;
    margin-bottom: 0.5em;
}

.bold {
    font-weight: bold;
}
</style>
