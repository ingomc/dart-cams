<script lang="ts">
    import { createEventDispatcher, onDestroy } from "svelte";
    import LiveScoreboard from "./LiveScoreboard.svelte";
    import CameraEditor from "./CameraEditor.svelte";
    import type { MatchData, CamSetting } from "../types";
    import type { ScoringStatus } from "../liveScoring";
    import { listBoards, matchForBoard } from "../scoring";
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
    export let videoDevices: MediaDeviceInfo[];
    export let matches: MatchData["match"][];
    export let boardKey: string;
    export let scoringStatus: ScoringStatus;
    export let scorePos: { x: number; y: number };
    export let editLocked = false;

    // Expose the camera elements for stream and frame measurements.
    export let videoElement: HTMLVideoElement | undefined = undefined;
    export let containerElement: HTMLElement | undefined = undefined;

    const dispatch = createEventDispatcher();

    let showControls = false;
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
    $: availableBoards = listBoards(matches, [boardKey]);
    $: if (draft && editingDeviceId && selectedDeviceId !== editingDeviceId) cancelEdit();

    onDestroy(() => {
        streamRequest++;
        activeStream?.getTracks().forEach((track) => track.stop());
    });

    // Stream logic
    async function startStream(deviceId: string, el: HTMLVideoElement) {
        const request = ++streamRequest;
        if (!deviceId || !el) return;
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
            if (request === streamRequest) streamError = "Kamerastream nicht verfügbar. Gerät oder Berechtigung prüfen.";
        }
    }

    $: if (selectedDeviceId && videoElement) {
        startStream(selectedDeviceId, videoElement);
    }

    function handleScoreDragStart(e: MouseEvent | TouchEvent) {
        dispatch("scoreDragStart", { originalEvent: e });
    }

    function beginEdit() {
        if (editLocked || draft || !videoElement || !viewportWidth || !viewportHeight) return;
        editingDeviceId = selectedDeviceId;
        draft = editDraft(settings, viewportWidth, viewportHeight);
        showControls = false;
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

    {#if !draft}<div class="controls" class:visible={showControls}>
        <label for="cam-select-{camId}"
            >{camId === "cam1" ? "Kamera 1" : "Kamera 2"}:</label
        >
        <select id="cam-select-{camId}" bind:value={selectedDeviceId} disabled={editLocked || !showControls}>
            {#each videoDevices as device}
                <option value={device.deviceId}
                    >{device.label || "Kamera"} ({device.deviceId.slice(
                        0,
                        8,
                    )}...)</option
                >
            {/each}
        </select>

        {#if scoringStatus !== 'idle' || boardKey}
            <label for="board-select-{camId}" style="margin-left: 10px;"
                >Board:</label
            >
            <select
                id="board-select-{camId}"
                bind:value={boardKey}
                on:change={(event) => dispatch('boardChange', { board: event.currentTarget.value })}
                disabled={!showControls}
                style="max-width: 190px;"
            >
                <option value="">Keins</option>
                {#each availableBoards as board}
                    {@const match = matchForBoard(matches, board)}
                    <option value={board}>B{board}{match ? ` · ${match.matchPlayers.map((player) => player.playerName).join(' / ')}` : ' · kein Match'}</option>
                {/each}
            </select>
        {/if}

        <button class="gear-btn" on:click={beginEdit} disabled={editLocked || !showControls}
            title="Kamerabild bearbeiten" aria-label="Kamerabild bearbeiten">
            <span class="gear-icon" aria-hidden="true">⚙</span>
        </button>

        <button
            class="toggle-bar-btn"
            on:click={() => (showControls = !showControls)}
            title={showControls ? "Ausblenden" : "Einblenden"}
            aria-label={showControls ? "Kameramenü schließen" : "Kameramenü öffnen"}
            aria-expanded={showControls}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="transform: rotate({showControls
                    ? 180
                    : 0}deg); transition: transform 0.3s;"
                ><polyline points="6 9 12 15 18 9"></polyline></svg
            >
        </button>
    </div>{/if}
    <div class="video-wrapper" style={getMaskStyle(displayedSettings)} bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight}>
        {#if streamError}<p class="camera-error" role="alert">{streamError}</p>{/if}
        <!-- svelte-ignore a11y-media-has-caption -->
        <video
            bind:this={videoElement}
            autoplay
            playsinline
            muted
            on:loadedmetadata={() => { videoWidth = videoElement?.videoWidth ?? 0; videoHeight = videoElement?.videoHeight ?? 0; }}
            on:resize={() => { videoWidth = videoElement?.videoWidth ?? 0; videoHeight = videoElement?.videoHeight ?? 0; }}
            style={getTransformStyle(displayedSettings, camId, { width: viewportWidth, height: viewportHeight, videoWidth, videoHeight })}
        ></video>
    </div>
    {#if draft}
        <CameraEditor bind:draft frameWidth={viewportWidth} frameHeight={viewportHeight} video={videoElement}
            on:apply={applyEdit} on:cancel={cancelEdit} />
    {/if}
    {#if !draft}<div class="cam-label {camId === 'cam1' ? 'left' : 'right'}">
        <input type="text" bind:value={label} />
    </div>{/if}
</div>

<style>
    .cam-container {
        display: flex;
        flex-direction: column;
        background: black;
        border-radius: 4px;
        overflow: hidden;
        position: relative;
        min-width: 10%;
        height: 100%; /* Ensure it takes full height of container */
    }

    .controls {
        padding: 5px;
        background: rgba(51, 51, 51, 0.9);
        display: flex;
        gap: 10px;
        align-items: center;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        z-index: 10;
        transform: translateY(-100%);
        transition: transform 0.3s ease-in-out;
        box-sizing: border-box;
    }

    .controls.visible {
        transform: translateY(0);
    }

    .gear-btn {
        flex: 0 0 44px;
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.65);
        border-radius: 7px;
        color: white;
        background: rgba(20, 20, 20, 0.85);
        cursor: pointer;
    }
    .gear-btn:hover, .gear-btn:focus-visible { background: #376a9c; }
    .gear-btn:disabled { opacity: 0.45; cursor: default; }
    .gear-icon { font-size: 25px; line-height: 1; }

    select {
        flex: 1;
        min-width: 0;
        min-height: 44px;
        padding: 4px;
        background: #444;
        color: white;
        border: 1px solid #555;
    }

    .video-wrapper {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        position: relative;
    }

    .camera-error {
        position: absolute;
        z-index: 2;
        padding: 12px;
        text-align: center;
        color: white;
        background: rgba(0, 0, 0, 0.75);
    }

    video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        transform-origin: center center;
    }

    .cam-label {
        position: absolute;
        bottom: 10px;
        background: rgba(0, 0, 0, 0.6);
        padding: 5px 10px;
        border-radius: 4px;
        z-index: 20;
    }

    .cam-label.left {
        left: 10px;
    }

    .cam-label.right {
        right: 10px;
    }

    .cam-label input {
        background: transparent;
        border: none;
        color: white;
        font-size: 1.2rem;
        font-weight: bold;
        width: 100px;
        text-align: center;
        outline: none;
    }

    .cam-label input:focus {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
    }

    .toggle-bar-btn {
        position: absolute;
        bottom: -44px;
        right: 6px;
        width: 44px;
        height: 44px;
        background: rgba(32, 32, 32, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.65);
        border-radius: 7px;
        color: #ccc;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.85;
        transition:
            opacity 0.3s,
            background 0.3s,
            color 0.3s;
    }

    .toggle-bar-btn:hover, .toggle-bar-btn:focus-visible {
        opacity: 1;
        color: white;
        background: rgba(70, 70, 70, 0.9);
    }

    .ws-message-overlay {
        position: absolute;
        transform: translate(-50%, 0);
        z-index: 100;
        width: min(94%, 560px);
        max-width: 96%;
        display: flex;
        justify-content: center;
    }

    .ws-message-overlay.draggable {
        cursor: move;
        user-select: none;
        touch-action: none;
    }

    .no-match {
        position: absolute;
        z-index: 9;
        top: 58px;
        right: 10px;
        padding: 7px 10px;
        border-radius: 5px;
        background: rgba(0, 0, 0, 0.75);
        color: #ddd;
        font-size: 0.85rem;
    }
</style>
