<script lang="ts">
	import { base } from '$app/paths';
	import StreamSceneControls from './StreamSceneControls.svelte';
	import type { LivestreamClient } from '$lib/streaming/client';
	import { isStreamActive, type StreamState } from '$lib/streaming/protocol';
	import { streamSlateUrl } from '$lib/streaming/scenes';
	import { STREAM_PROFILE } from '$lib/streaming/profile';
	export let client: LivestreamClient | undefined;
	export let state: StreamState;
	export let onStart: () => void;
	let viewerUrl = state.viewerUrl;
	let rtmpUrl = state.rtmpUrl;
	let streamKey = '';
	let copied = false;
	$: active = isStreamActive(state.phase);
	$: windowCapture = client?.captureMode === 'window';
	$: status = state.phase === 'live' ? `Sendet ${state.scene === 'live' ? 'Kameras' : state.scene === 'start' ? 'Startbild' : 'Pausenbild'}` : state.phase === 'selecting' ? (windowCapture ? 'Dartcams-Fenster auswählen…' : 'Dartcams-Tab auswählen…') :
		state.phase === 'previewing' ? 'Aufnahme prüfen' :
		state.phase === 'connecting' ? 'Stream verbindet…' : state.phase === 'error' ? 'Stream gestoppt' :
		state.configured ? 'Bereit zum Streamen' : state.helperConnected ? 'Helfer verbunden' : 'Helfer nicht verbunden';
	async function connect() {
		await client?.connect();
		if (client?.state.helperConnected) { viewerUrl = client.state.viewerUrl; rtmpUrl = client.state.rtmpUrl; }
	}
	async function save() {
		if (client && await client.configure(viewerUrl, rtmpUrl, streamKey)) {
			streamKey = '';
			viewerUrl = client.state.viewerUrl;
			rtmpUrl = client.state.rtmpUrl;
		}
	}
	async function copyLink() {
		try { await navigator.clipboard.writeText(state.viewerUrl); copied = true; }
		catch { copied = false; }
	}
	function capturePreview(node: HTMLVideoElement, source: MediaStream | null) {
		node.srcObject = source;
		return {
			update(value: MediaStream | null) { node.srcObject = value; },
			destroy() { node.srcObject = null; },
		};
	}
</script>

<div class="stream-settings">
	<div class="stream-status">
		<span class="ui-badge" class:ui-badge--success={state.phase === 'live'} class:ui-badge--error={state.phase === 'error'} role="status">{status}</span>
		{#if !active}
			<button class="ui-button ui-button--secondary ui-button--small" type="button" disabled={state.busy} on:click={connect}>
				{state.busy ? 'Verbinde…' : state.helperConnected ? 'Erneut verbinden' : 'Helfer verbinden'}
			</button>
		{/if}
	</div>
	{#if state.helperConnected && !active}
		<form on:submit|preventDefault={save}>
			<label class="ui-label" for="stream-viewer-url">Zuschauer-Link</label>
			<input id="stream-viewer-url" class="ui-field" type="url" bind:value={viewerUrl} required disabled={state.busy} spellcheck="false" />
			<label class="ui-label" for="stream-rtmp-url">RTMP-Server</label>
			<input id="stream-rtmp-url" class="ui-field" type="text" bind:value={rtmpUrl} required disabled={state.busy} spellcheck="false" />
			<label class="ui-label" for="stream-key">Stream-Key</label>
			<input id="stream-key" class="ui-field" type="password" bind:value={streamKey} autocomplete="off" spellcheck="false" disabled={state.busy}
				placeholder={state.configured ? 'Im Helfer hinterlegt · bis zum Neustart' : 'Owncast-Stream-Key'} />
			<button class="ui-button ui-button--secondary" type="submit" disabled={state.busy}>Verbindung übernehmen</button>
		</form>
	{/if}
	{#if state.message}<p class="stream-message" role="status">{state.message}</p>{/if}
	{#if state.phase === 'previewing'}
		<p class="stream-hint">Zeigt die Vorschau nur dein Dartcams-Fenster? Firefox meldet den Quellentyp nicht. Die Vorschau bleibt bis zur Bestätigung auf diesem Computer.</p>
		<video class="capture-preview" use:capturePreview={client?.capturePreview ?? null} autoplay muted playsinline aria-label="Vorschau der ausgewählten Aufnahme"></video>
		<button class="ui-button ui-button--primary" type="button" on:click={onStart}>Dieses Fenster streamen</button>
		<button class="ui-button ui-button--secondary" type="button" on:click={() => client?.stop()}>Abbrechen</button>
	{:else if state.configured || active}
		{#if windowCapture}
			<p class="stream-hint">Firefox: das Fenster mit Dartcams freigeben. Für ein sauberes Sendebild Dartcams im Vollbild öffnen und im selben Tab bleiben; Fensterleisten und Tabwechsel sind sonst im Live-Bild sichtbar.</p>
		{/if}
		<div class="scene-selection">
			<span class="ui-label">Sendebild</span>
			<StreamSceneControls scene={state.scene} disabled={state.busy || !client} onSelect={scene => client?.setScene(scene)} />
			{#if state.scene !== 'live'}
				<img class="slate-preview" src={streamSlateUrl(state.scene, base)}
					alt={state.scene === 'start' ? 'Startbild: Gleich geht’s los' : 'Pausenbild: Kurze Spielpause'} width="1672" height="941" />
			{/if}
			<p class="stream-hint">{active ? 'Deine Kameras bleiben sichtbar. Zuschauer sehen das gewählte Sendebild zeitversetzt.' : 'Der Stream beginnt mit dem gewählten Sendebild.'}</p>
		</div>
		{#if active}
			<button class="ui-button ui-button--primary" type="button" on:click={() => client?.stop()}>Stream stoppen</button>
		{:else}
			<button class="ui-button ui-button--primary" type="button" disabled={state.busy || !!streamKey || viewerUrl !== state.viewerUrl || rtmpUrl !== state.rtmpUrl} on:click={onStart}>Livestream starten</button>
		{/if}
		<p class="stream-hint">{windowCapture ? 'Dartcams-Fenster' : 'Dartcams-Tab'} · {STREAM_PROFILE.height}p / {STREAM_PROFILE.fps} fps · Video bis {STREAM_PROFILE.videoMaxBitsPerSecond / 1_000_000} Mbit/s · ohne Ton</p>
		<div class="viewer-actions">
			<a class="ui-button ui-button--secondary" href={state.viewerUrl} target="_blank" rel="noopener noreferrer">Zuschaueransicht ↗</a>
			<button class="ui-button ui-button--secondary" type="button" on:click={copyLink}>{copied ? 'Kopiert' : 'Link kopieren'}</button>
		</div>
	{/if}
</div>

<style>
	.stream-settings { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
	.scene-selection { display: flex; flex-direction: column; gap: 8px; }
	.slate-preview { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: contain; border-radius: var(--radius-sm); background: var(--color-background); border: 1px solid var(--color-border); }
	.capture-preview { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; border-radius: var(--radius-sm); background: var(--color-background); border: 1px solid var(--color-border); }
	.stream-status { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
	form { display: flex; flex-direction: column; gap: 8px; }
	form .ui-label:not(:first-child) { margin-top: 4px; }
	.stream-message { margin: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
	.stream-hint { margin: 0; font-size: 12px; color: var(--color-text-muted); }
	.viewer-actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
