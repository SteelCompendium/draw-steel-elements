<template>
    <div class="ds-modal-content">
        <slot />
        <div class="footer">
            <slot name="footer">
                <ds-button :disabled="cancel_button_disabled" :icon="cancel_button_icon" @click="emit('close')">
                    {{ cancel_button_text }}
                </ds-button>
                <ds-button :disabled="ok_button_disabled" :icon="ok_button_icon" @click="emit('ok')">
                    {{ ok_button_text }}
                </ds-button>
            </slot>
        </div>
    </div>
</template>

<script setup lang="ts">
import DsButton from "@drawSteelComponents/Common/DsButton.vue"

const props = withDefaults(defineProps<{
    cancel_button_text?: string
    ok_button_text?: string
    cancel_button_icon?: string
    ok_button_icon?: string
    cancel_button_disabled?: boolean
    ok_button_disabled?: boolean
}>(), {
    cancel_button_text: "Cancel",
    ok_button_text: "Ok",
});

const emit = defineEmits(['close', 'ok']);
</script>

<style scoped>
.ds-modal-content {
    margin-top: .5em;
}

.footer {
    display: flex;
    justify-content: space-between;
    margin-top: 2em;
}
</style>
