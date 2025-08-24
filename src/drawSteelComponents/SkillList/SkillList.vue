<template>
    <div class="container">
        <skill-group
            v-for="(skillInfo, groupName) in SKILL_DATA"
            :key="groupName.toString()"
            :group-name="groupName.toString()"
            :skill-info="skillInfo"
            :activeSkills="activeSkills">
        </skill-group>
    </div>
</template>

<script setup lang="ts">
import SkillGroup from "@drawSteelComponents/SkillList/SkillGroup.vue";
import { SKILL_DATA } from "@utils/SkillsData"
import { Skills } from "@model/Skills";
import { ref } from "vue";

const props = defineProps<{
    skills?: Skills,
}>()

let activeSkills = ref(props.skills?.skills ? [...props.skills.skills] : []);
let fullSkillData = ref(structuredClone(SKILL_DATA));

for (let customSkill of props.skills?.custom_skills ?? []) {
    let skillGroup = fullSkillData.value[customSkill.skill_group?.toLowerCase() ?? "ungrouped skills"]
    skillGroup.push({name: customSkill.name, use: customSkill.description ?? ""})
    if (customSkill.has_skill) {
        activeSkills.value.push(customSkill.name)
    }
}

</script>

<style scoped>
.container {
    width: 100%;
}
</style>
