<template>
	<div class="component-wrapper">
		<component-hide-indicator :enabled="collapse_default_modified ?? false" @toggle="handleToggle" v-if="collapsible_modified"/>
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
import VerticalRule from "@/drawSteelComponents/Common/VerticalRule.vue";
import { ComponentWrapper } from "@model/ComponentWrapper";
import { reactive } from 'vue';

const props = defineProps({
    model: {
        type: ComponentWrapper,
        required: false
    },
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

const collapsible_modified = props.collapsible ?? props.model?.collapsible ?? false
const collapse_default_modified = props.collapse_default ??props.model?.collapse_default ?? false

const emit = defineEmits<{
	toggle: [enabled: boolean]
}>()

const state = reactive({
	collapsed: collapse_default_modified
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
