<template>
	<div class="component-wrapper">
		<component-hide-indicator :enabled="collapse_default ?? false" @toggle="handleToggle" v-if="collapsible"/>
		<div v-if="!state.collapsed">
			<slot></slot>
		</div>
		<div class="collapsed-wrapper" v-if="state.collapsed">
			<vertical-rule/>
			<strong>{{ componentName }}</strong>
		</div>
	</div>
</template>

<script setup lang="ts">
import ComponentHideIndicator from "@drawSteelComponents/Common/ComponentHideIndicator.vue";
import VerticalRule from "@drawSteelComponents/VerticalRule.vue";
import { reactive } from 'vue';

const props = defineProps({
	componentName: {
		type: String,
		required: true
	},
	collapsible: {
		type: Boolean,
		required: false,
	},
	collapse_default: {
		type: Boolean,
		required: false,
	},
})

const emit = defineEmits<{
	toggle: [enabled: boolean]
}>()

const state = reactive({
	collapsed: props.collapse_default
})

const handleToggle = () => {
	state.collapsed = !state.collapsed
	emit('toggle', state.collapsed)
}
</script>

<style scoped>
.component-wrapper {
	min-height: 34px;
	width: 100%;
}

.collapsed-wrapper {
	display: flex;
	flex-direction: row;
	align-items: center;
	column-gap: 15px;
}
</style>
