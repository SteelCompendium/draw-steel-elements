<template>
    <span>{{glyph_text}}</span>
</template>

<script setup lang="ts">
import type { GlyphVariant } from "@drawSteelComponents/Common/types";
import type { DsGlyph as DsGlyphModel } from "@model/DsGlyph";
import { computed } from "vue";

const props = defineProps<{
    variant?: GlyphVariant,
    model?: DsGlyphModel
}>()

console.log("ds-glyph loaded")

// Get variant from either direct prop or model prop
const actualVariant = computed(() => {
    return props.variant || props.model?.variant;
});

const glyph_text = computed(() => {
    const variant = actualVariant.value;
    if (!variant) return '';
    
    switch (variant.toString()) {
        case 'area':
            return 'e';
        case 'burst':
            return 'b';
        case 'villain action':
        case 'malice':
            return 'd';
        case 'melee':
            return 't';
        case 'special':
            return 'c';
        case 'ranged':
            return 'g';
        case 'self':
            return 'f';
        case 'versatile':
        case 'melee and ranged':
        case 'ranged and melee':
            return 'l';
        case 'area of effect':
        case 'aoe':
            return 'o';
        case 'activation':
            return '(';
        case 'triggered action':
            return ')';
        case 'trait':
            return '*';
        case 'target':
            return 'x';
        case 'targets':
            return 'X';
        case 'tier 1':
            return '!¼Áá';
        case 'tier1':
        case 't1':
        case 'tier 2':
            return '@½Éé';
        case 'tier2':
        case 't2':
        case 'tier 3':
            return '#¾Íí';
        case 'tier3':
        case 't3':
        case 'note1':
            return 'n';
        case 'note2':
            return 'N';
        case 'high dash':
            return '¡';
        case 'chevron':
            return '¢';
        case 'chevron-diamond':
            return '£';
        case 'diamond':
        case 'diamond-m':
            return '¥';
        case 'diamond-s':
            return '®';
        case 'diamond-l':
            return '©';
        case 'a':
        case 'agility':
        case 'a-rounded':
        case 'agility-rounded':
            return 'A';
        case 'i':
        case 'intuition':
        case 'i-rounded':
        case 'intuition-rounded':
            return 'I';
        case 'm':
        case 'm-rounded':
        case 'might-rounded':
        case 'might':
            return 'M';
        case 'p':
        case 'presence':
        case 'p-rounded':
        case 'presence-rounded':
            return 'P';
        case 'r':
        case 'reason':
        case 'r-rounded':
        case 'reason-rounded':
            return 'R'; 
        case 'a-block':
        case 'agility-block':
            return 'a';
        case 'i-block':
        case 'intuition-block':
            return 'i';
        case 'm-block':
        case 'might-block':
            return 'm';
        case 'p-block':
        case 'presence-block':
            return 'p';
        case 'r-block':
        case 'reason-block':
            return 'r';
        case '1':
        case '1-block':
            return '1';
        case '2':
        case '2-block':
            return '2';
        case '3':
        case '3-block':
            return '3';
        case '4':
        case '4-block':
            return '4';
        case '5':
        case '5-block':
            return '5';
        case '6':
        case '6-block':
            return '6';
        case '7':
        case '7-block':
            return '7';
        case '8':
        case '8-block':
            return '8';
        case '9':
        case '9-block':
            return '9';
        case '0':
        case '0-block':
            return '0';
        case 'block-start':
            return '[';
        case 'block-space':
            return ' ';
        case 'block-end':
            return ']';
        case '-':
            return '-';
        case '<':
            return '<';
        case '=':
            return '=';
        case '>':
            return '>';
        case '*':
            return '×';
        case '/':
            return '÷';
        case 'weak':
            return 'w';
        case 'average':
            return 'v';
        case 'strong':
            return 's';
    }
})
</script>

<style lang="css" scoped>
span {
    font-family: "Draw Steel Glyphs222";
}
</style>
