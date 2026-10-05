<script lang="ts">
    import { defaultOverlaySizes, overlaySizeControls, type OverlaySizes } from '../overlaySizes';

    export let sizes: OverlaySizes = { ...defaultOverlaySizes };
</script>

<div class="overlay-size-settings">
    {#each overlaySizeControls as control}
        <div class="overlay-size-control">
            <label class="ui-label" for="overlay-size-{control.key}">
                <span>{control.label}</span>
                <output for="overlay-size-{control.key}">{sizes[control.key]}%</output>
            </label>
            <input class="ui-range" id="overlay-size-{control.key}" type="range"
                min={control.min} max={control.max} step={control.step} bind:value={sizes[control.key]}
                aria-valuetext="{sizes[control.key]} Prozent" />
        </div>
    {/each}
    <button type="button" class="ui-button ui-button--quiet ui-button--small"
        on:click={() => sizes = { ...defaultOverlaySizes }}>Größen zurücksetzen</button>
</div>

<style>
    .overlay-size-settings {
        display: grid;
        min-width: 0;
        gap: var(--space-2);
    }

    .ui-label {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
        margin: 0;
    }

    output {
        color: var(--color-text);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0;
        text-transform: none;
    }
</style>
