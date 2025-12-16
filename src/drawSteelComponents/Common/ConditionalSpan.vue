<template>
    <span :class="spanClasses">
        <span>
            <slot name="pre"/>
        </span>
        <span ref="defaultSlot">
            <slot name="default"/>
        </span>
        <slot name="post"/>
    </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const defaultSlot = ref();

const show_span = computed((): boolean => {
    const textContent = defaultSlot.value?.textContent
    
    // Check slot content
    if (!textContent) {
        return false;
    }
    
    return textContent.trim().length > 0;
});

const spanClasses = computed(() => ({
    hidden: !show_span.value
}))
</script>

<style lang="css" scoped>
.hidden {
    visibility: hidden;
}
</style>
