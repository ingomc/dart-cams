<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Scoreboard from "./Scoreboard.svelte";
    import type { MatchData, CamSetting } from "../types";
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
    export let scorePos: { x: number; y: number };

    // Expose video element for parent (e.g. for settings modal)
    export let videoElement: HTMLVideoElement | undefined = undefined;
    export let containerElement: HTMLElement | undefined = undefined;

    const dispatch = createEventDispatcher();

    let showControls = false;

    // Stream logic
    async function startStream(deviceId: string, el: HTMLVideoElement) {
        if (!deviceId || !el) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: { exact: deviceId },
                    width: 1280,
                    height: 720,
                },
            });
            el.srcObject = stream;
        } catch (err) {
            console.error("Fehler beim Starten des Streams:", err);
        }
    }

    $: if (selectedDeviceId && videoElement) {
        startStream(selectedDeviceId, videoElement);
    }

    function getMatchData(key: string): MatchData | null {
        if (!key) return null;
        const m = matches.find((x) => x.matchKey === key);
        return m ? { match: m } : null;
    }

    function handleScoreDragStart(e: MouseEvent | TouchEvent) {
        dispatch("scoreDragStart", { originalEvent: e });
    }
</script>

<!-- SVG Filters for Sharpening -->
<svg style="display: none;">
    <defs>
        <filter id="sharpen-{camId}">
            <feConvolveMatrix
                order="3"
                kernelMatrix={getSharpenKernel(settings.sharpness)}
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
    {#if boardKey}
        {@const data = getMatchData(boardKey)}
        {#if data}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="ws-message-overlay draggable"
                style="left: {scorePos.x}%; top: {scorePos.y}%;"
                on:mousedown={handleScoreDragStart}
                on:touchstart={handleScoreDragStart}
            >
                <Scoreboard {data} />
            </div>
        {/if}
    {/if}

    <div class="controls" class:visible={showControls}>
        <label for="cam-select-{camId}"
            >{camId === "cam1" ? "Kamera 1" : "Kamera 2"}:</label
        >
        <select id="cam-select-{camId}" bind:value={selectedDeviceId}>
            {#each videoDevices as device}
                <option value={device.deviceId}
                    >{device.label || "Kamera"} ({device.deviceId.slice(
                        0,
                        8,
                    )}...)</option
                >
            {/each}
        </select>

        {#if matches.length > 0}
            <label for="board-select-{camId}" style="margin-left: 10px;"
                >Board:</label
            >
            <select
                id="board-select-{camId}"
                bind:value={boardKey}
                style="max-width: 100px;"
            >
                <option value="">Keins</option>
                {#each matches as match}
                    <option value={match.matchKey}>B{match.board}</option>
                {/each}
            </select>
        {/if}

        <button
            class="settings-btn"
            on:click={() => dispatch("openSettings")}
            title="Einstellungen"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><circle cx="12" cy="12" r="3"></circle><path
                    d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                ></path></svg
            >
        </button>
        <button
            class="toggle-bar-btn"
            on:click={() => (showControls = !showControls)}
            title={showControls ? "Ausblenden" : "Einblenden"}
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
    </div>
    <div class="video-wrapper" style={getMaskStyle(settings)}>
        <!-- svelte-ignore a11y-media-has-caption -->
        <video
            bind:this={videoElement}
            autoplay
            playsinline
            muted
            style={getTransformStyle(settings, camId)}
        ></video>
    </div>
    <div class="cam-label {camId === 'cam1' ? 'left' : 'right'}">
        <input type="text" bind:value={label} />
    </div>
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

    select {
        flex: 1;
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

    .settings-btn {
        background: none;
        border: none;
        color: #aaa;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: 5px;
    }

    .settings-btn:hover {
        color: white;
        background: #444;
        border-radius: 4px;
    }

    .toggle-bar-btn {
        position: absolute;
        bottom: -20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(51, 51, 51, 0.9);
        border: none;
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
        color: #ccc;
        cursor: pointer;
        padding: 0 15px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.3;
        transition:
            opacity 0.3s,
            background 0.3s,
            color 0.3s;
    }

    .toggle-bar-btn:hover {
        opacity: 1;
        color: white;
        background: rgba(70, 70, 70, 0.9);
    }

    .ws-message-overlay {
        position: absolute;
        transform: translate(-50%, 0);
        z-index: 100;
        max-width: 90%;
        display: flex;
        justify-content: center;
    }

    .ws-message-overlay.draggable {
        cursor: move;
        user-select: none;
    }
</style>
