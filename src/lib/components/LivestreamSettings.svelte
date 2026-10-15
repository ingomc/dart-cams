<script lang="ts">
	import type { LivestreamClient } from '$lib/streaming/client';
	import { isStreamActive, type StreamState } from '$lib/streaming/protocol';
	export let client: LivestreamClient | undefined;
	export let state: StreamState;
	export let onStart: () => void;
	let viewerUrl = state.viewerUrl;
	let rtmpUrl = state.rtmpUrl;
	let streamKey = '';
	let copied = false;
	$: active = isStreamActive(state.phase);
	$: status = state.phase === 'live' ? 'Live auf Owncast' : state.phase === 'selecting' ? 'Dartcams-Tab auswählen…' :
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
	{#if state.configured || active}
		{#if active}
			<button class="ui-button ui-button--primary" type="button" on:click={() => client?.stop()}>Stream stoppen</button>
		{:else}
			<button class="ui-button ui-button--primary" type="button" disabled={state.busy || !!streamKey || viewerUrl !== state.viewerUrl || rtmpUrl !== state.rtmpUrl} on:click={onStart}>Livestream starten</button>
		{/if}
		<p class="stream-hint">Dartcams-Tab · 720p / 30 fps · ohne Ton</p>
		<div class="viewer-actions">
			<a class="ui-button ui-button--secondary" href={state.viewerUrl} target="_blank" rel="noopener noreferrer">Zuschaueransicht ↗</a>
			<button class="ui-button ui-button--secondary" type="button" on:click={copyLink}>{copied ? 'Kopiert' : 'Link kopieren'}</button>
		</div>
	{/if}
</div>

<style>
	.stream-settings { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
	.stream-status { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
	form { display: flex; flex-direction: column; gap: 8px; }
	form .ui-label:not(:first-child) { margin-top: 4px; }
	.stream-message { margin: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
	.stream-hint { margin: 0; font-size: 12px; color: var(--color-text-muted); }
	.viewer-actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
