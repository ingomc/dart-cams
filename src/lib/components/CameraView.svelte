<script lang="ts">
    import { createEventDispatcher, onDestroy } from "svelte";
    import LiveScoreboard from "./LiveScoreboard.svelte";
    import CameraEditor from "./CameraEditor.svelte";
    import type { MatchData, CamSetting } from "../types";
    import type { ScoringStatus } from "../liveScoring";
    import { matchForBoard } from "../scoring";
    import { editDraft } from "../manualEdit";
    import {
        getTransformStyle,
        getMaskStyle,
        getSharpenKernel,
    } from "../utils";

    export let camId: string;
    export let width: number; // percentage
    export let settings: CamSetting;
    export let selectedDeviceId: string;
    export let label: string;
    export let matches: MatchData["match"][];
    export let boardKey: string;
    export let scoringStatus: ScoringStatus;
    export let scorePos: { x: number; y: number };
    export let editLocked = false;
    export let ready = false;

    // Expose the camera elements for stream and frame measurements.
    export let videoElement: HTMLVideoElement | undefined = undefined;
    export let containerElement: HTMLElement | undefined = undefined;

    const dispatch = createEventDispatcher();

    let viewportWidth = 0;
    let viewportHeight = 0;
    let videoWidth = 0;
    let videoHeight = 0;
    let streamError = "";
    let activeStream: MediaStream | null = null;
    let streamRequest = 0;
    let draft: CamSetting | null = null;
    let editingDeviceId = '';
    $: displayedSettings = draft ?? settings;
    $: if (draft && editingDeviceId && selectedDeviceId !== editingDeviceId) cancelEdit();

    onDestroy(() => {
        streamRequest++;
        activeStream?.getTracks().forEach((track) => track.stop());
    });

    // Stream logic
    async function startStream(deviceId: string, el: HTMLVideoElement) {
        const request = ++streamRequest;
        if (!deviceId || !el) return;
        ready = false;
        streamError = "";
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: { exact: deviceId },
                    width: 1280,
                    height: 720,
                },
            });
            if (request !== streamRequest) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            activeStream?.getTracks().forEach((track) => track.stop());
            activeStream = stream;
            el.srcObject = stream;
        } catch (err) {
            console.error("Fehler beim Starten des Streams:", err);
            if (request === streamRequest) {
                ready = false;
                streamError = "Kamerastream nicht verfügbar. Gerät oder Berechtigung prüfen.";
            }
        }
    }

    function stopStream() {
        streamRequest++;
        activeStream?.getTracks().forEach((track) => track.stop());
        activeStream = null;
        if (videoElement) videoElement.srcObject = null;
        ready = false;
    }

    $: if (selectedDeviceId && videoElement) {
        startStream(selectedDeviceId, videoElement);
    }
    $: if (!selectedDeviceId && videoElement) stopStream();

    function handleScoreDragStart(e: MouseEvent | TouchEvent) {
        dispatch("scoreDragStart", { originalEvent: e });
    }

    export function openEditor() {
        if (editLocked || draft || !ready || !selectedDeviceId || !videoElement || !viewportWidth || !viewportHeight) return;
        editingDeviceId = selectedDeviceId;
        draft = editDraft(settings, viewportWidth, viewportHeight);
        dispatch('editStart');
    }

    function applyEdit(event: CustomEvent<CamSetting>) {
        settings = event.detail;
        draft = null;
        editingDeviceId = '';
        dispatch('editEnd');
    }

    function cancelEdit() {
        draft = null;
        editingDeviceId = '';
        dispatch('editEnd');
    }
</script>

<!-- SVG Filters for Sharpening -->
<svg style="display: none;">
    <defs>
        <filter id="sharpen-{camId}">
            <feConvolveMatrix
                order="3"
                kernelMatrix={getSharpenKernel(displayedSettings.sharpness)}
                preserveAlpha="true"
            />
        </filter>
    </defs>
</svg>

<div
    class="cam-container"
    style="width: {width}%;"
    bind:this={containerElement}
