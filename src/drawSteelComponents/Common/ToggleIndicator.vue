<template>
	<span :class="indicatorClasses"></span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
	enabled?: boolean
}>()

const indicatorClasses = computed(() => [
	'toggle-indicator',
	{
		'toggle-indicator--enabled': props.enabled,
		'toggle-indicator--disabled': !props.enabled
	}
])
</script>

<style scoped>
.toggle-indicator {
	width: 1em;
	height: 1em;
	margin-right: 0.5em;
	border: 1px solid var(--text-muted);
	display: inline-block;
	border-radius: 0.2em;
}

.toggle-indicator--enabled {
	background-color: var(--interactive-accent);
	border-color: var(--interactive-accent);
}

.toggle-indicator--disabled {
	background-color: transparent;
}
</style>
