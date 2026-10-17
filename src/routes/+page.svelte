<script lang="ts">
	import { onMount, onDestroy, tick } from "svelte";
	import { base } from '$app/paths';
	import { sourceKey, restoreSources, type CameraSource } from '$lib/cameraSources';
	import { restoreCameraSettings, ensureCameraProfiles, cameraSettingsFor, applyCameraSettings, type CameraLayout, type CameraSlot, type CameraSettingsApply } from '$lib/cameraLayoutSettings';
	import { DartRectifyDiscovery, initialConnection, connectionLabels, connectionHelp, type BridgeConnection } from '$lib/dartrectify/connection';
	let bridge: BridgeConnection = initialConnection;
	let discovery: DartRectifyDiscovery;
	let sourcesRestored = false;
	import SettingsSection from "$lib/components/SettingsSection.svelte";
	import LivestreamSettings from '$lib/components/LivestreamSettings.svelte';
	import StreamSceneControls from '$lib/components/StreamSceneControls.svelte';
	import { LivestreamClient } from '$lib/streaming/client';
	import { StreamCompositor } from '$lib/streaming/compositor';
	import { initialStreamState, isStreamActive } from '$lib/streaming/protocol';
	let livestream: LivestreamClient | undefined;
	let streamState = { ...initialStreamState };
	$: streamActive = isStreamActive(streamState.phase);
	function showStreamSettings(): void {
		openSettings();
		activeSettingsSection = 'settings-stream';
	}
	function startStream(): void {
		settingsOpen = false;
		activeCameraSettings = null;
		if (streamState.phase === 'previewing') livestream?.confirmCapture();
		else void livestream?.start();
	}
	function stopStream(): void { livestream?.stop(); }
	let activeSettingsSection = "";
	import CameraView from "$lib/components/CameraView.svelte";
	import OverlaySizeControls from "$lib/components/OverlaySizeControls.svelte";
	import IframeSection from "$lib/components/IframeSection.svelte";
	import { defaultCamSettings } from "$lib/constants";
	import { LiveScoringClient, type ScoringStatus } from "$lib/liveScoring";
	import { listBoards, parseScoringEventUrl, teamScoreForBoards, type LiveMatch } from "$lib/scoring";
	import type { CamSettings } from "$lib/types";
	import type { ScoringCelebration } from "$lib/scoringCelebration";
	import { restoreOverlaySizes } from "$lib/overlaySizes";
	import { CameraDiagnostics } from '$lib/cameraDiagnostics';
	import { AutoScoringClient, restoreAutoScoringContext, restoreBoardSelection, assignAvailableBoards, serializeBoardSelection, type AutoScoringContext, type AutoScoringStatus } from '$lib/autoScoring';

	const cameraDiagnostics = new CameraDiagnostics();
	let diagnosticCount = 0;
	let diagnosticStorageAvailable = true;
	let unsubscribeDiagnostics: (() => void) | undefined;
	let diagnosticPruneTimer: ReturnType<typeof setInterval> | undefined;
	const handleVisibilityChange = () => cameraDiagnostics.record('app', 'tab_visibility', { visible: !document.hidden });

	function downloadCameraDiagnostics(): void {
		const data = {
			...cameraDiagnostics.exportData(),
			browser: navigator.userAgent,
			secureContext: window.isSecureContext
		};
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `sco-dartcams-kamera-log-${data.exportedAt.replace(/[:.]/g, '-')}.json`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

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
	let automaticScoring = true;
	let autoScoringStatus: AutoScoringStatus = 'loading';
	let autoScoringContext: AutoScoringContext | null = null;
	let autoScoringClient: AutoScoringClient | null = null;
	let pendingBoardAssignment = { cam1: false, cam2: false };
	$: selectedFixture = autoScoringContext?.fixture?.liveUrl === scoringUrl ? autoScoringContext.fixture : null;
	$: automaticScoringNotice = autoScoringStatus === 'error' ? scoringUrl
		? 'Spielauswahl nicht erreichbar – zuletzt verbundener Event bleibt aktiv.' : 'Spielauswahl nicht erreichbar. Erneut laden oder manuell verbinden.' :
		autoScoringStatus === 'stale' ? 'Spielauswahl nicht aktualisiert – letzter gespeicherter Stand.' : '';

	function fixtureDate(value: string): string {
		return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
	}

	function toggleAutomaticScoring(event: Event): void {
		automaticScoring = (event.currentTarget as HTMLInputElement).checked;
		localStorage.setItem('dartScoringAutomatic', String(automaticScoring));
		if (automaticScoring) {
			autoScoringClient?.start(autoScoringContext ?? restoreAutoScoringContext(localStorage.getItem('dartScoringAutoContext')));
		} else {
			autoScoringClient?.stop();
			autoScoringStatus = 'ready';
			if (!scoringUrl) {
				const saved = localStorage.getItem('dartScoringEventUrl');
				if (saved) activateScoringUrl(saved);
			}
		}
	}

	function receiveMatches(next: LiveMatch[]): void {
		matches = next;
		if (!automaticScoring || autoScoringContext?.fixture?.liveUrl !== scoringUrl) return;
		const selection = assignAvailableBoards(next, {
			boards: { cam1: cam1BoardKey, cam2: cam2BoardKey }, pending: pendingBoardAssignment,
		});
		if (selection.boards.cam1 === cam1BoardKey && selection.boards.cam2 === cam2BoardKey) return;
		cam1BoardKey = selection.boards.cam1;
		cam2BoardKey = selection.boards.cam2;
		pendingBoardAssignment = selection.pending;
		saveBoardSelection();
	}

	let container1: HTMLElement;
	let container2: HTMLElement;
	let contentArea: HTMLElement;

	// Layout State
	const cameraLayoutPresets = [
		{ value: 'split', label: 'Beide Kameras · 50/50' },
		{ value: 'cam1', label: 'Nur Kamera 1' },
		{ value: 'cam2', label: 'Nur Kamera 2' },
	] as const;
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

	let cameraSettingsStore = restoreCameraSettings(null, null);

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
	$: scoringStatusLabel = (automaticScoring && !scoringUrl
		? autoScoringStatus === 'loading' ? 'Spiel wird gesucht…' : autoScoringStatus === 'error' ? 'Spielauswahl nicht verfügbar' : 'Kein anstehendes Spiel'
		: selectedFixture && !matches.length && (scoringStatus === 'live' || scoringStatus === 'connecting')
			? 'Warte auf Live-Scoring' : scoringStatusText[scoringStatus]) + (scoringUrl && matches.length
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
		pendingBoardAssignment[slot] = false;
		if (slot === 'cam1') { cam1Celebration = null; cam1BoardKey = board; }
		else { cam2Celebration = null; cam2BoardKey = board; }
		saveBoardSelection();
	}

	function activateScoringUrl(value: string, keepCurrent = false): void {
		const event = parseScoringEventUrl(value);
		if (!event) {
			scoringError = 'Bitte einen 3K-Live-Link im Format https://live.3k-darts.com/event/5/2995582 eingeben.';
			return;
		}
		scoringError = '';
		if (keepCurrent && activeEventKey === event.key) return;
		cam1Celebration = null;
		cam2Celebration = null;
		scoringUrl = event.url;
		scoringUrlDraft = event.url;
		activeEventKey = event.key;
		const selection = restoreBoardSelection(localStorage.getItem(`dartScoringBoards:${event.key}`), automaticScoring);
		cam1BoardKey = selection.boards.cam1;
		cam2BoardKey = selection.boards.cam2;
		pendingBoardAssignment = selection.pending;
		localStorage.setItem('dartScoringEventUrl', event.url);
		scoringClient?.start(event);
	}

	function saveBoardSelection(): void {
		if (!activeEventKey) return;
		localStorage.setItem(`dartScoringBoards:${activeEventKey}`,
			serializeBoardSelection({ boards: { cam1: cam1BoardKey, cam2: cam2BoardKey }, pending: pendingBoardAssignment }));
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
		livestream = new LivestreamClient(state => {
			streamState = state;
			if (state.phase === 'error' || state.phase === 'previewing') showStreamSettings();
		}, (source, scene, onError) => new StreamCompositor(source, scene, onError, base));
		window.addEventListener('pagehide', stopStream);
		unsubscribeDiagnostics = cameraDiagnostics.subscribe(() => {
			diagnosticCount = cameraDiagnostics.snapshot().length;
			diagnosticStorageAvailable = cameraDiagnostics.storageAvailable;
		});
		cameraDiagnostics.record('app', 'app_opened');
		document.addEventListener('visibilitychange', handleVisibilityChange);
		diagnosticPruneTimer = setInterval(() => { diagnosticCount = cameraDiagnostics.snapshot().length; }, 30_000);
		controlsMounted = true;
		window.addEventListener('pointermove', revealControls, { passive: true });
		window.addEventListener('pointerdown', revealControls, true);
		window.addEventListener('keydown', revealControls, true);
		window.addEventListener('focusin', revealControls, true);
		scoringClient = new LiveScoringClient({
			onMatches: receiveMatches,
			onStatus: (next) => (scoringStatus = next),
			onCelebration: (event) => {
				if (event.board === cam1BoardKey && editingCam !== 'cam1') cam1Celebration = event;
				if (event.board === cam2BoardKey && editingCam !== 'cam2') cam2Celebration = event;
			},
		});
		autoScoringClient = new AutoScoringClient({
			onContext: (context) => {
				autoScoringContext = context;
				try { localStorage.setItem('dartScoringAutoContext', JSON.stringify(context)); } catch { /* Keep the current session usable without persistent storage. */ }
				if (context.fixture) activateScoringUrl(context.fixture.liveUrl, true);
				else {
					scoringClient?.stop();
					scoringUrl = ''; scoringUrlDraft = ''; activeEventKey = '';
					cam1BoardKey = ''; cam2BoardKey = '';
					pendingBoardAssignment = { cam1: false, cam2: false };
				}
			},
			onStatus: (status) => {
				autoScoringStatus = status;
				if (status === 'error' && !scoringUrl) {
					const saved = localStorage.getItem('dartScoringEventUrl');
					if (saved && parseScoringEventUrl(saved)) activateScoringUrl(saved);
				}
			},
		}, { endpoint: import.meta.env.VITE_DARTCAMS_CONTEXT_URL || undefined });
		automaticScoring = localStorage.getItem('dartScoringAutomatic') !== 'false';
		if (automaticScoring) {
			autoScoringClient.start(restoreAutoScoringContext(localStorage.getItem('dartScoringAutoContext')));
		} else {
			autoScoringStatus = 'ready';
			const savedScoringUrl = localStorage.getItem('dartScoringEventUrl');
			if (savedScoringUrl) activateScoringUrl(savedScoringUrl);
		}
		cameraSettingsStore = restoreCameraSettings(
			localStorage.getItem('dartCamSettings'), localStorage.getItem('dartCamLayoutSettings'),
		);
		localStorage.setItem('dartCamLayoutSettings', JSON.stringify(cameraSettingsStore.layouts));

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
		discovery = new DartRectifyDiscovery((connection) => {
			cameraDiagnostics.record('app', 'dartrectify_connection', {
				status: connection.status,
				sessionChanged: !!bridge.token && !!connection.token && bridge.token !== connection.token
			});
			bridge = connection;
		}, (event, details) => cameraDiagnostics.record('app', event, details));
		discovery.start();
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
		livestream?.dispose();
		unsubscribeDiagnostics?.();
		if (diagnosticPruneTimer) clearInterval(diagnosticPruneTimer);
		if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibilityChange);
		controlsMounted = false;
		if (controlsTimer !== null) clearTimeout(controlsTimer);
		scoringClient?.stop();
		autoScoringClient?.stop();
		discovery?.stop();
		if (typeof window !== "undefined") {
			window.removeEventListener('pagehide', stopStream);
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

	function refreshKnownDevices() {
		cameraDiagnostics.record('app', 'device_list_changed');
		void getDevices();
	}
	async function getDevices(requestPermission = false) {
		if (checkingCameras) return;
		checkingCameras = true; cameraError = '';
		cameraDiagnostics.record('app', 'device_scan_started', { reason: requestPermission ? 'user_refresh' : 'automatic' });
		let permissionStream: MediaStream | null = null;
		try {
			if (!navigator.mediaDevices) throw new Error('Kamera-API nicht verfügbar');
			let devices = await navigator.mediaDevices.enumerateDevices();
			if (requestPermission && !devices.some(d => d.kind === 'videoinput' && d.label)) {
				permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
				devices = await navigator.mediaDevices.enumerateDevices();
			}
			videoDevices = devices.filter(d => d.kind === 'videoinput');
			cameraDiagnostics.record('app', 'device_scan_finished', { cameraCount: videoDevices.length });
			if (requestPermission && !videoDevices.length) cameraError = 'Keine Webcam gefunden. Anschluss und Browserberechtigung prüfen.';
		} catch (error) {
			cameraDiagnostics.record('app', 'device_scan_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
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

	function loadSettings(slot: CameraSlot, deviceId: string, layout: CameraLayout): void {
		if (ensureCameraProfiles(cameraSettingsStore, slot, deviceId)) {
			localStorage.setItem('dartCamLayoutSettings', JSON.stringify(cameraSettingsStore.layouts));
		}
		camSettings[slot] = cameraSettingsFor(cameraSettingsStore, layout, slot, deviceId);
	}

	function saveCameraSettings(slot: CameraSlot, change: CameraSettingsApply): void {
		if (editingCam !== slot || change.sourceKey !== sourceKey(slot === 'cam1' ? selectedCam1 : selectedCam2)) return;
		applyCameraSettings(cameraSettingsStore, cameraLayout, slot, change);
		localStorage.setItem('dartCamSettings', JSON.stringify(cameraSettingsStore.sources));
		localStorage.setItem('dartCamLayoutSettings', JSON.stringify(cameraSettingsStore.layouts));
		// The same source may be shown in both slots; shared color/calibration changes apply to both.
		loadSettings('cam1', sourceKey(selectedCam1), cameraLayout);
		loadSettings('cam2', sourceKey(selectedCam2), cameraLayout);
	}

	$: if (sourcesRestored) loadSettings('cam1', sourceKey(selectedCam1), cameraLayout);
	$: if (sourcesRestored) loadSettings('cam2', sourceKey(selectedCam2), cameraLayout);
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
                    settings={camSettings.cam1}
                    editLocked={editingCam !== null}
                    {bridge}
                    bind:selectedSource={selectedCam1}
                    bind:label={cam1Label}
                    logoUrl={selectedFixture?.home.logoUrl ?? null}
                    logoTeamName={selectedFixture?.home.name ?? ''}
                    teamTotal={teamScore ? { name: teamScore.home, sets: teamScore.homeScore, legs: teamScore.homeLegs } : null}
                    {overlaySizes}
                    bind:containerElement={container1}
                    bind:boardKey={cam1BoardKey}
                    bind:scorePos={cam1ScorePos}
                    bind:ready={cam1Ready}
                    celebration={cam1Celebration}
                    {videoDevices}
                    availableBoards={cam1Boards}
                    {checkingCameras}
                    {cameraDiagnostics}
                    configOpen={activeCameraSettings === 'cam1'}
                    scoringStatus={scoringStatus}
                    {matches}
                    on:configure={() => toggleCameraSettings('cam1')}
                    on:boardChange={(event) => updateBoard('cam1', event.detail.board)}
                    on:refreshDevices={() => getDevices(true)}
                    on:editRequest={() => beginCameraEdit('cam1')}
                    on:editStart={() => (editingCam = "cam1")}
                    on:editEnd={finishCameraEdit}
                    on:settingsApply={(event) => saveCameraSettings('cam1', event.detail)}
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
                    settings={camSettings.cam2}
                    editLocked={editingCam !== null}
                    {bridge}
                    bind:selectedSource={selectedCam2}
                    bind:label={cam2Label}
                    logoUrl={selectedFixture?.guest.logoUrl ?? null}
                    logoTeamName={selectedFixture?.guest.name ?? ''}
                    teamTotal={teamScore ? { name: teamScore.guest, sets: teamScore.guestScore, legs: teamScore.guestLegs } : null}
                    {overlaySizes}
                    bind:containerElement={container2}
                    bind:boardKey={cam2BoardKey}
                    bind:scorePos={cam2ScorePos}
                    bind:ready={cam2Ready}
                    celebration={cam2Celebration}
                    {videoDevices}
                    availableBoards={cam2Boards}
                    {checkingCameras}
                    {cameraDiagnostics}
                    configOpen={activeCameraSettings === 'cam2'}
                    scoringStatus={scoringStatus}
                    {matches}
                    on:configure={() => toggleCameraSettings('cam2')}
                    on:boardChange={(event) => updateBoard('cam2', event.detail.board)}
                    on:refreshDevices={() => getDevices(true)}
                    on:editRequest={() => beginCameraEdit('cam2')}
                    on:editStart={() => (editingCam = "cam2")}
                    on:editEnd={finishCameraEdit}
                    on:settingsApply={(event) => saveCameraSettings('cam2', event.detail)}
                    on:scoreDragStart={(event) => startScoreDrag(2, event.detail.originalEvent)}
                />
            </div>

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
            {checkingCameras} {cameraError} {cameraDiagnostics}
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
				{#if streamActive}
					<StreamSceneControls compact scene={streamState.scene} onSelect={scene => livestream?.setScene(scene)} />
				{/if}
                <button type="button" class="ui-button ui-button--secondary bar-button stream-button"
                    class:streaming={streamActive} aria-label={streamActive ? 'Livestream stoppen' : 'Livestream einrichten'}
                    title={streamActive ? 'Livestream stoppen' : 'Livestream'}
                    on:click={() => streamActive ? stopStream() : showStreamSettings()}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        {#if streamActive}<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" />
                        {:else}<circle cx="12" cy="12" r="3" /><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17" />{/if}
                    </svg>
                    {streamState.phase === 'live' ? 'Stop' : streamActive ? 'Abbrechen' : 'Stream'}
                </button>
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
            <SettingsSection id="settings-overlays" title="Einblendungen" icon="M4 7h16M4 17h16M8 4v6M16 14v6" bind:active={activeSettingsSection}>
                <div class="settings-section-body">
                    <OverlaySizeControls bind:sizes={overlaySizes} />
                </div>
            </SettingsSection>
            <SettingsSection id="settings-rectify" title="DartRectify" icon="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" bind:active={activeSettingsSection}>
                <div class="settings-section-body">
                    <button class="ui-button ui-button--secondary" type="button" on:click={() => discovery?.retry()}>Verbindung erneut prüfen</button>
                <a class="ui-button ui-button--secondary" href="https://github.com/ingomc/DartRectify-Releases/releases/latest" target="_blank" rel="noopener noreferrer">DartRectify für Windows herunterladen ↗</a>
                </div>
            </SettingsSection>
            <SettingsSection id="settings-scoring" title="Live-Scoring" icon="M4 4h16v16H4zM8 8h2M8 12h2M8 16h2M14 8h2M14 12h2M14 16h2" bind:active={activeSettingsSection}>
                <div class="settings-section-body">
                    <label class="settings-switch">
                        <span>Spiel automatisch aus Fülltreffer</span>
                        <input type="checkbox" role="switch" checked={automaticScoring} on:change={toggleAutomaticScoring} />
                        <span class="switch-track" aria-hidden="true"></span>
                    </label>
                    {#if automaticScoring}
                        <div class="fixture-summary" aria-live="polite">
                            <div>
                                {#if autoScoringContext?.fixture}
                                    <strong>{autoScoringContext.fixture.home.name} · {autoScoringContext.fixture.guest.name}</strong>
                                    <span>{autoScoringContext.fixture.roundName} · {fixtureDate(autoScoringContext.fixture.datePlanned)}</span>
                                {:else}
                                    <span>{autoScoringStatus === 'loading' ? 'Spiel wird gesucht…' : autoScoringStatus === 'error' ? 'Spielauswahl nicht verfügbar' : 'Kein anstehendes Spiel'}</span>
                                {/if}
                            </div>
                            <button type="button" class="ui-icon-button" aria-label="Spielauswahl aktualisieren" title="Spielauswahl aktualisieren"
                                disabled={autoScoringStatus === 'loading'} on:click={() => autoScoringClient?.refresh(true)}>
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                                    <path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3l1 3M4 12l1 3a8 8 0 0 0 13 3" />
                                </svg>
                            </button>
                        </div>
                        {#if automaticScoringNotice}<p class="field-error" role="status">{automaticScoringNotice}</p>{/if}
                    {/if}
                    <form class="settings-form" on:submit|preventDefault={() => { if (!automaticScoring) activateScoringUrl(scoringUrlDraft); }}>
                        <div>
                            <label class="ui-label" for="scoring-event-url">3K-Live-Event-Link</label>
                            <div class="event-link-field">
                                <input class="ui-field" id="scoring-event-url" type="text" inputmode="url"
                                    bind:value={scoringUrlDraft} aria-invalid={!!scoringError} readonly={automaticScoring}
                                    placeholder="https://live.3k-darts.com/event/5/2995582" spellcheck="false" />
                                {#if scoringUrlDraft && !automaticScoring}
                                    <button type="button" class="ui-icon-button event-link-clear"
                                        aria-label="Event-Link löschen" title="Event-Link löschen"
                                        on:click={() => { scoringUrlDraft = ''; scoringError = ''; }}>×</button>
                                {/if}
                            </div>
                        </div>
                        {#if !automaticScoring}<button type="submit" class="ui-button ui-button--primary">Verbinden</button>{/if}
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
            </SettingsSection>
            <SettingsSection id="settings-stream" title="Livestream" icon="M9 8l7 4-7 4V8ZM5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" bind:active={activeSettingsSection}>
                <LivestreamSettings client={livestream} state={streamState} onStart={startStream} />
            </SettingsSection>
            <SettingsSection id="settings-diagnostics" title="Kamera-Diagnose" icon="M3 12h4l2-5 4 10 2-5h6M3 20h18" bind:active={activeSettingsSection}>
                <div class="settings-section-body">
                    <p class="diagnostic-summary">{diagnosticCount} Ereignisse aus den letzten 10 Minuten</p>
                    {#if !diagnosticStorageAvailable}
                        <p class="diagnostic-summary" role="status">Der Browser speichert das Protokoll nur bis zum Neuladen.</p>
                    {/if}
                    <button type="button" class="ui-button ui-button--secondary" on:click={downloadCameraDiagnostics}>
                        Kamera-Protokoll herunterladen
                    </button>
                </div>
            </SettingsSection>
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

    .stream-button { gap: 6px; }
    .stream-button.streaming { background: var(--color-brand-active); border-color: var(--color-brand-text); color: white; }

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

    .settings-section-body {
        display: grid;
        gap: var(--space-2);
        padding: 12px;
    }

    .diagnostic-summary {
        margin: 0;
        color: var(--color-text-secondary);
        font-size: 12px;
    }

    .fixture-summary {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-background);
    }

    .fixture-summary > div {
        display: grid;
        flex: 1;
        gap: var(--space-1);
        min-width: 0;
        overflow-wrap: anywhere;
    }

    .fixture-summary strong { font-size: 13px; }
    .fixture-summary span { color: var(--color-text-secondary); font-size: 12px; }
    .fixture-summary .ui-icon-button { flex: none; }

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
