<script lang="ts">
    import FloatingWebcam from "$lib/FloatingWebcam.svelte";
    import type { MatchData } from "../types";

    export let scoringUrl: string;
    export let wsUrl: string;
    export let cropTop: number;
    export let cropBottom: number;
    export let iframeZoom: number;
    export let showFloatingWebcam: boolean;
    export let showIframe: boolean;
    export let matches: MatchData["match"][];
    export let videoDevices: MediaDeviceInfo[];

    let showIframeControls = false;
</script>

{#if showIframe}
    <div class="iframe-section" style="flex: 1;">
        <!-- Overlay to prevent iframe from capturing mouse events during drag (handled by parent via class/overlay, but here we can just expose a slot or prop if needed, or parent handles the overlay on top of this component) -->
        <!-- Actually, the overlay was: -->
        <!-- {#if isDraggingVertical || isDraggingHorizontal} <div class="iframe-overlay"></div> {/if} -->
        <!-- We will let the parent handle the overlay or pass a prop 'isDragging' -->
        <slot name="overlay"></slot>

        <div class="iframe-controls" class:visible={showIframeControls}>
            <label for="url">Scoring URL:</label>
            <input
                type="text"
                id="url"
                bind:value={scoringUrl}
                placeholder="https://..."
            />

            {#if matches.length > 0}
                <div style="margin-left: 10px; color: #aaa; font-size: 0.8rem;">
                    {matches.length} Matches geladen
                </div>
            {/if}

            <label for="wsurl" style="margin-left: 10px;">WS URL:</label>
            <input
                type="text"
                id="wsurl"
                bind:value={wsUrl}
                placeholder="wss://..."
            />

            <label for="crop" style="margin-left: 10px;">Crop Top:</label>
            <input
                type="number"
                id="crop"
                bind:value={cropTop}
                min="0"
                style="width: 50px;"
            />

            <label for="cropBottom" style="margin-left: 10px;">Bottom:</label>
            <input
                type="number"
                id="cropBottom"
                bind:value={cropBottom}
                min="0"
                style="width: 50px;"
            />

            <label for="zoom" style="margin-left: 10px;">Zoom:</label>
            <input
                type="range"
                id="zoom"
                bind:value={iframeZoom}
                min="0.5"
                max="2"
                step="0.1"
                style="width: 80px;"
                title="Zoom: {Math.round(iframeZoom * 100)}%"
            />

            <button
                class="toggle-webcam-btn"
                on:click={() => (showFloatingWebcam = !showFloatingWebcam)}
                title="Zusätzliche Webcam anzeigen"
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
                    style="margin-right: 5px;"
                    ><path
                        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                    ></path><circle cx="12" cy="13" r="4"></circle></svg
                >
                {showFloatingWebcam ? "Webcam schließen" : "Webcam öffnen"}
            </button>

            <button
                class="toggle-webcam-btn"
                on:click={() => (showIframe = false)}
                title="Iframe ausblenden"
                style="margin-left: 10px;"
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
                    style="margin-right: 5px;"
                    ><path
                        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                    ></path><line x1="1" y1="1" x2="23" y2="23"></line></svg
                >
                Hide
            </button>

            <button
                class="toggle-bar-btn"
                on:click={() => (showIframeControls = !showIframeControls)}
                title={showIframeControls ? "Ausblenden" : "Einblenden"}
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
                    style="transform: rotate({showIframeControls
                        ? 180
                        : 0}deg); transition: transform 0.3s;"
                    ><polyline points="6 9 12 15 18 9"></polyline></svg
                >
            </button>
        </div>
        <div class="iframe-wrapper">
            <iframe
                src={scoringUrl}
                title="Live Scoring"
                frameborder="0"
                style="
					margin-top: -{cropTop}px; 
					width: {100 / iframeZoom}%;
					height: calc((100% + {cropTop}px + {cropBottom}px) / {iframeZoom});
					transform: scale({iframeZoom});
					transform-origin: 0 0;
				"
            ></iframe>
        </div>
    </div>
{:else}
    <!-- Button to show iframe again when hidden -->
    <button
        class="show-iframe-btn"
        on:click={() => (showIframe = true)}
        title="Iframe anzeigen"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
            ></path><circle cx="12" cy="12" r="3"></circle></svg
        >
    </button>
{/if}

<FloatingWebcam bind:visible={showFloatingWebcam} {videoDevices} />

<style>
    .iframe-section {
        display: flex;
        flex-direction: column;
        position: relative;
        min-height: 10%;
        overflow: hidden;
    }

    .iframe-controls {
        padding: 5px 10px;
        background: rgba(51, 51, 51, 0.9);
        display: flex;
        gap: 10px;
        align-items: center;
        font-size: 0.8rem;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        z-index: 10;
        transform: translateY(-100%);
        transition: transform 0.3s ease-in-out;
        box-sizing: border-box;
    }

    .iframe-controls.visible {
        transform: translateY(0);
    }

    .iframe-controls input {
        background: #222;
        border: 1px solid #444;
        color: white;
        padding: 2px 5px;
    }

    .iframe-controls input[type="text"] {
        flex: 1;
    }

    .toggle-webcam-btn {
        margin-left: 10px;
        padding: 4px 8px;
        background: #444;
        color: white;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        display: flex;
        align-items: center;
    }

    .toggle-webcam-btn:hover {
        background: #555;
    }

    .iframe-wrapper {
        flex: 1;
        overflow: hidden;
        position: relative;
        background: white;
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

    iframe {
        width: 100%;
        background: white;
        border: none;
    }

    .show-iframe-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #333;
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        transition: background 0.3s;
    }

    .show-iframe-btn:hover {
        background: #444;
    }
</style>
