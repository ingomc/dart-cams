<script lang="ts">
    import { createEventDispatcher, onDestroy } from "svelte";
    import type { CamSetting } from "../types";
    import { getTransformStyle, getMaskStyle, srcObject } from "../utils";
    import { defaultCamSettings } from "../constants";
    import { alignDartboard } from "../boardAlignment";

    export let editingCam: "cam1" | "cam2";
    export let settings: CamSetting;
    export let videoSource: MediaProvider | null;

    const dispatch = createEventDispatcher();

    function close() {
        dispatch("close");
    }

    let showMaskSettings = false;
    let showImageSettings = false;
    let previewVideo: HTMLVideoElement;
    let previewWidth = 0;
    let previewHeight = 0;
    let videoWidth = 0;
    let videoHeight = 0;
    let calibrating = false;
    let alignmentMessage = "";
    let previousSettings: CamSetting | null = null;
    let requestId = 0;

    onDestroy(() => { requestId++; });

    async function autoAlign() {
        if (!previewVideo || calibrating) return;
        const id = ++requestId;
        const source = videoSource;
        const before = { ...settings };
        calibrating = true;
        alignmentMessage = "Dartboard wird gesucht …";
        try {
            const result = await alignDartboard(previewVideo);
            if (id !== requestId || source !== videoSource) return;
            if (!result) {
                alignmentMessage = "Kein Dartboard erkannt. Bitte Board und Beleuchtung prüfen.";
                return;
            }
            previousSettings = before;
            const alignment = {
                ...result.alignment,
                topAngle: result.alignment.topAngle ?? before.autoAlignment?.topAngle ?? null,
            };
            settings = {
                ...settings,
                scale: 1,
                scaleX: 1,
                scaleY: 1,
                rotate: result.alignment.topAngle === null ? before.rotate : 0,
                x: 0,
                y: 0,
                perspective: defaultCamSettings.perspective,
                rotateX: 0,
                rotateY: 0,
                skewX: 0,
                skewY: 0,
                autoAlignment: alignment,
            };
            alignmentMessage = result.warning ?? "Dartboard ausgerichtet und für diese Kamera gespeichert.";
        } catch (error) {
            console.error("Automatische Ausrichtung fehlgeschlagen:", error);
            alignmentMessage = error instanceof Error ? error.message : "Ausrichtung fehlgeschlagen.";
        } finally {
            if (id === requestId) calibrating = false;
        }
    }

    function undoAlignment() {
        if (!previousSettings) return;
        settings = previousSettings;
        previousSettings = null;
        alignmentMessage = "Vorherige Ausrichtung wiederhergestellt.";
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click={close}>
    <div class="modal-content" on:click|stopPropagation>
        <div class="modal-header">
            <h2>
                Einstellungen {editingCam === "cam1" ? "Kamera 1" : "Kamera 2"}
            </h2>
            <button class="close-btn" on:click={close}>&times;</button>
        </div>

        <div class="modal-body">
            <div class="preview-container" style={getMaskStyle(settings)} bind:clientWidth={previewWidth} bind:clientHeight={previewHeight}>
                <!-- svelte-ignore a11y-media-has-caption -->
                <video
                    bind:this={previewVideo}
                    use:srcObject={videoSource}
                    autoplay
                    playsinline
                    muted
                    on:loadedmetadata={() => { videoWidth = previewVideo.videoWidth; videoHeight = previewVideo.videoHeight; }}
                    on:resize={() => { videoWidth = previewVideo.videoWidth; videoHeight = previewVideo.videoHeight; }}
                    style={getTransformStyle(settings, editingCam, { width: previewWidth, height: previewHeight, videoWidth, videoHeight })}
                ></video>
                <!-- Hilfskreis für Dartboard -->
                <div class="guide-circle" style="width: {Math.min(previewWidth, previewHeight) * 0.7}px; height: {Math.min(previewWidth, previewHeight) * 0.7}px;"></div>
            </div>

            <div class="controls-panel">
                <button class="align-btn" on:click={autoAlign} disabled={calibrating || !videoSource}>
                    {calibrating ? "Ausrichtung läuft …" : "Dartboard automatisch ausrichten"}
                </button>
                {#if previousSettings}
                    <button class="undo-btn" on:click={undoAlignment} disabled={calibrating}>Ausrichtung rückgängig machen</button>
                {/if}
                {#if alignmentMessage}<p class="alignment-message" role="status">{alignmentMessage}</p>{/if}
                <hr />
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Scale ({settings.scale})</label>
                    <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.01"
                        bind:value={settings.scale}
                    />
                </div>
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Scale X ({settings.scaleX})</label>
                    <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.01"
                        bind:value={settings.scaleX}
                    />
                </div>
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Scale Y ({settings.scaleY})</label>
                    <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.01"
                        bind:value={settings.scaleY}
                    />
                </div>
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Rotate Z ({settings.rotate}°)</label>
                    <input
                        type="range"
                        min="-180"
                        max="180"
                        step="1"
                        bind:value={settings.rotate}
                    />
                </div>
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Move X ({settings.x}px)</label>
                    <input
                        type="range"
                        min="-500"
                        max="500"
                        step="1"
                        bind:value={settings.x}
                    />
                </div>
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Move Y ({settings.y}px)</label>
                    <input
                        type="range"
                        min="-500"
                        max="500"
                        step="1"
                        bind:value={settings.y}
                    />
                </div>

                <hr />

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Perspective ({settings.perspective}px)</label>
                    <input
                        type="range"
                        min="0"
                        max="2000"
                        step="10"
                        bind:value={settings.perspective}
                    />
                    <small>(0 = aus, kleine Werte = starker 3D Effekt)</small>
                </div>
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Rotate X (Tilt Up/Down) ({settings.rotateX}°)</label>
                    <input
                        type="range"
                        min="-80"
                        max="80"
                        step="1"
                        bind:value={settings.rotateX}
                    />
                </div>
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label
                        >Rotate Y (Tilt Left/Right) ({settings.rotateY}°)</label
                    >
                    <input
                        type="range"
                        min="-80"
                        max="80"
                        step="1"
                        bind:value={settings.rotateY}
                    />
                </div>

                <hr />

                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Skew X ({settings.skewX}°)</label>
                    <input
                        type="range"
                        min="-60"
                        max="60"
                        step="1"
                        bind:value={settings.skewX}
                    />
                </div>
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <div class="control-group">
                    <label>Skew Y ({settings.skewY}°)</label>
                    <input
                        type="range"
                        min="-60"
                        max="60"
                        step="1"
                        bind:value={settings.skewY}
                    />
                </div>

                <hr />

                <hr />

                <!-- Bildanpassungen Collapsible -->
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div
                    class="collapsible-header"
                    on:click={() => (showImageSettings = !showImageSettings)}
                >
                    <span>Bildanpassungen</span>
                    <span class="arrow" class:open={showImageSettings}>▼</span>
                </div>

                {#if showImageSettings}
                    <div class="collapsible-content">
                        <div class="control-group">
                            <label for="brightness">Helligkeit ({settings.brightness}%)</label>
                            <input
                                id="brightness"
                                type="range"
                                min="0"
                                max="200"
                                step="1"
                                bind:value={settings.brightness}
                            />
                        </div>
                        <div class="control-group">
                            <label for="contrast">Kontrast ({settings.contrast}%)</label>
                            <input
                                id="contrast"
                                type="range"
                                min="0"
                                max="200"
                                step="1"
                                bind:value={settings.contrast}
                            />
                        </div>
                        <div class="control-group">
                            <label for="saturate">Sättigung ({settings.saturate}%)</label>
                            <input
                                id="saturate"
                                type="range"
                                min="0"
                                max="200"
                                step="1"
                                bind:value={settings.saturate}
                            />
                        </div>
                        <div class="control-group">
                            <label for="sharpness">Schärfe ({settings.sharpness})</label>
                            <input
                                id="sharpness"
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                bind:value={settings.sharpness}
                            />
                        </div>
                        <button
                            class="reset-btn small"
                            on:click={() => {
                                settings.brightness = 100;
                                settings.contrast = 100;
                                settings.saturate = 100;
                                settings.sharpness = 0;
                            }}>Reset Bild</button
                        >
                    </div>
                {/if}

                <hr />

                <!-- Maske Collapsible -->
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div
                    class="collapsible-header"
                    on:click={() => (showMaskSettings = !showMaskSettings)}
                >
                    <span>Maske / Zuschnitt</span>
                    <span class="arrow" class:open={showMaskSettings}>▼</span>
                </div>

                {#if showMaskSettings}
                    <div class="collapsible-content">
                        <div class="control-group">
                            <label
                                style="display: flex; align-items: center; gap: 10px; cursor: pointer;"
                            >
                                <input
                                    type="checkbox"
                                    bind:checked={settings.maskVisible}
                                    style="width: auto;"
                                />
                                <span>Runde Maske aktivieren</span>
                            </label>
                        </div>

                        {#if settings.maskVisible}
                            <!-- svelte-ignore a11y-label-has-associated-control -->
                            <div class="control-group">
                                <label
                                    >Mask Radius ({settings.maskRadius}%)</label
                                >
                                <input
                                    type="range"
                                    min="10"
                                    max="100"
                                    step="1"
                                    bind:value={settings.maskRadius}
                                />
                            </div>
                            <!-- svelte-ignore a11y-label-has-associated-control -->
                            <div class="control-group">
                                <label
                                    >Mask Feather ({settings.maskFeather}%)</label
                                >
                                <input
                                    type="range"
                                    min="0"
                                    max="50"
                                    step="1"
                                    bind:value={settings.maskFeather}
                                />
                            </div>
                        {/if}
                    </div>
                {/if}

                <button
                    class="reset-btn"
                    on:click={() => {
                        settings = { ...defaultCamSettings };
                        previousSettings = null;
                        alignmentMessage = "Einstellungen zurückgesetzt.";
                    }}>Reset</button
                >
            </div>
        </div>
    </div>
</div>

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.8);
        z-index: 1000;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .modal-content {
        background: #222;
        width: 90vw;
        height: 90vh;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .modal-header {
        padding: 10px 20px;
        background: #333;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: relative;
        z-index: 20;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1.2rem;
    }

    .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 2rem;
        cursor: pointer;
    }

    .modal-body {
        flex: 1;
        display: flex;
        overflow: hidden;
    }

    .preview-container {
        flex: 2;
        background: black;
        position: relative;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .preview-container video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        position: absolute;
        top: 0;
        left: 0;
    }

    .guide-circle {
        position: absolute;
        width: 340px;
        height: 340px;
        border: 2px dashed rgba(255, 0, 0, 0.5);
        border-radius: 50%;
        pointer-events: none;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .controls-panel {
        flex: 1;
        padding: 20px;
        background: #2a2a2a;
        overflow-y: auto;
        min-width: 300px;
        border-left: 1px solid #444;
        position: relative;
        z-index: 20;
    }

    .control-group {
        margin-bottom: 15px;
        display: flex;
        flex-direction: column;
    }

    .control-group label {
        margin-bottom: 5px;
        font-size: 0.9rem;
        color: #ccc;
    }

    .control-group input[type="range"] {
        width: 100%;
    }

    .reset-btn {
        margin-top: 20px;
        width: 100%;
        padding: 10px;
        background: #d32f2f;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .align-btn, .undo-btn {
        width: 100%;
        padding: 10px;
        border: 0;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        margin-bottom: 8px;
    }
    .align-btn { background: #1976d2; }
    .undo-btn { background: #555; }
    .align-btn:disabled, .undo-btn:disabled { opacity: 0.55; cursor: default; }
    .alignment-message { color: #ddd; font-size: 0.9rem; line-height: 1.4; }

    .reset-btn:hover {
        background: #b71c1c;
    }

    .reset-btn.small {
        margin-top: 10px;
        padding: 5px;
        font-size: 0.8rem;
        background: #555;
    }

    .reset-btn.small:hover {
        background: #666;
    }

    .collapsible-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        background: #333;
        cursor: pointer;
        border-radius: 4px;
        margin-bottom: 5px;
        user-select: none;
    }

    .collapsible-header:hover {
        background: #444;
    }

    .collapsible-header .arrow {
        transition: transform 0.3s;
        font-size: 0.8rem;
    }

    .collapsible-header .arrow.open {
        transform: rotate(180deg);
    }

    .collapsible-content {
        padding: 10px;
        background: #252525;
        border-radius: 4px;
        margin-bottom: 15px;
    }
</style>
