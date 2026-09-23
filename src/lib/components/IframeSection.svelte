<script lang="ts">
    import FloatingWebcam from "$lib/FloatingWebcam.svelte";

    export let scoringUrl: string;
    export let cropTop: number;
    export let cropBottom: number;
    export let iframeZoom: number;
    export let showFloatingWebcam: boolean;
    export let showIframe: boolean;
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

</style>
