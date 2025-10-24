<template>
    <div class="feature-container">
        <span class="icon">
            <ds-glyph>{{model?.icon}}</ds-glyph>
        </span>
        <div class="inner-container">
            <span class="title">
                <conditional-span class="name">
                    {{model?.name}}
                    <conditional-span>
                        <template #pre> (</template>
                        <template #default>{{model?.cost}}</template>
                        <template #post>)</template>
                    </conditional-span>
                </conditional-span>
                <conditional-span class="ability-type">{{model?.ability_type}}</conditional-span>
            </span>
            <conditional-span class="flavor">{{model?.flavor}}</conditional-span>
            <horizontal-rule variant="flat-one-sided"></horizontal-rule>
            <div class="header">
                <div class="header-left">
                    <span class="keywords" v-if="model?.keywords?.length ?? 0 > 0">
                        <span v-for="(keyword, i) in model?.keywords || []" :key="i">
                            {{ keyword }}
                            <span v-if="i < ((model?.keywords?.length ?? 0) - 1)">,&puncsp;</span>
                        </span>
                    </span>
                    <conditional-span>{{model?.distance}}</conditional-span>
                </div>
                <div class="header-right">
                    <conditional-span>{{model?.usage}}</conditional-span>
                    <conditional-span>{{model?.target}}</conditional-span>
                </div>
            </div>
            <div class="content">

            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Feature } from '@/model/Feature';

import ConditionalSpan from '@drawSteelComponents/Common/ConditionalSpan.vue';
import DsGlyph from '@drawSteelComponents/Common/DsGlyph.vue';
import HorizontalRule from '@drawSteelComponents/Common/HorizontalRule.vue';

const props = defineProps<{
    model?: Feature,
}>();
</script>

<style lang="css" scoped>
.feature-container {
    display: flex;
    flex-direction: row;
    width: 100%;
    min-height: 4em;
    margin-top: 0.5em;
    padding: 1em;
    background: var(--code-background);
    letter-spacing: 0.03em;
}

/* Indentation levels for power roll container */

.feature-container:has(> .indent-1) {
    margin-left: calc(var(--list-indent) * 1);
}

.feature-container:has(> .indent-2) {
    margin-left: calc(var(--list-indent) * 2);
}

.feature-container:has(> .indent-3) {
    margin-left: calc(var(--list-indent) * 3);
}

.feature-container:has(> .indent-4) {
    margin-left: calc(var(--list-indent) * 4);
}

.feature-container:has(> .indent-5) {
    margin-left: calc(var(--list-indent) * 5);
}

.feature-container:has(> .indent-6) {
    margin-left: calc(var(--list-indent) * 6);
}

.feature-container::before,
.feature-container::after {
    content: "";
    position: absolute;
    background: linear-gradient(to right, transparent, var(--icon-color));
    height: 1px;
    /* Border thickness */
    width: 100%;
}

.feature-container::before {
    top: 0.5em;
    left: 0;
    background: linear-gradient(to right, var(--icon-color), transparent);
    width: 12em;
}

.feature-container::after {
    top: 0.5em;
    left: 0;
    height: 100%;
    max-height: 12em;
    background: linear-gradient(to bottom, var(--icon-color), transparent);
    width: 1px;
    /* Border thickness */
}

.icon {
    margin-right: 0.2em;
}

.inner-container {
    width: 100%;
}

.title,
.header {
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
}

.flavor {
    font-style: italic;
}

.header-left,
.header-right {
    display: flex;
    flex-direction: column;
}

.header-left {
    align-items: start;
}

.header-right {
    align-items: end;
}

.name,
.ability-type {
    font-weight: bold;
}

.keywords {
    display: flex;
    flex-direction: row;
}
</style>
