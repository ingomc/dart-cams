<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from "svelte";
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
    import type { CameraDiagnostics } from '../cameraDiagnostics';
    import type { CameraSettingsApply } from '../cameraLayoutSettings';
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
    export let logoUrl: string | null = null;
    export let logoTeamName = '';
    export let teamTotal: { name: string; sets: string; legs: string } | null = null;
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
    export let cameraDiagnostics: CameraDiagnostics | null = null;

    // Expose the camera elements for stream and frame measurements.
    export let videoElement: HTMLVideoElement | undefined = undefined;
    export let containerElement: HTMLElement | undefined = undefined;

    const dispatch = createEventDispatcher<{
        configure: void;
        boardChange: { board: string };
        refreshDevices: void;
        editRequest: void;
        editStart: void;
        editEnd: void;
        settingsApply: CameraSettingsApply;
        scoreDragStart: { originalEvent: MouseEvent | TouchEvent };
    }>();

    let viewportWidth = 0;
    let viewportHeight = 0;
    let labelHeight = 0;
    let failedLogoUrl: string | null = null;
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
    let trackCleanup: (() => void) | null = null;
    let lastBridgeSummary = '';
    let lastBridgeSample = 0;
    let lastImageLoadAt = 0;

    onMount(() => {
        const timer = setInterval(() => {
            if (selectedSource.kind !== 'webcam' || !activeStream || !videoElement) return;
            cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'webcam_health_sample', {
                ready: ready,
                muted: activeStream.getVideoTracks()[0]?.muted ?? null,
                mediaReadyState: videoElement.readyState,
                currentTimeSec: Math.round(videoElement.currentTime * 10) / 10,
                width: videoElement.videoWidth,
                height: videoElement.videoHeight
            });
        }, 10_000);
        return () => clearInterval(timer);
    });
    $: selectedDeviceId = sourceKey(selectedSource);
    $: cameraName = label.trim() || (camId === 'cam1' ? 'Heim' : 'Gast');
    $: teamTotalDescription = teamTotal
        ? `${teamTotal.name}: ${teamTotal.sets} gewonnene Spiele/Sätze, ${teamTotal.legs === '–' ? 'Legstand nicht verfügbar' : `${teamTotal.legs} gewonnene Legs`}${scoringStatus === 'live' ? '' : ', letzter Stand'}`
        : '';
    $: rectified = selectedSource.kind === 'dartrectify';
    $: displayedSettings = rectified ? rectifiedSettings(draft ?? settings) : draft ?? settings;
    $: selectedMatch = boardKey ? matchForBoard(matches, boardKey) : null;
    $: visibleCelebration = !draft && celebration?.board === boardKey && selectedMatch &&
        celebration.matchKey === selectedMatch.matchKey ? celebration : null;
    $: if (draft && editingDeviceId && selectedDeviceId !== editingDeviceId) cancelEdit();

    function stopStream() {
        streamRequest++;
        trackCleanup?.(); trackCleanup = null;
        if (bridgeClient || activeStream) cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'stream_stopped');
        bridgeClient?.destroy(); bridgeClient = null;
        activeStream?.getTracks().forEach(track => track.stop()); activeStream = null;
        if (videoElement) videoElement.srcObject = null;
        ready = false; boardFresh = false;
    }
    onDestroy(stopStream);

    async function startWebcam(deviceId: string, el: HTMLVideoElement, request: number) {
        const area = camId === 'cam1' ? 'cam1' : 'cam2';
        cameraDiagnostics?.record(area, 'webcam_start_requested', {
            deviceLabel: videoDevices.find(device => device.deviceId === deviceId)?.label || 'Unbenannte Kamera'
        });
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: 1280, height: 720 } });
            if (request !== streamRequest) { stream.getTracks().forEach(track => track.stop()); return; }
            activeStream = stream; el.srcObject = stream;
            const track = stream.getVideoTracks()[0];
            const trackSettings = track?.getSettings();
            cameraDiagnostics?.record(area, 'webcam_stream_started', {
                width: trackSettings?.width ?? null, height: trackSettings?.height ?? null,
                frameRate: trackSettings?.frameRate ?? null
            });
            if (track) {
                const ended = () => { ready = false; cameraDiagnostics?.record(area, 'webcam_track_ended'); };
                const muted = () => cameraDiagnostics?.record(area, 'webcam_track_muted', { muted: true });
                const unmuted = () => cameraDiagnostics?.record(area, 'webcam_track_unmuted', { muted: false });
                track.addEventListener('ended', ended);
                track.addEventListener('mute', muted);
                track.addEventListener('unmute', unmuted);
                trackCleanup = () => {
                    track.removeEventListener('ended', ended);
                    track.removeEventListener('mute', muted);
                    track.removeEventListener('unmute', unmuted);
                };
            }
        } catch (error) {
            if (request === streamRequest) {
                ready = false; streamError = 'Webcam nicht verfügbar. Berechtigung prüfen oder die Kamera in DartRectify freigeben.';
                cameraDiagnostics?.record(area, 'webcam_start_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
            }
        }
    }
    function syncSource(source: CameraSource, video: HTMLVideoElement | undefined, image: HTMLImageElement | undefined, connection: BridgeConnection) {
        const { token } = connection;
        const key = sourceKey(source) + (source.kind === 'dartrectify' ? `:${connection.status}:${token}` : '');
        const element = source.kind === 'webcam' ? video : source.kind === 'dartrectify' ? image : undefined;
        if (key === bindingKey && element === boundElement) return;
        stopStream(); bindingKey = key; boundElement = element; streamError = '';
        lastBridgeSummary = ''; lastBridgeSample = 0; lastImageLoadAt = 0;
        cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'source_changed', {
            source: source.kind,
            board: source.kind === 'dartrectify' ? source.board : null,
            deviceLabel: source.kind === 'webcam'
                ? videoDevices.find(device => device.deviceId === source.deviceId)?.label || 'Unbenannte Kamera' : null
        });
        const request = streamRequest;
        if (source.kind === 'none') return;
        if (source.kind === 'webcam' && video) { void startWebcam(source.deviceId, video, request); return; }
        if (source.kind !== 'dartrectify') return;
        if (!token) {
            streamError = connectionHelp[connection.status];
            cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'dartrectify_unavailable', { status: connection.status });
            return;
        }
        if (!image) return;
        const board = source.board;
        bridgeClient = new DartRectifyClient({ token, [board]: image,
            onStatus: (status: ServerStatus) => {
                if (request !== streamRequest) return;
                const current = status.boards.find(item => item.id === board);
                const summary = JSON.stringify([current?.status, current?.ready, current?.generation, current?.streams?.length, image.hidden]);
                const now = Date.now();
                if (summary !== lastBridgeSummary || now - lastBridgeSample >= 10_000) {
                    cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2',
                        summary !== lastBridgeSummary ? 'dartrectify_board_state' : 'dartrectify_board_sample', {
                            board, status: current?.status ?? 'missing', ready: current?.ready ?? false,
                            visible: !image.hidden,
                            generation: current?.generation ?? null,
                            sourceAgeMs: current?.source_age_ms ?? null,
                            captureSequence: current?.capture_sequence ?? null,
                            viewers: current?.viewers ?? null,
                            streamCount: current?.streams?.length ?? null,
                            sendAgeMs: current?.streams?.[0]?.send_age_ms ?? null
                        });
                    lastBridgeSummary = summary;
                    lastBridgeSample = now;
                }
                boardFresh = current?.ready === true;
                ready = boardFresh && !image.hidden && image.naturalWidth > 0;
                const messages: Record<string, string> = { camera_missing: 'In DartRectify eine Kamera auswählen.', stale: 'Kein aktuelles Kamerabild. Kameraanschluss prüfen.', uncalibrated: 'Dartscheibe in DartRectify kalibrieren.', orientation_required: 'Die 20 in DartRectify ausrichten.', calibrating: 'Kalibrierung läuft in DartRectify.', encoder_error: 'Das Kamerabild konnte nicht übertragen werden.' };
                streamError = boardFresh ? '' : messages[current?.status ?? ''] ?? 'Warte auf ein aktuelles DartRectify-Bild.';
            },
            onError: (error: Error) => {
                if (request !== streamRequest) return;
                ready = false; boardFresh = false;
                streamError = 'Verbindung zu DartRectify unterbrochen. Die Wiederverbindung erfolgt automatisch.';
                cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'dartrectify_request_failed', {
                    board, errorName: error.name || 'Error',
                    httpStatus: Number(error.message.match(/^DartRectify HTTP (\d{3})$/)?.[1]) || null
                });
            }
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
        dispatch('settingsApply', { sourceKey: editingDeviceId, settings: event.detail });
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
    style="width: {width}%; --camera-label-scale: {overlaySizes.label / 100}; --camera-label-height: {labelHeight}px; --score-scale: {overlaySizes.score / 100};"
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
    {#if !draft}
        <div class="camera-label-controls" class:right={camId === 'cam2'} bind:clientHeight={labelHeight}>
            <span class="cam-label" title={teamTotalDescription ? `${cameraName} · ${teamTotalDescription}` : cameraName}>
                {#if logoUrl && failedLogoUrl !== logoUrl}
                    <img class="team-logo" src={logoUrl} alt={logoTeamName} referrerpolicy="no-referrer"
                        on:error={() => (failedLogoUrl = logoUrl)} />
                {/if}
                <span class="cam-label-text">{cameraName}</span>
                {#if teamTotal}
                    <span class="team-total" role="status" aria-live="polite" aria-atomic="true">
                        <span class="sr-only">{teamTotalDescription}</span>
                        <strong class="team-sets" aria-hidden="true">{teamTotal.sets}</strong>
                        <span class="team-legs" aria-hidden="true">({teamTotal.legs})</span>
                    </span>
                {/if}
            </span>
            <button id="camera-config-trigger-{camId}" type="button" class="camera-gear"
                aria-label="{cameraName}: Einstellungen {configOpen ? 'schließen' : 'öffnen'}"
                title="{cameraName}: Einstellungen"
                aria-controls="camera-config-{camId}" aria-expanded={configOpen}
                on:click={() => dispatch('configure')}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                    stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
                    <path d="M10 2h4l.5 2.2 1.7.7 1.9-1.2 2.8 2.8-1.2 1.9.7 1.7L22 10v4l-2.2.5-.7 1.7 1.2 1.9-2.8 2.8-1.9-1.2-1.7.7L14 22h-4l-.5-2.2-1.7-.7-1.9 1.2-2.8-2.8 1.2-1.9-.7-1.7L2 14v-4l2.2-.5.7-1.7-1.2-1.9 2.8-2.8 1.9 1.2 1.7-.7L10 2Z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            </button>
        </div>
    {/if}
    <section id="camera-config-{camId}" class="camera-settings-panel ui-panel"
        class:right={camId === 'cam2'}
        aria-labelledby="camera-config-title-{camId}" hidden={!configOpen || !!draft}>
        <div class="config-heading">
            <h3 id="camera-config-title-{camId}">{cameraName}</h3>
            <button type="button" class="config-close"
                aria-label="{cameraName}: Einstellungen schließen"
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
                <p>{streamError || 'Wähle eine Kamera über das Zahnrad neben dem Namen unten aus.'}</p>
                <button type="button" class="ui-button ui-button--secondary ui-button--small"
                    on:click={() => dispatch('configure')}>Kamera einrichten</button>
            </div>
        {:else if !draft && !ready}
            <p class="connecting" role="status">Kamera wird verbunden…</p>
        {/if}
        {#if rectified}
            <img class="rectified" hidden bind:this={imageElement} alt="Entzerrte Dartscheibe {label}" crossorigin="anonymous" referrerpolicy="no-referrer"
                on:load={() => {
                    videoWidth = imageElement?.naturalWidth ?? 0; videoHeight = imageElement?.naturalHeight ?? 0; ready = boardFresh;
                    if (Date.now() - lastImageLoadAt >= 10_000) {
                        cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'dartrectify_image_loaded', {
                            width: videoWidth, height: videoHeight
                        });
                        lastImageLoadAt = Date.now();
                    }
                }}
                on:error={() => {
                    ready = false;
                    cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'dartrectify_image_error');
                }}
                style={getTransformStyle(displayedSettings, camId, { width: viewportWidth, height: viewportHeight, videoWidth, videoHeight })} />
        {:else}
        <!-- svelte-ignore a11y-media-has-caption -->
        <video
            bind:this={videoElement}
            autoplay
            playsinline
            muted
            on:loadedmetadata={() => {
                videoWidth = videoElement?.videoWidth ?? 0; videoHeight = videoElement?.videoHeight ?? 0; ready = true;
                cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'video_metadata', {
                    width: videoWidth, height: videoHeight
                });
            }}
            on:playing={() => cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'video_playing')}
            on:waiting={() => cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'video_waiting')}
            on:stalled={() => cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'video_stalled')}
            on:error={() => {
                ready = false;
                cameraDiagnostics?.record(camId === 'cam1' ? 'cam1' : 'cam2', 'video_error', {
                    errorName: videoElement?.error ? `MediaError${videoElement.error.code}` : 'UnknownError'
                });
            }}
            on:resize={() => { videoWidth = videoElement?.videoWidth ?? 0; videoHeight = videoElement?.videoHeight ?? 0; }}
            style={getTransformStyle(displayedSettings, camId, { width: viewportWidth, height: viewportHeight, videoWidth, videoHeight })}
        ></video>
        {/if}
    </div>
    {#if draft}
        <CameraEditor bind:draft frameWidth={viewportWidth} frameHeight={viewportHeight} media={rectified ? imageElement : videoElement} {rectified}
            on:apply={applyEdit} on:cancel={cancelEdit} />
    {/if}
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

    .camera-label-controls {
        position: absolute;
        z-index: 160;
        bottom: 12px;
        left: 12px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        max-width: calc(100% - 24px);
    }

    .camera-label-controls.right {
        left: auto;
        right: 12px;
        flex-direction: row-reverse;
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
        flex-shrink: 0;
        width: 26px;
        height: 26px;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: rgba(21, 23, 25, 0.88);
        color: var(--color-text-secondary);
        opacity: var(--controls-opacity, 1);
        pointer-events: var(--controls-pointer-events, auto);
        transition: opacity 200ms ease;
    }

    .camera-gear:focus-visible,
    .camera-gear[aria-expanded="true"] {
        opacity: 1;
        pointer-events: auto;
    }

    .camera-gear:hover,
    .camera-gear[aria-expanded="true"] {
        background: var(--color-surface-raised);
        color: var(--color-text);
    }

    .camera-settings-panel {
        position: absolute;
        z-index: 170;
        bottom: calc(12px + var(--camera-label-height) + 8px);
        left: 12px;
        width: min(320px, calc(100% - 24px));
        max-height: max(0px, calc(100% - var(--camera-label-height) - 32px));
        overflow-y: auto;
        padding: var(--space-2) var(--space-3) var(--space-3);
        border-color: #626669;
        box-shadow: var(--shadow-panel);
    }

    .camera-settings-panel.right {
        left: auto;
        right: 12px;
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
        min-width: 0;
        margin: 0;
        font: 600 16px/1.2 var(--font-display);
        text-transform: uppercase;
        overflow-wrap: anywhere;
    }

    .config-close {
        flex-shrink: 0;
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
        display: inline-flex;
        align-items: center;
        gap: calc(8px * var(--camera-label-scale));
        min-width: 0;
        overflow: hidden;
        padding: calc(5px * var(--camera-label-scale)) calc(12px * var(--camera-label-scale)) calc(6px * var(--camera-label-scale));
        border-left: calc(3px * var(--camera-label-scale)) solid var(--color-brand);
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        background: rgba(21, 23, 25, 0.88);
        font: 600 calc(17px * var(--camera-label-scale))/1.2 var(--font-display);
        white-space: nowrap;
    }

    .camera-label-controls.right .cam-label {
        flex-direction: row-reverse;
        border-left: 0;
        border-right: calc(3px * var(--camera-label-scale)) solid var(--color-brand);
        border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    }

    .cam-label-text {
        min-width: 0;
        max-width: 24ch;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .team-total {
        display: inline-flex;
        flex: none;
        align-items: baseline;
        gap: calc(4px * var(--camera-label-scale));
        color: var(--color-text);
        font-variant-numeric: tabular-nums;
    }

    .camera-label-controls.right .team-total { flex-direction: row-reverse; }
    .team-sets { font-weight: 700; }
    .team-legs { opacity: 0.65; }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }

    .team-logo {
        flex-shrink: 0;
        width: calc(24px * var(--camera-label-scale));
        height: calc(24px * var(--camera-label-scale));
        object-fit: contain;
    }

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
        .camera-gear,
        .empty-state .ui-button { transition: none; }
    }
</style>
