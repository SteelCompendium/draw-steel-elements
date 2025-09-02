<template>
    <component-wrapper component-name="Skill List" :model="model">
        <skill-group
            v-for="(skillInfo, groupName) in fullSkillData"
            :key="groupName.toString()"
            :group-name="groupName.toString()"
            :skill-info="skillInfo"
            :activeSkills="activeSkills"
			:only-show-selected="model?.only_show_selected">
        </skill-group>
    </component-wrapper>
</template>

<script setup lang="ts">
import ComponentWrapper from "@drawSteelComponents/Common/ComponentWrapper.vue";
import SkillGroup from "@drawSteelComponents/SkillList/SkillGroup.vue";
import { SKILL_DATA } from "@utils/SkillsData"
import { Skills } from "@model/Skills";
import { ref } from "vue";

const props = defineProps<{
    model?: Skills,
}>()

let activeSkills = ref(props.model?.skills ? [...props.model.skills] : []);
let fullSkillData = ref(structuredClone(SKILL_DATA));

for (let customSkill of props.model?.custom_skills ?? []) {
    let skillGroup = fullSkillData.value[customSkill.skill_group?.toLowerCase() ?? "ungrouped skills"]
    skillGroup.push({name: customSkill.name, use: customSkill.description ?? ""})
    if (customSkill.has_skill) {
        activeSkills.value.push(customSkill.name)
    }
}
</script>

<style scoped>
</style>
