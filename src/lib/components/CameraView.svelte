<script lang="ts">
    import { createEventDispatcher, onDestroy } from "svelte";
    import { sourceKey, sourceFromKey, rectifiedSettings, type CameraSource } from '../cameraSources';
    import { DartRectifyClient, type ServerStatus } from '../dartrectify/client.js';
    import { initialConnection, connectionLabels, connectionHelp, type BridgeConnection } from '../dartrectify/connection';
    import LiveScoreboard from "./LiveScoreboard.svelte";
    import CameraEditor from "./CameraEditor.svelte";
    import BoardCelebration from "./BoardCelebration.svelte";
    import type { ScoringCelebration } from "../scoringCelebration";
    import type { MatchData, CamSetting } from "../types";
    import type { ScoringStatus } from "../liveScoring";
    import { matchForBoard } from "../scoring";
    import { editDraft } from "../manualEdit";
    import { defaultOverlaySizes, type OverlaySizes } from "../overlaySizes";
    import {
        getTransformStyle,
        getMaskStyle,
        getSharpenKernel,
    } from "../utils";

    export let camId: string;
    export let width: number; // percentage
    export let visible = true;
    export let settings: CamSetting;
    export let selectedSource: CameraSource = { kind: 'none' };
    export let bridge: BridgeConnection = initialConnection;
    export let label: string;
    export let overlaySizes: OverlaySizes = { ...defaultOverlaySizes };
    export let matches: MatchData["match"][];
    export let videoDevices: MediaDeviceInfo[] = [];
    export let availableBoards: string[] = [];
    export let boardKey: string;
    export let scoringStatus: ScoringStatus;
    export let scorePos: { x: number | null; y: number | null };
    export let configOpen = false;
    export let checkingCameras = false;
    export let editLocked = false;
    export let ready = false;
    export let celebration: ScoringCelebration | null = null;

    // Expose the camera elements for stream and frame measurements.
    export let videoElement: HTMLVideoElement | undefined = undefined;
    export let containerElement: HTMLElement | undefined = undefined;

    const dispatch = createEventDispatcher();

    let viewportWidth = 0;
    let viewportHeight = 0;
    let scoreOverlayWidth = 0;
    let scoreOverlayHeight = 0;
    let videoWidth = 0;
    let videoHeight = 0;
    let streamError = "";
    let activeStream: MediaStream | null = null;
    let streamRequest = 0;
    let draft: CamSetting | null = null;
    let editingDeviceId = '';
    let imageElement: HTMLImageElement | undefined;
    let bridgeClient: DartRectifyClient | null = null;
    let bindingKey = '';
    let boundElement: HTMLVideoElement | HTMLImageElement | undefined;
    let boardFresh = false;
    $: selectedDeviceId = sourceKey(selectedSource);
    $: rectified = selectedSource.kind === 'dartrectify';
    $: displayedSettings = rectified ? rectifiedSettings(draft ?? settings) : draft ?? settings;
    $: selectedMatch = boardKey ? matchForBoard(matches, boardKey) : null;
    $: visibleCelebration = !draft && celebration?.board === boardKey && selectedMatch &&
        celebration.matchKey === selectedMatch.matchKey ? celebration : null;
    $: if (draft && editingDeviceId && selectedDeviceId !== editingDeviceId) cancelEdit();

    function stopStream() {
        streamRequest++;
        bridgeClient?.destroy(); bridgeClient = null;
        activeStream?.getTracks().forEach(track => track.stop()); activeStream = null;
        if (videoElement) videoElement.srcObject = null;
        ready = false; boardFresh = false;
    }
    onDestroy(stopStream);

    async function startWebcam(deviceId: string, el: HTMLVideoElement, request: number) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: 1280, height: 720 } });
            if (request !== streamRequest) { stream.getTracks().forEach(track => track.stop()); return; }
            activeStream = stream; el.srcObject = stream;
        } catch {
            if (request === streamRequest) { ready = false; streamError = 'Webcam nicht verfügbar. Berechtigung prüfen oder die Kamera in DartRectify freigeben.'; }
        }
    }
    function syncSource(source: CameraSource, video: HTMLVideoElement | undefined, image: HTMLImageElement | undefined, connection: BridgeConnection) {
        const { token } = connection;
        const key = sourceKey(source) + (source.kind === 'dartrectify' ? `:${connection.status}:${token}` : '');
        const element = source.kind === 'webcam' ? video : source.kind === 'dartrectify' ? image : undefined;
        if (key === bindingKey && element === boundElement) return;
        stopStream(); bindingKey = key; boundElement = element; streamError = '';
        const request = streamRequest;
        if (source.kind === 'none') return;
        if (source.kind === 'webcam' && video) { void startWebcam(source.deviceId, video, request); return; }
        if (source.kind !== 'dartrectify') return;
        if (!token) { streamError = connectionHelp[connection.status]; return; }
        if (!image) return;
        const board = source.board;
        bridgeClient = new DartRectifyClient({ token, [board]: image,
            onStatus: (status: ServerStatus) => {
                if (request !== streamRequest) return;
                const current = status.boards.find(item => item.id === board);
                boardFresh = current?.ready === true;
                ready = boardFresh && !image.hidden && image.naturalWidth > 0;
                const messages: Record<string, string> = { camera_missing: 'In DartRectify eine Kamera auswählen.', stale: 'Kein aktuelles Kamerabild. Kameraanschluss prüfen.', uncalibrated: 'Dartscheibe in DartRectify kalibrieren.', orientation_required: 'Die 20 in DartRectify ausrichten.', calibrating: 'Kalibrierung läuft in DartRectify.', encoder_error: 'Das Kamerabild konnte nicht übertragen werden.' };
                streamError = boardFresh ? '' : messages[current?.status ?? ''] ?? 'Warte auf ein aktuelles DartRectify-Bild.';
            },
            onError: () => { if (request === streamRequest) { ready = false; boardFresh = false; streamError = 'Verbindung zu DartRectify unterbrochen. Die Wiederverbindung erfolgt automatisch.'; } }
        });
        bridgeClient.start();
    }
    $: syncSource(selectedSource, videoElement, imageElement, bridge);

    function handleScoreDragStart(e: MouseEvent | TouchEvent) {
        dispatch("scoreDragStart", { originalEvent: e });
    }

    function changeBoard(event: Event) {
        dispatch('boardChange', { board: (event.currentTarget as HTMLSelectElement).value });
    }

    export function openEditor() {
        if (editLocked || draft || !ready || !selectedDeviceId || !(rectified ? imageElement : videoElement) || !viewportWidth || !viewportHeight) return;
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
    hidden={!visible}
    style="width: {width}%; --camera-label-scale: {overlaySizes.label / 100}; --score-scale: {overlaySizes.score / 100};"
    bind:this={containerElement}
>
    <!-- Scoreboard Overlay -->
    {#if boardKey && !draft}
        {#if selectedMatch}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="ws-message-overlay draggable"
                class:positioned={scorePos.x !== null}
                style={scorePos.x === null ? '' : `left: clamp(${scoreOverlayWidth / 2}px, ${scorePos.x}%, calc(100% - ${scoreOverlayWidth / 2}px)); top: clamp(0px, ${scorePos.y ?? 0}%, calc(100% - ${scoreOverlayHeight}px));`}
                bind:clientWidth={scoreOverlayWidth}
                bind:clientHeight={scoreOverlayHeight}
                on:mousedown={handleScoreDragStart}
                on:touchstart={handleScoreDragStart}
            >
                <LiveScoreboard data={{ match: selectedMatch }} scale={overlaySizes.score} stale={scoringStatus !== 'live'} />
            </div>
        {:else}
            <div class="no-match" role="status">Board {boardKey}: {scoringStatus === 'connecting' ? 'Lade Match…' : 'Kein aktives Match'}</div>
        {/if}
    {/if}

    <BoardCelebration event={visibleCelebration} />
    <div class="camera-heading">
        <span>Kamera {camId === 'cam1' ? '01' : '02'}</span>
        <button id="camera-config-trigger-{camId}" type="button" class="camera-gear"
            aria-label="Kamera {camId === 'cam1' ? '1' : '2'} Einstellungen {configOpen ? 'schließen' : 'öffnen'}"
            aria-controls="camera-config-{camId}" aria-expanded={configOpen}
            on:click={() => dispatch('configure')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
                <path d="M10 2h4l.5 2.2 1.7.7 1.9-1.2 2.8 2.8-1.2 1.9.7 1.7L22 10v4l-2.2.5-.7 1.7 1.2 1.9-2.8 2.8-1.9-1.2-1.7.7L14 22h-4l-.5-2.2-1.7-.7-1.9 1.2-2.8-2.8 1.2-1.9-.7-1.7L2 14v-4l2.2-.5.7-1.7-1.2-1.9 2.8-2.8 1.9 1.2 1.7-.7L10 2Z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
        </button>
    </div>
    <section id="camera-config-{camId}" class="camera-settings-panel ui-panel"
        aria-labelledby="camera-config-title-{camId}" hidden={!configOpen || !!draft}>
        <div class="config-heading">
            <h3 id="camera-config-title-{camId}">Kamera {camId === 'cam1' ? '01' : '02'}</h3>
            <button type="button" class="config-close"
                aria-label="Kamera {camId === 'cam1' ? '1' : '2'} Einstellungen schließen"
                on:click={() => dispatch('configure')}>×</button>
        </div>
        <div class="config-fields">
            <label class="ui-label" for="cam-select-{camId}">Kameraquelle</label>
            <select class="ui-field" id="cam-select-{camId}" value={selectedDeviceId} on:change={(e) => selectedSource = sourceFromKey(e.currentTarget.value)}
                disabled={editLocked}>
                <option value="">Keine Kamera</option>
                <optgroup label="DartRectify · entzerrte Bilder">
                    <option value="dartrectify:home">DartRectify – Heim{bridge.status === 'online' ? '' : ` (${connectionLabels[bridge.status]})`}</option>
                    <option value="dartrectify:guest">DartRectify – Gast{bridge.status === 'online' ? '' : ` (${connectionLabels[bridge.status]})`}</option>
                </optgroup>
                {#if selectedSource.kind === 'webcam' && !videoDevices.some(device => device.deviceId === (selectedSource.kind === 'webcam' ? selectedSource.deviceId : ''))}<option value={selectedDeviceId}>Gespeicherte Webcam (derzeit nicht gefunden)</option>{/if}
                {#each videoDevices as device}
                    <option value={'webcam:' + device.deviceId}>{device.label || 'Kamera'} ({device.deviceId.slice(0, 8)}…)</option>
                {/each}
            </select>
            <button type="button" class="refresh-cameras" disabled={checkingCameras}
                on:click={() => dispatch('refreshDevices')}>Kameras neu suchen</button>

            <label class="ui-label" for="cam-label-{camId}">Bezeichnung</label>
            <input class="ui-field" id="cam-label-{camId}" type="text" maxlength="24" bind:value={label} />

            {#if scoringStatus !== 'idle' || boardKey}
                <label class="ui-label" for="board-select-{camId}">Live-Scoreboard</label>
                <select class="ui-field" id="board-select-{camId}" value={boardKey} on:change={changeBoard}>
                    <option value="">Kein Board</option>
                    {#each availableBoards as board}
                        {@const match = matchForBoard(matches, board)}
                        <option value={board}>B{board}{match ? ' · ' + match.matchPlayers.map((player) => player.playerName).join(' / ') : ' · kein Match'}</option>
                    {/each}
                </select>
            {/if}

            <button type="button" class="ui-button ui-button--secondary ui-button--small edit-image"
                disabled={!ready || editLocked} on:click={() => dispatch('editRequest')}>Kamerabild bearbeiten</button>
        </div>
    </section>
    <div class="video-wrapper" style={getMaskStyle(displayedSettings)} bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight}>
        {#if !draft && (!selectedDeviceId || streamError)}
            <div class="empty-state" role={streamError ? 'alert' : 'status'}>
                <span class="empty-mark" aria-hidden="true">◎</span>
                <strong>{streamError ? 'Kamera nicht verfügbar' : 'Keine Kamera ausgewählt'}</strong>
                <p>{streamError || 'Wähle eine Kamera über das Zahnrad oben links aus.'}</p>
                <button type="button" class="ui-button ui-button--secondary ui-button--small"
                    on:click={() => dispatch('configure')}>Kamera einrichten</button>
            </div>
        {:else if !draft && !ready}
            <p class="connecting" role="status">Kamera wird verbunden…</p>
        {/if}
        {#if rectified}
            <img class="rectified" hidden bind:this={imageElement} alt="Entzerrte Dartscheibe {label}" crossorigin="anonymous" referrerpolicy="no-referrer"
                on:load={() => { videoWidth = imageElement?.naturalWidth ?? 0; videoHeight = imageElement?.naturalHeight ?? 0; ready = boardFresh; }}
                on:error={() => ready = false}
                style={getTransformStyle(displayedSettings, camId, { width: viewportWidth, height: viewportHeight, videoWidth, videoHeight })} />
        {:else}
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
        {/if}
    </div>
    {#if draft}
        <CameraEditor bind:draft frameWidth={viewportWidth} frameHeight={viewportHeight} media={rectified ? imageElement : videoElement} {rectified}
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

    .cam-container[hidden] {
        display: none;
    }

    .camera-heading {
        position: absolute;
        z-index: 160;
        top: 12px;
        left: 12px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 30px;
        padding: 2px 3px 2px 9px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.84);
        color: var(--color-text-secondary);
        font: 600 12px/1.2 var(--font-display);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        opacity: var(--controls-opacity, 1);
        pointer-events: var(--controls-pointer-events, auto);
        transition: opacity 200ms ease;
    }

    .camera-heading:has(:focus-visible) {
        opacity: 1;
        pointer-events: auto;
    }

    .empty-state .ui-button {
        opacity: var(--controls-opacity, 1);
        pointer-events: var(--controls-pointer-events, auto);
        transition: opacity 200ms ease;
    }

    .empty-state .ui-button:focus-visible {
        opacity: 1;
        pointer-events: auto;
    }

    .camera-gear {
        display: grid;
        width: 26px;
        height: 26px;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--color-text-secondary);
    }

    .camera-gear:hover,
    .camera-gear[aria-expanded="true"] {
        background: var(--color-surface-raised);
        color: var(--color-text);
    }

    .camera-settings-panel {
        position: absolute;
        z-index: 170;
        top: 50px;
        left: 12px;
        width: min(320px, calc(100% - 24px));
        max-height: calc(100% - 62px);
        overflow-y: auto;
        padding: var(--space-2) var(--space-3) var(--space-3);
        border-color: #626669;
        box-shadow: var(--shadow-panel);
    }

    .camera-settings-panel[hidden] {
        display: none;
    }

    .config-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-2);
    }

    .config-heading h3 {
        margin: 0;
        font: 600 16px/1.2 var(--font-display);
        text-transform: uppercase;
    }

    .config-close {
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 22px;
        line-height: 1;
    }

    .config-close:hover {
        background: var(--color-surface-raised);
        color: var(--color-text);
    }

    .config-fields {
        display: grid;
        gap: var(--space-2);
    }

    .config-fields .ui-label {
        margin: var(--space-1) 0 -4px;
    }

    .refresh-cameras {
        justify-self: end;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--color-brand-text);
        font-size: 11px;
        font-weight: 600;
    }

    .refresh-cameras:hover:not(:disabled) {
        text-decoration: underline;
    }

    .refresh-cameras:disabled {
        opacity: 0.5;
    }

    .edit-image {
        width: 100%;
        margin-top: var(--space-1);
    }

    .video-wrapper {
        position: relative;
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .rectified[hidden] { display: none; }
    video, .rectified {
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
        max-width: min(24ch, calc(100% - 24px));
        overflow: hidden;
        padding: calc(5px * var(--camera-label-scale)) calc(12px * var(--camera-label-scale)) calc(6px * var(--camera-label-scale));
        border-left: calc(3px * var(--camera-label-scale)) solid var(--color-brand);
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        background: rgba(21, 23, 25, 0.88);
        font: 600 calc(17px * var(--camera-label-scale))/1.2 var(--font-display);
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .cam-label.left { left: 12px; }
    .cam-label.right { right: 12px; }

    .ws-message-overlay {
        position: absolute;
        z-index: 100;
        top: 12px;
        right: 12px;
        display: flex;
        /* Names use 12ch; the rest accounts for score columns, gaps and padding. */
        width: min(calc(12ch + 185px * var(--score-scale)), calc(100% - 24px));
        font-size: calc(12px * var(--score-scale));
    }

    .ws-message-overlay.positioned {
        right: auto;
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

    @media (prefers-reduced-motion: reduce) {
        .camera-heading,
        .empty-state .ui-button { transition: none; }
    }
</style>
