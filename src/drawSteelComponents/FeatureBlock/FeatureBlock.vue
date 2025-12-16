<template>
    <div :class="containerClasses">
        <span class="icon">
            <ds-glyph>{{ model?.icon }}</ds-glyph>
        </span>
        <div class="inner-container">
            <span class="title">
                <conditional-span class="name">
                    {{ model?.name }}
                    <conditional-span>
                        <template #pre> (</template>
                        <template #default>{{ model?.cost }}</template>
                        <template #post>)</template>
                    </conditional-span>
                </conditional-span>
                <conditional-span class="ability-type">{{ model?.ability_type }}</conditional-span>
            </span>
            <conditional-span class="flavor">{{ model?.flavor }}</conditional-span>
            <horizontal-rule variant="flat-one-sided" v-if="model?.feature_type == 'ability'" />
            <div class="header">
                <div class="header-left">
                    <span class="keywords" v-if="model?.keywords?.length ?? 0 > 0">
                        <span v-for="(keyword, i) in model?.keywords || []" :key="i">
                            {{ keyword }}
                            <span v-if="i < ((model?.keywords?.length ?? 0) - 1)">,&puncsp;</span>
                        </span>
                    </span>
                    <conditional-span>
                        <template #pre>
                            <ds-glyph>aoe</ds-glyph>
                        </template>
                        {{ model?.distance }}
                    </conditional-span>
                </div>
                <div class="header-right">
                    <conditional-span>{{ model?.usage }}</conditional-span>
                    <conditional-span>
                        <template #pre>
                            <ds-glyph>target</ds-glyph>
                        </template>
                        {{ model?.target }}
                    </conditional-span>
                </div>
            </div>
            <span class="trigger" v-if="model?.trigger"><strong>Trigger: </strong>{{ model?.trigger }}</span>
            <span v-for="(effect_model, index) in model?.effects" :key="index">
                <effect :model="effect_model"></effect>
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Feature } from '@/model/Feature';

import ConditionalSpan from '@drawSteelComponents/Common/ConditionalSpan.vue';
import DsGlyph from '@drawSteelComponents/Common/DsGlyph.vue';
import HorizontalRule from '@drawSteelComponents/Common/HorizontalRule.vue';
import Effect from '@drawSteelComponents/FeatureBlock/Effect.vue';

const props = defineProps<{
    model?: Feature,
}>();

const containerClasses = computed(() => ({
    'feature-container': true,
    'feature-container-ability': props.model?.feature_type === 'ability'
}));
</script>

<style lang="scss" scoped>
.feature-container {
    position: relative;
    display: flex;
    flex-direction: row;
    width: 100%;
    min-height: 4em;
    margin-top: 0.5em;
    padding: 1em;
    background: var(--code-background);
    letter-spacing: 0.03em;

    /* Indentation levels for nested containers */
    &:has(> .indent-1) {
        margin-left: calc(var(--list-indent) * 1);
    }

    &:has(> .indent-2) {
        margin-left: calc(var(--list-indent) * 2);
    }

    &:has(> .indent-3) {
        margin-left: calc(var(--list-indent) * 3);
    }

    &:has(> .indent-4) {
        margin-left: calc(var(--list-indent) * 4);
    }

    &:has(> .indent-5) {
        margin-left: calc(var(--list-indent) * 5);
    }

    &:has(> .indent-6) {
        margin-left: calc(var(--list-indent) * 6);
    }

    &-ability {

        &::before,
        &::after {
            content: "";
            position: absolute;
            background: linear-gradient(to right, transparent, var(--icon-color));
            height: 1px;
            /* Border thickness */
            width: 100%;
        }

        &::before {
            top: 0;
            left: 0;
            background: linear-gradient(to right, var(--icon-color), transparent);
            width: 12em;
        }

        &::after {
            top: 0;
            left: 0;
            height: 100%;
            max-height: 12em;
            background: linear-gradient(to bottom, var(--icon-color), transparent);
            width: 1px;
            /* Border thickness */
        }
    }
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
.ability-type,
.trigger>strong {
    font-weight: bold;
}

.keywords {
    display: flex;
    flex-direction: row;
}
</style>
