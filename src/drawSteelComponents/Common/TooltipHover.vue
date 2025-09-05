<template>
    <span ref="iconElement" :title="tooltipText" class="icon"></span>
</template>

<script setup lang="ts">
import { setIcon } from 'obsidian';
import { onMounted, ref } from 'vue';

const props = defineProps<{
    tooltipText: string
}>()

const iconElement = ref<HTMLElement | null>(null);

onMounted(() => {
    if (iconElement.value) {
        setIcon(iconElement.value, 'info');
    }
});
</script>

<style lang="css" scoped>
.icon {
    height: 0;
    width: 0;
    color: var(--background-modifier-border-focus)
}

.icon :deep(svg)  {
  /* Your styles here, e.g.: */
  width: 13px;
  height: 13px;
}
</style>
