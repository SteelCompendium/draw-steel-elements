<template>
	<span class="eye-container">
		<span class="eye-indicator" @mousedown.stop @click.capture.stop.prevent="handleClick" ref="iconContainer"/>
	</span>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { setIcon } from 'obsidian';

const props = defineProps({
	enabled: {
		type: Boolean,
		required: false,
	}
})

const emit = defineEmits<{
	toggle: [enabled: boolean]
}>()

const state = reactive({
	enabled: props.enabled ?? false
});

const iconContainer = ref<HTMLElement>()

const handleClick = () => {
	state.enabled = !state.enabled;
	setIconSVG();
	emit('toggle', state.enabled)
}

onMounted(() => {
	setIconSVG();
})

let setIconSVG = () => {
	if (iconContainer.value) {
		console.log(state.enabled)
		setIcon(iconContainer.value, state.enabled ? "eye" : "eye-off");
	}
}

</script>

<style scoped>
.eye-container {
	height: 0;
	width: 100%;
	display: flex;
	justify-content: flex-end;
	padding-top: 4px;
	padding-right: 34px;
	color: var(--text-muted)
}

.eye-indicator {
	width: 30px;
	height: 26px;
	padding: var(--size-2-2) var(--size-2-3);
	border-radius: var(--radius-s);
}

.eye-indicator:hover {
	background-color: var(--background-modifier-hover)
}


.markdown-source-view.is-live-preview .cm-preview-code-block .eye-indicator {
	opacity: 0;
}
.markdown-source-view.is-live-preview .cm-preview-code-block:hover .eye-indicator {
	opacity: 1;
}
</style>
