<template>
    <div class="v-rule-container">
        <div class="v-rule-wrapper">
            <div class="line line-top"></div>
            <div :class="centerClasses"></div>
            <div class="line line-bottom"></div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
	inverted: {
		type: Boolean,
		required: false,
	}
})

const centerClasses = computed(() => [
	'line-center',
	{
		'inverted': props.inverted,
	}
])

</script>

<style scoped>
.v-rule-container {
    display: flex;
    justify-items: start;
}

.v-rule-wrapper {
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	position: relative;
	margin-left: 6px;
	height: 100%;
	min-height: 50px;
}

.line {
	flex-grow: 1;
	width: 2px;
	background-color: var(--icon-color);
	left: 50%; /* Center it horizontally */
	top: 0;
	bottom: 0;
}

.line-top {
	background: linear-gradient(to top, var(--icon-color) 0%, transparent 100%);
}

.line-bottom {
	background: linear-gradient(to bottom, var(--icon-color) 0%, transparent 100%);
}

.line-center {
	width: 14px;
	height: 14px;
	background-color: var(--icon-color);
	transform: translateZ(1px) translateX(1px) rotate(315deg); /* Rotate to make a diamond - 90 degrees more for vertical */
	position: relative;
	z-index: 1; /* Ensure the diamond is above the lines */
	flex-shrink: 0; /* Prevent the diamond from shrinking */
	border-bottom: 2px solid var(--icon-color);
	border-right: 2px solid var(--icon-color);
	box-shadow: inset 0 0 0 3px var(--background-primary);
}

.line-center.inverted {
	margin-left: -3px;
	transform: translateZ(1px) translateX(1px) rotate(135deg); /* Rotate to make a diamond - 90 degrees more for vertical */
}
</style>
