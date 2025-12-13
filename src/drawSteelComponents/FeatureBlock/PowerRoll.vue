<template>
    <div class="power-roll">
        <span class="bold">{{ model?.roll }}</span>
        <span class="tier-1" v-if="model?.tier1">
            <span class="glyph">
                    <DsGlyph font-size="1.6em">tier1</DsGlyph>
            </span>
            &nbsp;
            <component :is="glyphify(model?.tier1)" />
        </span>
        <span class="tier-2" v-if="model?.tier2">
            <span class="glyph">
                    <DsGlyph font-size="1.6em">tier2</DsGlyph>
            </span>
            &nbsp;
            <component :is="glyphify(model?.tier2)" />
        </span>
        <span class="tier-3" v-if="model?.tier3">
            <span class="glyph">
                    <DsGlyph font-size="1.6em">tier3</DsGlyph>
            </span>
            &nbsp;
            <component :is="glyphify(model?.tier3)" />
        </span>
    </div>
</template>

<script setup lang="ts">
import { h, defineComponent } from 'vue';
import { PowerRoll } from '@model/PowerRoll';
import DsGlyph from '@drawSteelComponents/Common/DsGlyph.vue';

const props = defineProps<{
    model?: PowerRoll,
}>();

const glyphify = (str: string | undefined) => {
    if (!str) return null;

    // Check for both patterns
    const startPattern = /^(\d+\s*\+\s*)([AIMPR])/;
    const comparisonPattern = /([AIMPR]) ([<>=]) (WEAK|AVERAGE|STRONG)/;
    
    const startMatch = str.match(startPattern);
    const comparisonMatch = str.match(comparisonPattern);
    
    // If both patterns exist, process both
    if (startMatch && comparisonMatch) {
        const prefix = startMatch[1]; // The "2 + " part
        const startLetter = startMatch[2]; // The letter from start
        const parts = str.split(comparisonPattern);
        const compLetter = comparisonMatch[1]; // Letter from comparison
        const operator = comparisonMatch[2]; // The operator
        const tier = comparisonMatch[3]; // The tier
        
        return defineComponent({
            render() {
                const elements = [];
                elements.push(prefix);
                elements.push(h(DsGlyph, null, () => startLetter.toLowerCase()));
                
                // Add text between the two patterns (if any)
                const between = str.slice(startMatch[0].length, comparisonMatch.index);
                if (between) {
                    elements.push(between);
                }
                
                // Add the comparison block
                elements.push(h(DsGlyph, null, () => "block-start"));
                elements.push(h(DsGlyph, null, () => compLetter.toLowerCase()));
                elements.push(h(DsGlyph, null, () => operator));
                elements.push(h(DsGlyph, null, () => tier.toLowerCase()));
                elements.push(h(DsGlyph, null, () => "block-end"));
                elements.push(' ');
                
                // Add text after comparison pattern
                if (parts[4]) {
                    elements.push(parts[4]);
                }
                
                return h('span', {}, elements);
            }
        });
    }
    
    // Check if string starts with pattern like "2 + M", "10+R", "5 + A", etc.
    if (startMatch) {
        const prefix = startMatch[1]; // The "2 + " part
        const letter = startMatch[2]; // The letter (A, I, M, P, or R)
        const remainder = str.slice(startMatch[0].length); // Rest of the string
        
        return defineComponent({
            render() {
                const elements = [];
                elements.push(prefix);
                elements.push(h(DsGlyph, null, () => letter.toLowerCase()));
                if (remainder) {
                    elements.push(remainder);
                }
                return h('span', {}, elements);
            }
        });
    }

    // Check if string contains pattern like "R < WEAK", "M > AVERAGE", "A = STRONG", etc.
    if (comparisonMatch) {
        const parts = str.split(comparisonPattern);
        const letter = comparisonMatch[1]; // Extract the matched letter (R, M, A, P, or I)
        const operator = comparisonMatch[2]; // Extract the matched operator (<, >, or =)
        const tier = comparisonMatch[3]; // Extract the matched tier (WEAK, AVERAGE, or STRONG)

        // Return a component definition that can be used with :is
        return defineComponent({
            render() {
                const elements = [];

                // Add text before the pattern
                if (parts[0]) {
                    elements.push(parts[0]);
                }

                // Add the three glyphs with the matched letter, operator, and
                // tier and add the start/end pieces
                elements.push(h(DsGlyph, null, () => "block-start"));
                elements.push(h(DsGlyph, null, () => letter.toLowerCase()));
                elements.push(h(DsGlyph, null, () => operator));
                elements.push(h(DsGlyph, null, () => tier.toLowerCase()));
                elements.push(h(DsGlyph, null, () => "block-end"));
                elements.push(' ');

                // Add text after the pattern (parts[4] because split with 3 capture groups creates extra elements)
                if (parts[4]) {
                    elements.push(parts[4]);
                }

                return h('span', {}, elements);
            }
        });
    }

    // If no special text, return a simple component that renders the string
    return defineComponent({
        render() {
            return h('span', {}, str);
        }
    });
}
</script>

<style lang="scss" scoped>
.power-roll {
    display: flex;
    flex-direction: column;
}

.tier-1,
.tier-2,
.tier-3,
.crit {
    display: flex;
    align-items: center;
}

.bold {
    font-weight: bold;
}

.glyph {
    height: 0;
    padding-top: 0.4em;
    display: flex;
    align-items: center;
}
</style>
