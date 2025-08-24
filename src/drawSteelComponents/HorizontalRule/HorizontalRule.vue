<template>
  <div class="container">
    <div class="line line-left"></div>
    <div class="line-center"></div>
    <div class="line line-right"></div>
  </div>
</template>

<script setup lang="ts">
// No props or reactive data needed for this simple component
</script>

<style scoped>
.container {
	display: flex;
	align-items: center;
	position: relative;
	margin-top: 6px;
}

.line {
	flex-grow: 1;
	height: 2px;
	background-color: var(--icon-color);
	top: 50%; /* Center it vertically */
	left: 0;
	right: 0;
}

.line-left {
	background: linear-gradient(to left, var(--icon-color) 0%, transparent 100%);
}

.line-right {
	background: linear-gradient(to right, var(--icon-color) 0%, transparent 100%);
}

.line-center {
	width: 14px;
	height: 14px;
	background-color: var(--icon-color);
	transform: translateZ(1px) translateY(1px) rotate(45deg); /* Rotate to make a diamond */
	position: relative;
	z-index: 1; /* Ensure the diamond is above the lines */
	margin: 0 auto; /* Center the diamond */
	border-bottom: 2px solid var(--icon-color);
	border-right: 2px solid var(--icon-color);
	box-shadow: inset 0 0 0 3px var(--background-primary);
}
</style>
