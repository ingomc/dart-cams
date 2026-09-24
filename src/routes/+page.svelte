<script lang="ts">
	import { onMount, onDestroy, tick } from "svelte";
	import CameraView from "$lib/components/CameraView.svelte";
	import IframeSection from "$lib/components/IframeSection.svelte";
	import { defaultCamSettings } from "$lib/constants";
	import { LiveScoringClient, type ScoringStatus } from "$lib/liveScoring";
	import { listBoards, parseScoringEventUrl, teamScoreForBoards, type LiveMatch } from "$lib/scoring";
	import type { CamSettings, CamSetting } from "$lib/types";

	// Zustand für verfügbare Geräte und ausgewählte IDs
	let videoDevices: MediaDeviceInfo[] = [];
	let cameraError = "";
	let checkingCameras = false;
	let selectedCam1 = "";
	let selectedCam2 = "";
	let cam1Label = "Heim";
	let cam2Label = "Gast";
	let showFloatingWebcam = false;
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
	let topHeight = 70; // in % when the live view is open
	let leftWidth = 50; // in %
	let isDraggingVertical = false;
	let isDraggingHorizontal = false;
	let showIframe = false;

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

	async function openSettings(): Promise<void> {
		activeCameraSettings = null;
		settingsOpen = true;
		await tick();
		document.getElementById('scoring-event-url')?.focus();
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
		await tick();
		document.getElementById(closing ? `camera-config-trigger-${slot}` : `cam-select-${slot}`)?.focus();
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
		if (slot === 'cam1') cam1BoardKey = board;
		else cam2BoardKey = board;
		saveBoardSelection();
	}

	function activateScoringUrl(value: string): void {
		const event = parseScoringEventUrl(value);
		if (!event) {
			scoringError = 'Bitte einen 3K-Live-Link im Format https://live.3k-darts.com/event/5/2995582 eingeben.';
			return;
		}
		scoringError = '';
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
		scoringClient = new LiveScoringClient({
			onMatches: (next) => (matches = next),
			onStatus: (next) => (scoringStatus = next),
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

		getDevices();
		navigator.mediaDevices?.addEventListener("devicechange", getDevices);

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
		scoringClient?.stop();
		if (typeof window !== "undefined") {
			navigator.mediaDevices?.removeEventListener("devicechange", getDevices);
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

	async function getDevices() {
		if (checkingCameras) return;
		checkingCameras = true;
		cameraError = "";
		let permissionStream: MediaStream | null = null;
		try {
			let devices = await navigator.mediaDevices.enumerateDevices();
			if (!devices.some((device) => device.kind === "videoinput" && device.label)) {
				permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
				devices = await navigator.mediaDevices.enumerateDevices();
			}
			videoDevices = devices.filter(
				(device) => device.kind === "videoinput",
			);
			if (!videoDevices.length) cameraError = "Keine Kamera gefunden. Anschluss und Browserberechtigung prüfen.";

			const savedSelections = localStorage.getItem("dartCamSelections");
			let savedCam1 = "";
			let savedCam2 = "";

			if (savedSelections) {
				try {
					const selections = JSON.parse(savedSelections);
					savedCam1 = selections.cam1;
					savedCam2 = selections.cam2;
				} catch (e) {
					console.error("Failed to parse saved camera selections", e);
				}
			}

			if (
				savedCam1 &&
				videoDevices.some((d) => d.deviceId === savedCam1)
			) {
				selectedCam1 = savedCam1;
			} else if (!videoDevices.some((d) => d.deviceId === selectedCam1)) {
				selectedCam1 = videoDevices[0]?.deviceId ?? "";
			}

			if (
				savedCam2 &&
				videoDevices.some((d) => d.deviceId === savedCam2)
			) {
				selectedCam2 = savedCam2;
			} else if (!videoDevices.some((d) => d.deviceId === selectedCam2)) {
				selectedCam2 = videoDevices[1]?.deviceId ?? "";
			}
		} catch (err) {
			console.error("Fehler beim Zugriff auf Kameras:", err);
			cameraError = "Kamerazugriff nicht möglich. Bitte Browserberechtigung prüfen und erneut versuchen.";
		} finally {
			permissionStream?.getTracks().forEach((track) => track.stop());
			checkingCameras = false;
		}
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
		isLoadingSettings[slot] = true;

		if (savedSettings[deviceId]) {
			console.log(`Loading settings for ${slot} (${deviceId})`);
			camSettings[slot] = {
				...defaultCamSettings,
				...savedSettings[deviceId],
			};
		} else {
			console.log(
				`No saved settings for ${slot} (${deviceId}), using defaults`,
			);
			camSettings[slot] = { ...defaultCamSettings };
		}

		setTimeout(() => {
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

	$: if (selectedCam1) {
		loadSettings("cam1", selectedCam1);
	}
	$: if (selectedCam2) {
		loadSettings("cam2", selectedCam2);
	}

	$: if (selectedCam1 && camSettings.cam1)
		saveSettings("cam1", selectedCam1, camSettings.cam1);
	$: if (selectedCam2 && camSettings.cam2)
		saveSettings("cam2", selectedCam2, camSettings.cam2);

	$: {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(
				"dartCamLabels",
				JSON.stringify({ cam1: cam1Label, cam2: cam2Label }),
			);
		}
	}

	$: {
		if (
			typeof localStorage !== "undefined" &&
			(selectedCam1 || selectedCam2)
		) {
			localStorage.setItem(
				"dartCamSelections",
				JSON.stringify({ cam1: selectedCam1, cam2: selectedCam2 }),
			);
		}
	}
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<main class="app-shell" class:dragging={isDraggingVertical || isDraggingHorizontal}>
    <header class="topbar">
        <div class="app-identity">
            <span class="app-title">SCO <strong>DARTCAMS</strong></span>
            <span class="app-subtitle">Live-Kameraansicht</span>
        </div>
        <div class="top-actions">
            <span class="ui-badge {scoringStatus === 'live' ? 'ui-badge--success' : scoringStatus === 'error' ? 'ui-badge--error' : scoringStatus === 'connecting' || scoringStatus === 'offline' ? 'ui-badge--warning' : ''}"
                aria-live="polite">
                {scoringStatusText[scoringStatus]}{scoringUrl && matches.length ? ' · ' + matches.length + (matches.length === 1 ? ' Match' : ' Matches') : ''}
            </span>
            <button type="button" class="ui-button ui-button--secondary settings-trigger"
                bind:this={settingsButton} aria-controls="settings-panel" aria-expanded={settingsOpen}
                on:click={() => settingsOpen ? closeSettings() : openSettings()}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                    stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                    <path d="M3 6h18M3 12h18M3 18h18" />
                    <circle cx="8" cy="6" r="2" fill="var(--color-background)" />
                    <circle cx="16" cy="12" r="2" fill="var(--color-background)" />
                    <circle cx="10" cy="18" r="2" fill="var(--color-background)" />
                </svg>
                Einstellungen
            </button>
        </div>
    </header>

    {#if cameraError}
        <div class="camera-notice" role="alert">
            <span>{cameraError}</span>
            <button type="button" class="ui-button ui-button--secondary ui-button--small"
                on:click={getDevices} disabled={checkingCameras}>Erneut versuchen</button>
        </div>
    {/if}

    <div class="content-area" bind:this={contentArea}>
        <div class="broadcast-stage" style="height: {showIframe ? topHeight : 100}%;">
            <div class="camera-section">
                <CameraView
                    bind:this={cam1View}
                    camId="cam1"
                    width={leftWidth}
                    bind:settings={camSettings.cam1}
                    editLocked={editingCam !== null}
                    bind:selectedDeviceId={selectedCam1}
                    bind:label={cam1Label}
                    bind:containerElement={container1}
                    bind:boardKey={cam1BoardKey}
                    bind:scorePos={cam1ScorePos}
                    bind:ready={cam1Ready}
                    {videoDevices}
                    availableBoards={cam1Boards}
                    {checkingCameras}
                    configOpen={activeCameraSettings === 'cam1'}
                    scoringStatus={scoringStatus}
                    {matches}
                    on:configure={() => toggleCameraSettings('cam1')}
                    on:boardChange={(event) => updateBoard('cam1', event.detail.board)}
                    on:refreshDevices={getDevices}
                    on:editRequest={() => beginCameraEdit('cam1')}
                    on:editStart={() => (editingCam = "cam1")}
                    on:editEnd={finishCameraEdit}
                    on:scoreDragStart={(event) => startScoreDrag(1, event.detail.originalEvent)}
                />

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

                <CameraView
                    bind:this={cam2View}
                    camId="cam2"
                    width={100 - leftWidth}
                    bind:settings={camSettings.cam2}
                    editLocked={editingCam !== null}
                    bind:selectedDeviceId={selectedCam2}
                    bind:label={cam2Label}
                    bind:containerElement={container2}
                    bind:boardKey={cam2BoardKey}
                    bind:scorePos={cam2ScorePos}
                    bind:ready={cam2Ready}
                    {videoDevices}
                    availableBoards={cam2Boards}
                    {checkingCameras}
                    configOpen={activeCameraSettings === 'cam2'}
                    scoringStatus={scoringStatus}
                    {matches}
                    on:configure={() => toggleCameraSettings('cam2')}
                    on:boardChange={(event) => updateBoard('cam2', event.detail.board)}
                    on:refreshDevices={getDevices}
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
            bind:showFloatingWebcam {showIframe} {videoDevices}>
            <div slot="overlay">
                {#if isDraggingVertical || isDraggingHorizontal}
                    <div class="iframe-overlay"></div>
                {/if}
            </div>
        </IframeSection>
    </div>

    <aside id="settings-panel" class="settings-drawer" aria-labelledby="settings-title" hidden={!settingsOpen}>
        <div class="drawer-header">
            <div>
                <span class="drawer-eyebrow">SCO Dartcams</span>
                <h2 id="settings-title">Einstellungen</h2>
            </div>
            <button type="button" class="ui-icon-button" aria-label="Einstellungen schließen"
                on:click={closeSettings}>×</button>
        </div>
        <div class="drawer-body">
            <section class="settings-section" aria-labelledby="scoring-title">
                <h3 id="scoring-title" class="ui-section-title">Live-Scoring</h3>
                <form class="settings-form" on:submit|preventDefault={() => activateScoringUrl(scoringUrlDraft)}>
                    <div>
                        <label class="ui-label" for="scoring-event-url">3K-Live-Event-Link</label>
                        <input class="ui-field" id="scoring-event-url" type="text" inputmode="url"
                            bind:value={scoringUrlDraft} aria-invalid={!!scoringError}
                            placeholder="https://live.3k-darts.com/event/5/2995582" spellcheck="false" />
                    </div>
                    <button type="submit" class="ui-button ui-button--primary">Verbinden</button>
                </form>
                {#if scoringError}<p class="field-error" role="alert">{scoringError}</p>{/if}
                <p class="ui-help">{scoringStatusText[scoringStatus]}</p>
            </section>

            <section class="settings-section" aria-labelledby="display-title">
                <h3 id="display-title" class="ui-section-title">Ansicht</h3>
                <div class="display-actions">
                    <button type="button" class="ui-button ui-button--secondary" aria-pressed={showIframe}
                        disabled={!scoringUrl} on:click={() => (showIframe = !showIframe)}>
                        3K-Live-Ansicht {showIframe ? 'ausblenden' : 'einblenden'}
                    </button>
                    <button type="button" class="ui-button ui-button--secondary" aria-pressed={showFloatingWebcam}
                        on:click={() => (showFloatingWebcam = !showFloatingWebcam)}>
                        Webcam {showFloatingWebcam ? 'schließen' : 'öffnen'}
                    </button>
                </div>
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
            </section>
        </div>
    </aside>
</main>

<style>
    .app-shell {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100vw;
        height: 100dvh;
        min-height: 560px;
        overflow: hidden;
        background: var(--color-background);
    }

    .app-shell.dragging {
        cursor: grabbing;
        user-select: none;
    }

    .topbar {
        position: relative;
        z-index: 30;
        display: flex;
        flex: none;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        height: 60px;
        padding: 0 var(--space-3);
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
    }

    .app-identity,
    .top-actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        min-width: 0;
    }

    .app-title {
        font: 500 21px/1 var(--font-display);
        letter-spacing: 0.04em;
        white-space: nowrap;
    }

    .app-title strong {
        color: var(--color-text);
        font-weight: 700;
    }

    .app-subtitle {
        padding-left: var(--space-3);
        border-left: 1px solid var(--color-border);
        color: var(--color-text-muted);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        white-space: nowrap;
    }

    .top-actions .ui-badge {
        max-width: 360px;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .settings-trigger {
        min-height: 34px;
        gap: 6px;
        padding: 0 10px;
        font-size: 12px;
        white-space: nowrap;
    }

    .camera-notice {
        position: absolute;
        z-index: 400;
        top: 68px;
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
        gap: var(--space-1);
        min-height: 0;
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
        transition: background 150ms ease, border-color 150ms ease;
        touch-action: none;
    }

    .resizer-horizontal {
        width: 10px;
        cursor: col-resize;
    }

    .resizer-horizontal span {
        width: 2px;
        height: 36px;
        border-radius: 99px;
        background: var(--color-text-muted);
    }

    .resizer-vertical {
        height: 10px;
        margin-top: var(--space-1);
        margin-bottom: var(--space-1);
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

    .settings-drawer {
        position: absolute;
        z-index: 500;
        top: 60px;
        right: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        width: min(360px, 34vw);
        border-left: 1px solid #66696c;
        background: var(--color-surface);
        box-shadow: var(--shadow-panel);
    }

    .settings-drawer[hidden] {
        display: none;
    }

    .drawer-header {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-3);
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface-raised);
    }

    .drawer-eyebrow {
        color: var(--color-brand-text);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
    }

    .drawer-header h2 {
        margin: 2px 0 0;
        font: 600 24px/1.15 var(--font-display);
        text-transform: uppercase;
    }

    .drawer-header .ui-icon-button {
        font-size: 25px;
        font-weight: 400;
        line-height: 1;
    }

    .drawer-body {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--space-4);
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: var(--space-3);
    }

    .settings-section {
        display: grid;
        gap: var(--space-2);
        padding-bottom: var(--space-4);
        border-bottom: 1px solid var(--color-border);
    }

    .settings-section:last-child {
        border-bottom: 0;
    }

    .settings-form,
    .iframe-settings,
    .display-actions {
        display: grid;
        gap: var(--space-2);
    }

    .settings-form .ui-button,
    .display-actions .ui-button {
        width: 100%;
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

    @media (max-height: 700px) {
        .topbar { height: 52px; }
        .settings-drawer { top: 52px; }
        .camera-notice { top: 60px; }
        .drawer-body { gap: var(--space-3); }
    }
</style>
