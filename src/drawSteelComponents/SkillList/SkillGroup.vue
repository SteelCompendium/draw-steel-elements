<template>
  <div class="container">
		<span v-if="!onlyShowSelected">
			<collapsible-heading :header-level="3" :enabled="!isHeadingCollapsed" @toggle="handleToggle">
				{{ toProperCase(props.groupName) }}
			</collapsible-heading>
			<ul class="skill-list" v-if="props.skillInfo && !isHeadingCollapsed">
				<li class="skill-item" v-for="skill in props.skillInfo" :key="skill.name">
					<toggle-indicator :enabled="hasSkill(skill.name)"/>
					<span :title="skill.use">
						{{ toProperCase(skill.name) }}
					</span>
				</li>
			</ul>
		</span>

		<span v-if="onlyShowSelected">
			<h3>{{ toProperCase(props.groupName) }}</h3>
			<ul class="skill-list" v-if="props.skillInfo && !isHeadingCollapsed">
				<template v-for="skill in props.skillInfo" :key="skill.name">
					<li class="skill-item" v-if="hasSkill(skill.name)">
						<toggle-indicator :enabled="hasSkill(skill.name)"/>
						<span :title="skill.use">
							{{ toProperCase(skill.name) }}
						</span>
					</li>
				</template>
			</ul>
		</span>
  	</div>
</template>

<script setup lang="ts">
import CollapsibleHeading from "@drawSteelComponents/Common/CollapsibleHeading.vue"
import ToggleIndicator from "@drawSteelComponents/Common/ToggleIndicator.vue"
import { SkillInfo } from "@utils/SkillsData"
import { toProperCase } from "@utils/common";
import { ref } from "vue";

const props = defineProps<{
    groupName?: string,
    skillInfo?: SkillInfo[],
    activeSkills?: string[],
	onlyShowSelected?: boolean,
}>()

const isHeadingCollapsed = ref(false)

const hasSkill = (skillName: string) => {
    // Check if the skill is in the skills array (case-insensitive)
    return props.activeSkills?.some((skill) => skill.toLowerCase() === skillName.toLowerCase()) ?? false;
}

const handleToggle = () => {
    isHeadingCollapsed.value = !isHeadingCollapsed.value
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