>
    <!-- Scoreboard Overlay -->
    {#if boardKey && !draft}
        {@const selectedMatch = matchForBoard(matches, boardKey)}
        {#if selectedMatch}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="ws-message-overlay draggable"
                style="left: {scorePos.x}%; top: {scorePos.y}%;"
                on:mousedown={handleScoreDragStart}
                on:touchstart={handleScoreDragStart}
            >
                <LiveScoreboard data={{ match: selectedMatch }} stale={scoringStatus !== 'live'} />
            </div>
        {:else}
            <div class="no-match" role="status">Board {boardKey}: {scoringStatus === 'connecting' ? 'Lade Match…' : 'Kein aktives Match'}</div>
        {/if}
    {/if}

    <div class="camera-heading" aria-hidden="true">Kamera {camId === 'cam1' ? '01' : '02'}</div>
    <div class="video-wrapper" style={getMaskStyle(displayedSettings)} bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight}>
        {#if !draft && (!selectedDeviceId || streamError)}
            <div class="empty-state" role={streamError ? 'alert' : 'status'}>
                <span class="empty-mark" aria-hidden="true">◎</span>
                <strong>{streamError ? 'Kamera nicht verfügbar' : 'Keine Kamera ausgewählt'}</strong>
                <p>{streamError || 'Wähle eine Kamera in den Einstellungen aus.'}</p>
                <button type="button" class="ui-button ui-button--secondary ui-button--small"
                    on:click={() => dispatch('configure')}>Einstellungen öffnen</button>
            </div>
        {:else if !draft && !ready}
            <p class="connecting" role="status">Kamera wird verbunden…</p>
        {/if}
        <!-- svelte-ignore a11y-media-has-caption -->
        <video
            bind:this={videoElement}
            autoplay
            playsinline
            muted
            on:loadedmetadata={() => { videoWidth = videoElement?.videoWidth ?? 0; videoHeight = videoElement?.videoHeight ?? 0; ready = true; }}
            on:resize={() => { videoWidth = videoElement?.videoWidth ?? 0; videoHeight = videoElement?.videoHeight ?? 0; }}
            style={getTransformStyle(displayedSettings, camId, { width: viewportWidth, height: viewportHeight, videoWidth, videoHeight })}
        ></video>
    </div>
    {#if draft}
        <CameraEditor bind:draft frameWidth={viewportWidth} frameHeight={viewportHeight} video={videoElement}
            on:apply={applyEdit} on:cancel={cancelEdit} />
    {/if}
    {#if !draft}<div class="cam-label {camId === 'cam1' ? 'left' : 'right'}">{label}</div>{/if}
</div>

<style>
    .cam-container {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 10%;
        height: 100%;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-video);
    }

    .camera-heading {
        position: absolute;
        z-index: 8;
        top: 12px;
        left: 12px;
        padding: 5px 9px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.84);
        color: var(--color-text-secondary);
        font: 600 12px/1.2 var(--font-display);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        pointer-events: none;
    }

    .video-wrapper {
        position: relative;
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        transform-origin: center center;
    }

    .empty-state {
        position: absolute;
        z-index: 3;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
        background: radial-gradient(circle at center, #242629 0%, var(--color-video) 68%);
        text-align: center;
    }

    .empty-mark {
        color: var(--color-brand-text);
        font: 500 56px/1 var(--font-display);
    }

    .empty-state strong {
        margin-top: var(--space-2);
        font: 600 22px/1.25 var(--font-display);
        text-transform: uppercase;
    }

    .empty-state p {
        max-width: 300px;
        margin: var(--space-1) 0 var(--space-3);
        color: var(--color-text-secondary);
    }

    .connecting {
        position: absolute;
        z-index: 3;
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.88);
        color: var(--color-text-secondary);
    }

    .cam-label {
        position: absolute;
        z-index: 20;
        bottom: 12px;
        max-width: min(45%, 220px);
        overflow: hidden;
        padding: 5px 12px 6px;
        border-left: 3px solid var(--color-brand);
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        background: rgba(21, 23, 25, 0.88);
        font: 600 17px/1.2 var(--font-display);
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .cam-label.left { left: 12px; }
    .cam-label.right { right: 12px; }

    .ws-message-overlay {
        position: absolute;
        z-index: 100;
        display: flex;
        justify-content: center;
        width: min(94%, 560px);
        max-width: 96%;
        transform: translate(-50%, 0);
    }

    .ws-message-overlay.draggable {
        cursor: move;
        touch-action: none;
        user-select: none;
    }

    .no-match {
        position: absolute;
        z-index: 9;
        top: 12px;
        right: 12px;
        max-width: 48%;
        padding: 6px 10px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.88);
        color: var(--color-text-secondary);
        font-size: 12px;
    }
</style>
