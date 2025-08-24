<template>
  <div class="container">
		<h3>{{ toProperCase(props.groupName) }}</h3>
		<ul class="skill-list" v-if="props.skillInfo">
			<li class="skill-item" v-for="skill in props.skillInfo" :key="skill.name">
				<toggle-indicator :enabled="hasSkill(skill.name)"></toggle-indicator>
				<span :title="skill.use">{{ toProperCase(skill.name) }}</span>
			</li>
		</ul>
  </div>
</template>

<script setup lang="ts">
import ToggleIndicator from "@drawSteelComponents/Common/ToggleIndicator.vue"
import { SkillInfo } from "@utils/SkillsData"
import { toProperCase } from "@utils/common";

const props = defineProps<{
	groupName?: string,
	skillInfo?: SkillInfo[],
	activeSkills?: string[]
}>()

const hasSkill = (skillName: string) => {
	// Check if the skill is in the skills array (case-insensitive)
	return props.activeSkills?.some((skill) => skill.toLowerCase() === skillName.toLowerCase()) ?? false;
}
</script>

<style scoped>
.skill-group-container {
	width: 100%;
}

.title {
	font-size: 1.2em;
	margin-bottom: 0.5em;
	margin-top: 0;
}

.skill-list {
	list-style: none;
	padding: 0;
}

.skill-item {
	display: flex;
	align-items: center;
	margin-bottom: 0.3em;
}
</style>
