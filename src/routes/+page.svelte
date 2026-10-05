<script lang="ts">
	import { onMount, onDestroy, tick } from "svelte";
	import { sourceKey, restoreSources, rectifiedSettings, type CameraSource } from '$lib/cameraSources';
	import { DartRectifyDiscovery, initialConnection, connectionLabels, connectionHelp, type BridgeConnection } from '$lib/dartrectify/connection';
	let bridge: BridgeConnection = initialConnection;
	let discovery: DartRectifyDiscovery;
	let sourcesRestored = false;
	const loadingTimers: Partial<Record<'cam1' | 'cam2', ReturnType<typeof setTimeout>>> = {};
	import CameraView from "$lib/components/CameraView.svelte";
	import OverlaySizeControls from "$lib/components/OverlaySizeControls.svelte";
	import IframeSection from "$lib/components/IframeSection.svelte";
	import { defaultCamSettings } from "$lib/constants";
	import { LiveScoringClient, type ScoringStatus } from "$lib/liveScoring";
	import { listBoards, parseScoringEventUrl, teamScoreForBoards, type LiveMatch } from "$lib/scoring";
	import type { CamSettings, CamSetting } from "$lib/types";
	import type { ScoringCelebration } from "$lib/scoringCelebration";
	import { restoreOverlaySizes } from "$lib/overlaySizes";

	// Zustand für verfügbare Geräte und ausgewählte IDs
	let videoDevices: MediaDeviceInfo[] = [];
	let cameraError = "";
	let checkingCameras = false;
	let selectedCam1: CameraSource = { kind: 'none' };
	let selectedCam2: CameraSource = { kind: 'none' };
	let cam1Label = "Heim";
	let cam2Label = "Gast";
	let overlaySizes = restoreOverlaySizes(null);
	let overlaySizesRestored = false;
	let showFloatingWebcam = false;
	let webcamInteracting = false;
	let settingsOpen = false;
	let activeCameraSettings: 'cam1' | 'cam2' | null = null;
	let settingsButton: HTMLButtonElement;
	let cam1View: CameraView;
	let cam2View: CameraView;
	let cam1Ready = false;
	let cam2Ready = false;

	let scoringUrl = "";
	let scoringUrlDraft = "";
	let scoringError = "";
	let scoringStatus: ScoringStatus = 'idle';
	let matches: LiveMatch[] = [];
	let scoringClient: LiveScoringClient | null = null;
	let activeEventKey = "";

	let container1: HTMLElement;
	let container2: HTMLElement;
	let contentArea: HTMLElement;

	// Layout State
	const cameraLayoutPresets = [
		{ value: 'split', label: 'Beide Kameras · 50/50' },
		{ value: 'cam1', label: 'Nur Kamera 1' },
		{ value: 'cam2', label: 'Nur Kamera 2' },
	] as const;
	type CameraLayout = (typeof cameraLayoutPresets)[number]['value'];
	let cameraLayout: CameraLayout = 'split';
	let topHeight = 70; // in % when the live view is open
	let leftWidth = 50; // in %
	let isDraggingVertical = false;
	let isDraggingHorizontal = false;
	let showIframe = false;
	let controlsVisible = true;
	let controlsMounted = false;
	let controlsTimer: ReturnType<typeof setTimeout> | null = null;

	// Iframe Settings
	let cropTop = 0;
	let cropBottom = 0;
	let iframeZoom = 1;

	let camSettings: CamSettings = {
		cam1: { ...defaultCamSettings },
		cam2: { ...defaultCamSettings },
	};

	let savedSettings: Record<string, CamSetting> = {};
	let isLoadingSettings = { cam1: false, cam2: false };

	let editingCam: "cam1" | "cam2" | null = null;

	// Scoreboard State per Camera
	let cam1BoardKey = "";
	let cam2BoardKey = "";
	let cam1Celebration: ScoringCelebration | null = null;
	let cam2Celebration: ScoringCelebration | null = null;
	$: cam1Boards = listBoards(matches, [cam1BoardKey]);
	$: cam2Boards = listBoards(matches, [cam2BoardKey]);
	$: teamScore = teamScoreForBoards(matches, [cam1BoardKey, cam2BoardKey]);

	// Unmoved scoreboards sit at the top right; dragged positions use percentages.
	let cam1ScorePos: { x: number | null; y: number | null } = { x: null, y: null };
	let cam2ScorePos: { x: number | null; y: number | null } = { x: null, y: null };

	let isDraggingScore1 = false;
	let isDraggingScore2 = false;
	let scoreDragOffset = { x: 0, y: 0 };

	const scoringStatusText: Record<ScoringStatus, string> = {
		idle: 'Kein Event verbunden',
		connecting: 'Verbinde…',
		live: 'Live verbunden',
		offline: 'Verbindung unterbrochen – letzter Stand',
		error: 'Scoring derzeit nicht erreichbar',
	};
	$: scoringStatusLabel = scoringStatusText[scoringStatus] + (scoringUrl && matches.length
		? ' · ' + matches.length + (matches.length === 1 ? ' Match' : ' Matches') : '');
	$: controlsBusy = settingsOpen || activeCameraSettings !== null || editingCam !== null ||
		webcamInteracting || isDraggingVertical || isDraggingHorizontal || isDraggingScore1 || isDraggingScore2;
	$: if (controlsMounted) scheduleControlsFade(controlsBusy);

	function scheduleControlsFade(busy: boolean): void {
		if (controlsTimer !== null) clearTimeout(controlsTimer);
		controlsTimer = null;
		controlsVisible = true;
		if (!busy && controlsMounted) {
			controlsTimer = setTimeout(() => {
				controlsVisible = false;
				controlsTimer = null;
			}, 20_000);
		}
	}

	function revealControls(): void {
		scheduleControlsFade(controlsBusy);
	}

	function applyCameraLayout(layout: CameraLayout): void {
		if (editingCam) return;
		cameraLayout = layout;
		if (layout === 'split') leftWidth = 50;
		else if (activeCameraSettings !== layout) activeCameraSettings = null;
		handleEnd();
		handleScoreEnd();
	}

	function openSettings(): void {
		activeCameraSettings = null;
		settingsOpen = true;
	}

	async function closeSettings(): Promise<void> {
		settingsOpen = false;
		await tick();
		settingsButton?.focus();
	}

	async function toggleCameraSettings(slot: 'cam1' | 'cam2'): Promise<void> {
		const closing = activeCameraSettings === slot;
		settingsOpen = false;
		activeCameraSettings = closing ? null : slot;
		if (closing) {
			await tick();
			document.getElementById(`camera-config-trigger-${slot}`)?.focus();
		}
	}

	async function closeCameraSettings(): Promise<void> {
		const slot = activeCameraSettings;
		if (!slot) return;
		activeCameraSettings = null;
		await tick();
		document.getElementById(`camera-config-trigger-${slot}`)?.focus();
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		if (settingsOpen) {
			event.preventDefault();
			closeSettings();
		} else if (activeCameraSettings) {
			event.preventDefault();
			closeCameraSettings();
		}
	}

	async function beginCameraEdit(slot: 'cam1' | 'cam2'): Promise<void> {
		if (editingCam || !(slot === 'cam1' ? cam1Ready : cam2Ready)) return;
		if (slot === 'cam1') cam1Celebration = null;
		else cam2Celebration = null;
		settingsOpen = false;
		activeCameraSettings = null;
		await tick();
		(slot === 'cam1' ? cam1View : cam2View)?.openEditor();
		await tick();
		document.querySelector<HTMLElement>('.editor .gesture-layer')?.focus();
	}

	async function finishCameraEdit(): Promise<void> {
		const slot = editingCam;
		editingCam = null;
		await tick();
		if (slot) document.getElementById(`camera-config-trigger-${slot}`)?.focus();
	}

	function updateBoard(slot: 'cam1' | 'cam2', board: string): void {
		if (slot === 'cam1') { cam1Celebration = null; cam1BoardKey = board; }
		else { cam2Celebration = null; cam2BoardKey = board; }
		saveBoardSelection();
	}

	function activateScoringUrl(value: string): void {
		const event = parseScoringEventUrl(value);
		if (!event) {
			scoringError = 'Bitte einen 3K-Live-Link im Format https://live.3k-darts.com/event/5/2995582 eingeben.';
			return;
		}
		scoringError = '';
		cam1Celebration = null;
		cam2Celebration = null;
		scoringUrl = event.url;
		scoringUrlDraft = event.url;
		activeEventKey = event.key;
		try {
			const stored = JSON.parse(localStorage.getItem(`dartScoringBoards:${event.key}`) ?? '{}');
			cam1BoardKey = typeof stored.cam1 === 'string' ? stored.cam1 : '';
			cam2BoardKey = typeof stored.cam2 === 'string' ? stored.cam2 : '';
		} catch {
			cam1BoardKey = '';
			cam2BoardKey = '';
		}
		localStorage.setItem('dartScoringEventUrl', event.url);
		scoringClient?.start(event);
	}

	function saveBoardSelection(): void {
		if (!activeEventKey) return;
		localStorage.setItem(`dartScoringBoards:${activeEventKey}`,
			JSON.stringify({ cam1: cam1BoardKey, cam2: cam2BoardKey }));
	}

	// Drag Logic for Scoreboards
	function startScoreDrag(cam: 1 | 2, e: MouseEvent | TouchEvent) {
		e.preventDefault();
		e.stopPropagation();
		const pointer = 'touches' in e ? e.touches[0] : e;
		const overlay = (e.currentTarget as HTMLElement).getBoundingClientRect();
		scoreDragOffset = {
			x: pointer.clientX - overlay.left - overlay.width / 2,
			y: pointer.clientY - overlay.top,
		};
		if (cam === 1) isDraggingScore1 = true;
		else isDraggingScore2 = true;
	}

	function handleScoreMove(e: MouseEvent | TouchEvent) {
		if (!isDraggingScore1 && !isDraggingScore2) return;

		let clientX, clientY;
		if ((e as TouchEvent).touches) {
			clientX = (e as TouchEvent).touches[0].clientX;
			clientY = (e as TouchEvent).touches[0].clientY;
		} else {
			clientX = (e as MouseEvent).clientX;
			clientY = (e as MouseEvent).clientY;
		}

		const container = isDraggingScore1 ? container1 : container2;
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const overlay = container.querySelector<HTMLElement>('.ws-message-overlay');
		const halfWidth = (overlay?.offsetWidth ?? 0) / 2;
		const height = overlay?.offsetHeight ?? 0;
		const x = Math.max(halfWidth, Math.min(rect.width - halfWidth, clientX - rect.left - scoreDragOffset.x));
		const y = Math.max(0, Math.min(rect.height - height, clientY - rect.top - scoreDragOffset.y));
		const next = { x: x / rect.width * 100, y: y / rect.height * 100 };
		if (isDraggingScore1) cam1ScorePos = next;
		else cam2ScorePos = next;
	}

	function handleScoreEnd() {
		isDraggingScore1 = false;
		isDraggingScore2 = false;
	}

	onMount(() => {
		controlsMounted = true;
		window.addEventListener('pointermove', revealControls, { passive: true });
		window.addEventListener('pointerdown', revealControls, true);
		window.addEventListener('keydown', revealControls, true);
		window.addEventListener('focusin', revealControls, true);
		scoringClient = new LiveScoringClient({
			onMatches: (next) => (matches = next),
			onStatus: (next) => (scoringStatus = next),
			onCelebration: (event) => {
				if (event.board === cam1BoardKey && editingCam !== 'cam1') cam1Celebration = event;
				if (event.board === cam2BoardKey && editingCam !== 'cam2') cam2Celebration = event;
			},
		});
		const savedScoringUrl = localStorage.getItem('dartScoringEventUrl');
		if (savedScoringUrl) activateScoringUrl(savedScoringUrl);
		const saved = localStorage.getItem("dartCamSettings");
		if (saved) {
			try {
				savedSettings = JSON.parse(saved);
			} catch (e) {
				console.error("Failed to parse saved settings", e);
			}
		}

		const savedLabels = localStorage.getItem("dartCamLabels");
		if (savedLabels) {
			try {
				const labels = JSON.parse(savedLabels);
				if (labels.cam1) cam1Label = labels.cam1;
				if (labels.cam2) cam2Label = labels.cam2;
			} catch (e) {
				console.error("Failed to parse saved labels", e);
			}
		}

		overlaySizes = restoreOverlaySizes(localStorage.getItem('dartCamOverlaySizes'));
		overlaySizesRestored = true;

		const sources = restoreSources(localStorage.getItem('dartCamSources'), localStorage.getItem('dartCamSelections'));
		selectedCam1 = sources.cam1; selectedCam2 = sources.cam2; sourcesRestored = true;
		discovery = new DartRectifyDiscovery((connection) => bridge = connection); discovery.start();
		getDevices();
		navigator.mediaDevices?.addEventListener("devicechange", refreshKnownDevices);

		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleEnd);
		window.addEventListener("touchmove", handleMove, { passive: false });
		window.addEventListener("touchend", handleEnd);

		window.addEventListener("mousemove", handleScoreMove);
		window.addEventListener("mouseup", handleScoreEnd);
		window.addEventListener("touchmove", handleScoreMove, {
			passive: false,
		});
		window.addEventListener("touchend", handleScoreEnd);
	});

	onDestroy(() => {
		controlsMounted = false;
		if (controlsTimer !== null) clearTimeout(controlsTimer);
		scoringClient?.stop();
		Object.values(loadingTimers).forEach(clearTimeout);
		discovery?.stop();
		if (typeof window !== "undefined") {
			window.removeEventListener('pointermove', revealControls);
			window.removeEventListener('pointerdown', revealControls, true);
			window.removeEventListener('keydown', revealControls, true);
			window.removeEventListener('focusin', revealControls, true);
			navigator.mediaDevices?.removeEventListener("devicechange", refreshKnownDevices);
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleEnd);
			window.removeEventListener("touchmove", handleMove);
			window.removeEventListener("touchend", handleEnd);

			window.removeEventListener("mousemove", handleScoreMove);
			window.removeEventListener("mouseup", handleScoreEnd);
			window.removeEventListener("touchmove", handleScoreMove);
			window.removeEventListener("touchend", handleScoreEnd);
		}
	});

	function refreshKnownDevices() { void getDevices(); }
	async function getDevices(requestPermission = false) {
		if (checkingCameras) return;
		checkingCameras = true; cameraError = '';
		let permissionStream: MediaStream | null = null;
		try {
			if (!navigator.mediaDevices) throw new Error('Kamera-API nicht verfügbar');
			let devices = await navigator.mediaDevices.enumerateDevices();
			if (requestPermission && !devices.some(d => d.kind === 'videoinput' && d.label)) {
				permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
				devices = await navigator.mediaDevices.enumerateDevices();
			}
			videoDevices = devices.filter(d => d.kind === 'videoinput');
			if (requestPermission && !videoDevices.length) cameraError = 'Keine Webcam gefunden. Anschluss und Browserberechtigung prüfen.';
		} catch {
			if (requestPermission) cameraError = 'Webcam-Zugriff nicht möglich. Berechtigung prüfen oder das Gerät in DartRectify freigeben.';
		} finally { permissionStream?.getTracks().forEach(track => track.stop()); checkingCameras = false; }
	}

	function startVerticalDrag(e?: MouseEvent | TouchEvent) {
		if (e && e.type === "touchstart") e.preventDefault();
		isDraggingVertical = true;
	}

	function startHorizontalDrag(e?: MouseEvent | TouchEvent) {
		if (e && e.type === "touchstart") e.preventDefault();
		isDraggingHorizontal = true;
	}

	function handleMove(e: MouseEvent | TouchEvent) {
		if (!isDraggingVertical && !isDraggingHorizontal) return;

		if (e.type === "touchmove") {
			e.preventDefault();
		}

		let clientX, clientY;
		if ((e as TouchEvent).touches) {
			clientX = (e as TouchEvent).touches[0].clientX;
			clientY = (e as TouchEvent).touches[0].clientY;
		} else {
			clientX = (e as MouseEvent).clientX;
			clientY = (e as MouseEvent).clientY;
		}

		if (isDraggingVertical) {
			const rect = contentArea.getBoundingClientRect();
			const h = ((clientY - rect.top) / rect.height) * 100;
			if (h > 10 && h < 90) topHeight = h;
		}
		if (isDraggingHorizontal) {
			const w = (clientX / window.innerWidth) * 100;
			if (w > 10 && w < 90) leftWidth = w;
		}
	}

	function handleEnd() {
		isDraggingVertical = false;
		isDraggingHorizontal = false;
	}

	function loadSettings(slot: "cam1" | "cam2", deviceId: string) {
		if (!deviceId) return;
		clearTimeout(loadingTimers[slot]);
		isLoadingSettings[slot] = true;

		const stored = savedSettings[deviceId] ?? (deviceId.startsWith('webcam:') ? savedSettings[deviceId.slice(7)] : undefined);
		if (stored) {
			console.log(`Loading settings for ${slot} (${deviceId})`);
			camSettings[slot] = {
				...defaultCamSettings,
				...stored,
			};
		} else {
			console.log(
				`No saved settings for ${slot} (${deviceId}), using defaults`,
			);
			camSettings[slot] = { ...defaultCamSettings };
		}

		if (deviceId.startsWith('dartrectify:')) camSettings[slot] = rectifiedSettings(camSettings[slot]);
		loadingTimers[slot] = setTimeout(() => {
			isLoadingSettings[slot] = false;
		}, 100);
	}

	function saveSettings(
		slot: "cam1" | "cam2",
		deviceId: string,
		settings: CamSetting,
	) {
		if (!deviceId || isLoadingSettings[slot]) return;
		savedSettings[deviceId] = { ...settings };
		localStorage.setItem("dartCamSettings", JSON.stringify(savedSettings));
	}

	$: if (sourcesRestored && sourceKey(selectedCam1)) loadSettings('cam1', sourceKey(selectedCam1));
	$: if (sourcesRestored && sourceKey(selectedCam2)) loadSettings('cam2', sourceKey(selectedCam2));
	$: if (sourcesRestored && sourceKey(selectedCam1) && camSettings.cam1) saveSettings('cam1', sourceKey(selectedCam1), camSettings.cam1);
	$: if (sourcesRestored && sourceKey(selectedCam2) && camSettings.cam2) saveSettings('cam2', sourceKey(selectedCam2), camSettings.cam2);
	$: if (overlaySizesRestored) localStorage.setItem('dartCamOverlaySizes', JSON.stringify(overlaySizes));

	$: {
		if (sourcesRestored && typeof localStorage !== "undefined") {
			localStorage.setItem(
				"dartCamLabels",
				JSON.stringify({ cam1: cam1Label, cam2: cam2Label }),
			);
		}
	}

	$: {
		if (
			typeof localStorage !== "undefined" &&
			sourcesRestored
		) {
			localStorage.setItem(
				"dartCamSources",
				JSON.stringify({ version: 1, cam1: selectedCam1, cam2: selectedCam2 }),
			);
		}
	}
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<main class="app-shell" class:controls-idle={!controlsVisible} class:dragging={isDraggingVertical || isDraggingHorizontal}
    style="--controls-opacity: {controlsVisible ? 1 : 0}; --controls-pointer-events: {controlsVisible ? 'auto' : 'none'};">
    {#if bridge.status === 'permission' || bridge.status === 'blocked'}
        <div class="camera-notice" role="status">{connectionHelp[bridge.status]}</div>
    {/if}

    {#if cameraError}
        <div class="camera-notice" role="alert">
            <span>{cameraError}</span>
            <button type="button" class="ui-button ui-button--secondary ui-button--small"
                on:click={() => getDevices(true)} disabled={checkingCameras}>Erneut versuchen</button>
        </div>
    {/if}

    <div class="content-area" bind:this={contentArea}>
        <div class="broadcast-stage" style="height: {showIframe ? topHeight : 100}%;">
            <div class="camera-section">
                <CameraView
                    bind:this={cam1View}
                    camId="cam1"
                    width={cameraLayout === 'cam1' ? 100 : leftWidth}
                    visible={cameraLayout !== 'cam2'}
                    bind:settings={camSettings.cam1}
                    editLocked={editingCam !== null}
                    {bridge}
                    bind:selectedSource={selectedCam1}
                    bind:label={cam1Label}
                    {overlaySizes}
                    bind:containerElement={container1}
                    bind:boardKey={cam1BoardKey}
                    bind:scorePos={cam1ScorePos}
                    bind:ready={cam1Ready}
                    celebration={cam1Celebration}
                    {videoDevices}
                    availableBoards={cam1Boards}
                    {checkingCameras}
                    configOpen={activeCameraSettings === 'cam1'}
                    scoringStatus={scoringStatus}
                    {matches}
                    on:configure={() => toggleCameraSettings('cam1')}
                    on:boardChange={(event) => updateBoard('cam1', event.detail.board)}
                    on:refreshDevices={() => getDevices(true)}
                    on:editRequest={() => beginCameraEdit('cam1')}
                    on:editStart={() => (editingCam = "cam1")}
                    on:editEnd={finishCameraEdit}
                    on:scoreDragStart={(event) => startScoreDrag(1, event.detail.originalEvent)}
                />

                {#if cameraLayout === 'split'}
                    <div class="resizer-horizontal" role="slider" aria-label="Kamerabreite anpassen"
                        aria-orientation="vertical" aria-valuemin="10" aria-valuemax="90"
                        aria-valuenow={Math.round(leftWidth)} tabindex="0"
                        on:mousedown={startHorizontalDrag} on:touchstart={startHorizontalDrag}
                        on:keydown={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                                event.preventDefault();
                                leftWidth = Math.max(10, Math.min(90, leftWidth + (event.key === 'ArrowRight' ? 5 : -5)));
                            }
                        }}><span></span></div>
                {/if}

                <CameraView
                    bind:this={cam2View}
                    camId="cam2"
                    width={cameraLayout === 'cam2' ? 100 : 100 - leftWidth}
                    visible={cameraLayout !== 'cam1'}
                    bind:settings={camSettings.cam2}
                    editLocked={editingCam !== null}
                    {bridge}
                    bind:selectedSource={selectedCam2}
                    bind:label={cam2Label}
                    {overlaySizes}
                    bind:containerElement={container2}
                    bind:boardKey={cam2BoardKey}
                    bind:scorePos={cam2ScorePos}
                    bind:ready={cam2Ready}
                    celebration={cam2Celebration}
                    {videoDevices}
                    availableBoards={cam2Boards}
                    {checkingCameras}
                    configOpen={activeCameraSettings === 'cam2'}
                    scoringStatus={scoringStatus}
                    {matches}
                    on:configure={() => toggleCameraSettings('cam2')}
                    on:boardChange={(event) => updateBoard('cam2', event.detail.board)}
                    on:refreshDevices={() => getDevices(true)}
                    on:editRequest={() => beginCameraEdit('cam2')}
                    on:editStart={() => (editingCam = "cam2")}
                    on:editEnd={finishCameraEdit}
                    on:scoreDragStart={(event) => startScoreDrag(2, event.detail.originalEvent)}
                />
            </div>

            {#if teamScore}
                <div class="team-score-strip" class:stale={scoringStatus !== 'live'} aria-live="polite">
                    <span class="team-name" title={teamScore.home}>{teamScore.home}</span>
                    <span class="team-result" aria-label="Teamstand {teamScore.home} {teamScore.homeScore} zu {teamScore.guestScore} {teamScore.guest}">
                        <strong>{teamScore.homeScore}</strong><span>:</span><strong>{teamScore.guestScore}</strong>
                    </span>
                    <span class="team-name guest" title={teamScore.guest}>{teamScore.guest}</span>
                </div>
            {/if}
        </div>

        {#if showIframe}
            <div class="resizer-vertical" role="slider" aria-label="Höhe der Live-Ansicht anpassen"
                aria-orientation="horizontal" aria-valuemin="10" aria-valuemax="90"
                aria-valuenow={Math.round(topHeight)} tabindex="0"
                on:mousedown={startVerticalDrag} on:touchstart={startVerticalDrag}
                on:keydown={(event) => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        topHeight = Math.max(10, Math.min(90, topHeight + (event.key === 'ArrowDown' ? 5 : -5)));
                    }
                }}><span></span></div>
        {/if}

        <IframeSection {scoringUrl} {cropTop} {cropBottom} {iframeZoom}
            bind:showFloatingWebcam {showIframe} {videoDevices}
            {checkingCameras} {cameraError}
            on:refreshDevices={(event) => getDevices(event.detail.requestPermission)}
            on:interaction={(event) => webcamInteracting = event.detail.active}>
            <div slot="overlay">
                {#if isDraggingVertical || isDraggingHorizontal}
                    <div class="iframe-overlay"></div>
                {/if}
            </div>
        </IframeSection>
    </div>

    <footer class="app-bar" aria-label="App-Status und Einstellungen">
        <div class="app-bar-brand">
            <span class="app-title">SCO <strong>DARTCAMS</strong></span>
            <div class="layout-presets" role="group" aria-label="Kamera-Layout">
                {#each cameraLayoutPresets as preset}
                    <button type="button" class="ui-icon-button ui-button--secondary layout-preset"
                        aria-label={preset.label} title={editingCam ? 'Bildbearbeitung zuerst schließen' : preset.label}
                        aria-pressed={cameraLayout === preset.value && (preset.value !== 'split' || leftWidth === 50)}
                        disabled={editingCam !== null} on:click={() => applyCameraLayout(preset.value)}>
                        <svg viewBox="0 0 24 20" width="22" height="18" fill="none" stroke="currentColor"
                            stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            {#if preset.value === 'split'}
                                <path d="M12 3v14" />
                                <text x="7" y="13" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">1</text>
                                <text x="17" y="13" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">2</text>
                            {:else}
                                <text x="12" y="14" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">{preset.value === 'cam1' ? '1' : '2'}</text>
                            {/if}
                        </svg>
                    </button>
                {/each}
            </div>
        </div>
        <div class="app-bar-actions">
            <div class="bar-status" role="group" aria-label="Verbindungsstatus">
                <span class="ui-badge" class:ui-badge--success={bridge.status === 'online'}
                    class:ui-badge--error={bridge.status === 'blocked'} title={connectionHelp[bridge.status]} aria-live="polite">
                    <span class="badge-label">DartRectify {connectionLabels[bridge.status]}</span>
                </span>
                <span class="ui-badge {scoringStatus === 'live' ? 'ui-badge--success' : scoringStatus === 'error' ? 'ui-badge--error' : scoringStatus === 'connecting' || scoringStatus === 'offline' ? 'ui-badge--warning' : ''}"
                    title={scoringStatusLabel} aria-live="polite">
                    <span class="badge-label">{scoringStatusLabel}</span>
                </span>
            </div>
            <div class="bar-buttons" role="group" aria-label="Verbindungen und Einstellungen">
                {#if bridge.status !== 'online'}
                    <button type="button" class="ui-button ui-button--secondary bar-button"
                        title="DartRectify verbinden · {connectionHelp[bridge.status]}"
                        on:click={() => discovery?.retry()}>DartRectify verbinden</button>
                {/if}
                <button type="button" class="ui-icon-button ui-button--secondary settings-trigger"
                    aria-label="Einstellungen" title="Einstellungen"
                    bind:this={settingsButton} aria-controls="settings-panel" aria-expanded={settingsOpen}
                    on:click={() => settingsOpen ? closeSettings() : openSettings()}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                        stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                        <path d="M3 6h18M3 12h18M3 18h18" />
                        <circle cx="8" cy="6" r="2" fill="var(--color-background)" />
                        <circle cx="16" cy="12" r="2" fill="var(--color-background)" />
                        <circle cx="10" cy="18" r="2" fill="var(--color-background)" />
                    </svg>
                </button>
            </div>
        </div>
    </footer>

    <button type="button" class="settings-backdrop" class:open={settingsOpen}
        aria-label="Einstellungen schließen" aria-hidden={!settingsOpen} inert={!settingsOpen}
        tabindex="-1" on:click={closeSettings}></button>

    <aside id="settings-panel" class="settings-drawer" class:open={settingsOpen} aria-labelledby="settings-title" aria-hidden={!settingsOpen} inert={!settingsOpen}>
        <div class="drawer-header">
            <h2 id="settings-title">Einstellungen</h2>
            <button type="button" class="ui-icon-button" aria-label="Einstellungen schließen"
                on:click={closeSettings}>×</button>
        </div>
        <div class="drawer-body">
            <details class="settings-section" name="app-settings">
                <summary><h3>Einblendungen</h3></summary>
                <div class="settings-section-body">
                    <OverlaySizeControls bind:sizes={overlaySizes} />
                </div>
            </details>
            <details class="settings-section" name="app-settings">
                <summary><h3>DartRectify</h3></summary>
                <div class="settings-section-body">
                    <button class="ui-button ui-button--secondary" type="button" on:click={() => discovery?.retry()}>Verbindung erneut prüfen</button>
                </div>
            </details>
            <details class="settings-section" name="app-settings">
                <summary><h3>Live-Scoring</h3></summary>
                <div class="settings-section-body">
                    <form class="settings-form" on:submit|preventDefault={() => activateScoringUrl(scoringUrlDraft)}>
                        <div>
                            <label class="ui-label" for="scoring-event-url">3K-Live-Event-Link</label>
                            <div class="event-link-field">
                                <input class="ui-field" id="scoring-event-url" type="text" inputmode="url"
                                    bind:value={scoringUrlDraft} aria-invalid={!!scoringError}
                                    placeholder="https://live.3k-darts.com/event/5/2995582" spellcheck="false" />
                                {#if scoringUrlDraft}
                                    <button type="button" class="ui-icon-button event-link-clear"
                                        aria-label="Event-Link löschen" title="Event-Link löschen"
                                        on:click={() => { scoringUrlDraft = ''; scoringError = ''; }}>×</button>
                                {/if}
                            </div>
                        </div>
                        <button type="submit" class="ui-button ui-button--primary">Verbinden</button>
                    </form>
                    {#if scoringError}<p class="field-error" role="alert">{scoringError}</p>{/if}
                    <label class="settings-switch" class:disabled={!scoringUrl}>
                        <span>3K-Live-Ansicht</span>
                        <input type="checkbox" role="switch" bind:checked={showIframe} disabled={!scoringUrl} />
                        <span class="switch-track" aria-hidden="true"></span>
                    </label>
                    {#if showIframe}
                        <div class="iframe-settings ui-panel">
                            <label class="ui-label" for="crop-top">Oben abschneiden (px)</label>
                            <input class="ui-field" id="crop-top" type="number" min="0" max="2000" bind:value={cropTop} />
                            <label class="ui-label" for="crop-bottom">Unten abschneiden (px)</label>
                            <input class="ui-field" id="crop-bottom" type="number" min="0" max="2000" bind:value={cropBottom} />
                            <label class="ui-label" for="iframe-zoom">Zoom · {Math.round(iframeZoom * 100)}%</label>
                            <input class="ui-range" id="iframe-zoom" type="range" min="0.5" max="2" step="0.1"
                                bind:value={iframeZoom} />
                        </div>
                    {/if}
                </div>
            </details>
            <button type="button" class="ui-button ui-button--secondary" aria-pressed={showFloatingWebcam}
                on:click={() => (showFloatingWebcam = !showFloatingWebcam)}>
                Webcam {showFloatingWebcam ? 'schließen' : 'öffnen'}
            </button>
        </div>
    </aside>
</main>

<style>
    .app-shell {
        --app-bar-height: 40px;
        --camera-gap: 4px;
        --camera-divider-width: 10px;
        --live-divider-height: 10px;
        --live-divider-margin: 4px;
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100vw;
        height: 100dvh;
        min-height: 560px;
        overflow: hidden;
        background: var(--color-background);
    }

    .app-shell.controls-idle:not(:has(:focus-visible)) {
        --app-bar-height: 4px;
        --camera-gap: 1px;
        --camera-divider-width: 2px;
        --live-divider-height: 2px;
        --live-divider-margin: 1px;
    }

    .app-shell.dragging {
        cursor: grabbing;
        user-select: none;
    }

    .app-bar {
        position: relative;
        z-index: 30;
        display: flex;
        flex: none;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        height: var(--app-bar-height);
        padding: 0 var(--space-2);
        border-top: 1px solid var(--color-border);
        background: var(--color-surface);
        opacity: var(--controls-opacity, 1);
        pointer-events: var(--controls-pointer-events, auto);
        overflow: hidden;
        transition: opacity 200ms ease, height 200ms ease;
    }

    .app-bar:has(:focus-visible) {
        opacity: 1;
        pointer-events: auto;
    }

    .camera-notice .ui-button {
        opacity: var(--controls-opacity, 1);
        pointer-events: var(--controls-pointer-events, auto);
        transition: opacity 200ms ease;
    }

    .camera-notice .ui-button:focus-visible {
        opacity: 1;
        pointer-events: auto;
    }

    .app-bar-brand,
    .layout-presets,
    .app-bar-actions,
    .bar-status,
    .bar-buttons {
        display: flex;
        align-items: center;
        min-width: 0;
    }

    .app-bar-actions {
        gap: var(--space-2);
        margin-left: auto;
    }

    .app-bar-brand {
        flex: none;
        gap: 12px;
    }

    .layout-presets {
        gap: var(--space-1);
    }

    .layout-preset {
        width: 32px;
        min-height: 28px;
        padding: 0;
    }

    .layout-preset[aria-pressed="true"] {
        border-color: var(--color-brand-text);
        background: var(--color-brand-active);
        color: var(--color-text);
    }

    .layout-preset text {
        font-family: var(--font-body);
        font-weight: 600;
    }

    .bar-status,
    .bar-buttons {
        gap: var(--space-1);
    }

    .bar-buttons {
        flex: none;
    }

    .app-title {
        flex: none;
        font: 500 18px/1 var(--font-display);
        letter-spacing: 0.04em;
        white-space: nowrap;
    }

    .app-title strong {
        color: var(--color-text);
        font-weight: 700;
    }

    .bar-status .ui-badge {
        min-width: 0;
        min-height: 22px;
        max-width: min(30vw, 360px);
        gap: var(--space-1);
        padding: 2px 7px;
        font-size: 10px;
        line-height: 1.2;
    }

    .bar-status .ui-badge::before {
        flex: none;
    }

    .badge-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .bar-button,
    .settings-trigger {
        height: 28px;
        min-height: 28px;
        padding: 0 var(--space-2);
        font-size: 11px;
        white-space: nowrap;
    }

    .settings-trigger {
        width: 28px;
        padding: 0;
    }

    .camera-notice {
        position: absolute;
        z-index: 400;
        bottom: calc(var(--app-bar-height) + var(--space-2));
        left: 50%;
        display: flex;
        align-items: center;
        gap: var(--space-3);
        max-width: min(90vw, 700px);
        padding: var(--space-2) var(--space-3);
        transform: translateX(-50%);
        border: 1px solid var(--color-error);
        border-radius: var(--radius-md);
        background: rgba(34, 36, 38, 0.97);
        box-shadow: var(--shadow-panel);
        color: var(--color-text);
    }

    .content-area {
        position: relative;
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
        padding: var(--space-2);
    }

    .broadcast-stage {
        display: flex;
        flex: none;
        flex-direction: column;
        min-height: 0;
    }

    .camera-section {
        position: relative;
        display: flex;
        flex: 1;
        gap: var(--camera-gap);
        min-height: 0;
        transition: gap 200ms ease;
    }

    .team-score-strip {
        display: grid;
        flex: none;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        gap: var(--space-3);
        min-height: 48px;
        margin-top: var(--space-1);
        padding: 4px var(--space-3);
        border: 1px solid var(--color-border);
        border-top: 2px solid var(--color-brand);
        border-radius: var(--radius-sm);
        background: var(--color-surface);
        color: var(--color-text);
    }

    .team-score-strip.stale {
        border-top-color: var(--color-warning);
    }

    .team-name {
        min-width: 0;
        overflow: hidden;
        font-size: 14px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .team-name.guest {
        text-align: right;
    }

    .team-result {
        display: flex;
        align-items: baseline;
        gap: 7px;
        font: 600 26px/1 var(--font-display);
        white-space: nowrap;
    }

    .team-result span {
        color: var(--color-brand-text);
    }

    .resizer-horizontal,
    .resizer-vertical {
        position: relative;
        z-index: 12;
        display: grid;
        flex: none;
        place-items: center;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-surface);
        opacity: var(--controls-opacity, 1);
        pointer-events: var(--controls-pointer-events, auto);
        transition: background 150ms ease, border-color 150ms ease, opacity 200ms ease,
            width 200ms ease, height 200ms ease, margin 200ms ease;
        touch-action: none;
    }

    .resizer-horizontal:focus-visible,
    .resizer-vertical:focus-visible {
        opacity: 1;
        pointer-events: auto;
    }

    .resizer-horizontal {
        width: var(--camera-divider-width);
        cursor: col-resize;
    }

    .resizer-horizontal span {
        width: 2px;
        height: 36px;
        border-radius: 99px;
        background: var(--color-text-muted);
    }

    .resizer-vertical {
        height: var(--live-divider-height);
        margin-top: var(--live-divider-margin);
        margin-bottom: var(--live-divider-margin);
        cursor: row-resize;
    }

    .resizer-vertical span {
        width: 36px;
        height: 2px;
        border-radius: 99px;
        background: var(--color-text-muted);
    }

    .resizer-horizontal:hover,
    .resizer-vertical:hover,
    .resizer-horizontal:focus-visible,
    .resizer-vertical:focus-visible {
        border-color: var(--color-brand-text);
        background: var(--color-brand-active);
    }

    .iframe-overlay {
        position: absolute;
        z-index: 100;
        inset: 0;
        background: transparent;
    }

    .settings-backdrop {
        position: absolute;
        z-index: 499;
        inset: 0;
        padding: 0;
        border: 0;
        background: rgb(0 0 0 / 35%);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 220ms ease, visibility 0s linear 220ms;
    }

    .settings-backdrop.open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transition-delay: 0s;
    }

    .settings-drawer {
        position: absolute;
        z-index: 500;
        top: 0;
        right: 0;
        bottom: var(--app-bar-height);
        display: flex;
        flex-direction: column;
        width: min(440px, calc(100vw - 32px));
        border-left: 1px solid #66696c;
        background: var(--color-surface);
        box-shadow: var(--shadow-panel);
        transform: translateX(100%);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: transform 220ms ease, opacity 180ms ease, visibility 0s linear 220ms;
    }

    .settings-drawer.open {
        transform: translateX(0);
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transition-delay: 0s;
    }

    .drawer-header {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface-raised);
    }

    .drawer-header h2 {
        margin: 0;
        font: 600 18px/1.2 var(--font-display);
    }

    .drawer-header .ui-icon-button {
        width: 28px;
        min-height: 28px;
        font-size: 22px;
        font-weight: 400;
        line-height: 1;
    }

    .drawer-body {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--space-2);
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: var(--space-3);
    }

    .settings-section {
        flex: none;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-background);
    }

    .settings-section summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        min-height: 44px;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        list-style: none;
        user-select: none;
    }

    .settings-section summary::-webkit-details-marker {
        display: none;
    }

    .settings-section summary::after {
        content: '';
        flex: none;
        width: 7px;
        height: 7px;
        margin-right: 3px;
        border-right: 2px solid var(--color-text-muted);
        border-bottom: 2px solid var(--color-text-muted);
        transform: rotate(45deg);
    }

    .settings-section summary:hover,
    .settings-section[open] summary {
        background: var(--color-surface-raised);
    }

    .settings-section[open] summary {
        border-bottom: 1px solid var(--color-border);
        border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    }

    .settings-section[open] summary::after {
        border-color: var(--color-brand-text);
        transform: translateY(3px) rotate(225deg);
    }

    .settings-section h3 {
        margin: 0;
        color: var(--color-text);
        font: 500 16px/1.3 var(--font-display);
    }

    .settings-section-body {
        display: grid;
        gap: var(--space-2);
        padding: 12px;
    }

    .settings-form,
    .iframe-settings {
        display: grid;
        gap: var(--space-2);
    }

    .settings-form .ui-button {
        width: 100%;
    }

    .settings-switch {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        min-height: 36px;
        cursor: pointer;
    }

    .settings-switch.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .settings-switch input {
        position: absolute;
        right: 0;
        width: 44px;
        height: 26px;
        margin: 0;
        opacity: 0;
    }

    .switch-track {
        flex: none;
        width: 44px;
        height: 26px;
        padding: 3px;
        border: 1px solid var(--color-text-muted);
        border-radius: 99px;
        background: var(--color-background);
    }

    .switch-track::before {
        content: '';
        display: block;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--color-text);
    }

    .settings-switch input:checked + .switch-track {
        border-color: var(--color-brand-text);
        background: var(--color-brand);
    }

    .settings-switch input:checked + .switch-track::before {
        transform: translateX(18px);
    }

    .settings-switch input:focus-visible + .switch-track {
        outline: 2px solid var(--color-text);
        outline-offset: 3px;
    }

    .event-link-field {
        position: relative;
    }

    .event-link-field .ui-field {
        padding-right: 42px;
    }

    .event-link-clear {
        position: absolute;
        top: 50%;
        right: 7px;
        width: 28px;
        min-height: 28px;
        padding: 0;
        transform: translateY(-50%);
        font-size: 22px;
        font-weight: 400;
        line-height: 1;
    }

    .iframe-settings {
        padding: 12px;
    }

    .iframe-settings .ui-label {
        margin: var(--space-1) 0 -4px;
    }

    .field-error {
        margin: 0;
        padding: var(--space-2);
        border-left: 3px solid var(--color-error);
        border-radius: var(--radius-sm);
        background: rgba(217, 58, 78, 0.13);
        color: #ffb2ba;
        font-size: 12px;
    }

    @media (prefers-reduced-motion: reduce) {
        .settings-backdrop,
        .settings-drawer,
        .app-bar,
        .camera-section,
        .camera-notice .ui-button,
        .resizer-horizontal,
        .resizer-vertical { transition: none; }
    }

</style>
