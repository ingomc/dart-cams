<script lang="ts">
    import { onMount } from 'svelte';
    import { slide } from 'svelte/transition';

    export let id: string;
    export let title: string;
    export let icon: string;
    export let active = '';
    let reducedMotion = false;

    onMount(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => reducedMotion = media.matches;
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    });
</script>

<section class="settings-section" class:open={active === id}>
    <h3>
        <button type="button" id={`${id}-trigger`} aria-expanded={active === id}
            aria-controls={`${id}-content`} on:click={() => active = active === id ? '' : id}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d={icon} />
            </svg>
            <span>{title}</span>
            <span class="chevron" aria-hidden="true"></span>
        </button>
    </h3>
    {#if active === id}
        <div id={`${id}-content`} aria-labelledby={`${id}-trigger`} inert={active !== id}
            transition:slide={{ duration: reducedMotion ? 0 : 200 }}>
            <slot />
        </div>
    {/if}
</section>

<style>
    .settings-section {
        flex: none;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-background);
        overflow: hidden;
    }
    h3 { margin: 0; }
    button {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        width: 100%;
        min-height: 44px;
        padding: 10px 12px;
        border: 0;
        background: transparent;
        color: var(--color-text);
        font: 500 16px/1.3 var(--font-display);
        text-align: left;
        cursor: pointer;
        transition: background 150ms ease;
    }
    button:hover, .open button { background: var(--color-surface-raised); }
    button:focus-visible { outline: 2px solid var(--color-brand-text); outline-offset: -3px; }
    svg { flex: none; color: var(--color-text-secondary); }
    .open svg { color: var(--color-brand-text); }
    .chevron {
        flex: none;
        width: 7px;
        height: 7px;
        margin: 0 3px 0 auto;
        border-right: 2px solid var(--color-text-muted);
        border-bottom: 2px solid var(--color-text-muted);
        transform: rotate(45deg);
        transition: transform 200ms ease;
    }
    .open .chevron { transform: translateY(3px) rotate(225deg); border-color: var(--color-brand-text); }
    @media (prefers-reduced-motion: reduce) { button, .chevron { transition: none; } }
</style>
