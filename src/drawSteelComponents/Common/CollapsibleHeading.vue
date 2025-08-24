<template>
	<component :is="`h${headerLevel}`" @mousedown.stop @click.capture.stop.prevent="handleClick">
		<span :class="collapseClasses">
			<!-- Should probably move this svg to a seperate file, but for now it's just ripped from obsidian -->
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon right-triangle"><path d="M3 8L12 17L21 8"></path></svg>
		</span>
		<slot></slot>
	</component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
    headerLevel: {
		type: Number,
		required: false,
		default: 1,
		validator(value: number) {
			return value >= 1 && value <= 6
		}
	},
	enabled: {
		type: Boolean,
		required: false,
		default: true
	}
})

const emit = defineEmits<{
	toggle: [enabled: boolean]
}>()

const collapseClasses = computed(() => [
	'heading-collapse-indicator',
	'collapse-indicator',
	'collapse-icon',
	{
		'is-collapsed': !props.enabled,
	}
])

const handleClick = () => {
	emit('toggle', !props.enabled)
}
</script>

<style scoped>
/*
	Override of Obsidian functionality to ironically gain function parity with
	Obsidian's own heading elements.
*/
.is-collapsed {
	opacity: 1;
}
.is-collapsed > svg{
	color: var(--collapse-icon-color-collapsed) !important;
}
</style>
