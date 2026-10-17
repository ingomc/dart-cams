<script lang="ts">
	import { streamScenes, type StreamScene } from '$lib/streaming/scenes';
	export let scene: StreamScene;
	export let onSelect: (scene: StreamScene) => void;
	export let disabled = false;
	export let compact = false;
</script>

<div class="stream-scenes" class:compact role="group" aria-label="Sendebild für Zuschauer">
	{#each streamScenes as option}
		<button type="button" class="ui-button ui-button--secondary" {disabled}
			aria-label={option.label} aria-pressed={scene === option.value}
			title={option.value === 'live' ? 'Kameras und Spielstände senden' : option.value === 'start' ? '„Gleich geht’s los“ senden' : '„Kurze Spielpause“ senden'}
			on:click={() => onSelect(option.value)}>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
				stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d={option.icon} /></svg>
			<span>{compact && option.value === 'start' ? 'Start' : option.label}</span>
		</button>
	{/each}
</div>

<style>
	.stream-scenes { display: flex; gap: 4px; min-width: 0; }
	.stream-scenes button { flex: 1; gap: 6px; min-width: 0; padding: 8px 12px; white-space: nowrap; }
	.stream-scenes button[aria-pressed="true"] { background: var(--color-brand-active); border-color: var(--color-brand-text); color: var(--color-text); }
	.compact button { flex: none; min-height: 28px; padding: 3px 7px; font-size: 11px; }
	.compact svg { width: 14px; height: 14px; }
	@media (max-width: 1100px) { .compact span { display: none; } }
</style>
