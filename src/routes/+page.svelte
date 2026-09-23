<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import CameraView from "$lib/components/CameraView.svelte";
	import IframeSection from "$lib/components/IframeSection.svelte";
	import { defaultCamSettings } from "$lib/constants";
	import { LiveScoringClient, type ScoringStatus } from "$lib/liveScoring";
	import { parseScoringEventUrl, type LiveMatch } from "$lib/scoring";
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
	let topHeight = 50; // in %
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

	// Scoreboard Positions (Percent)
	let cam1ScorePos = { x: 50, y: 10 };
	let cam2ScorePos = { x: 50, y: 10 };

	let isDraggingScore1 = false;
	let isDraggingScore2 = false;

	const scoringStatusText: Record<ScoringStatus, string> = {
		idle: 'Kein Event verbunden',
		connecting: 'Verbinde…',
		live: 'Live verbunden',
		offline: 'Verbindung unterbrochen – letzter Stand',
		error: 'Scoring derzeit nicht erreichbar',
	};

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
		const x = Math.max(halfWidth, Math.min(rect.width - halfWidth, clientX - rect.left));
		const y = Math.max(0, Math.min(rect.height - height, clientY - rect.top));
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

<main
	class="container"
	class:dragging={isDraggingVertical || isDraggingHorizontal}
>
	{#if cameraError}
		<div class="camera-notice" role="alert">
			<span>{cameraError}</span>
			<button on:click={getDevices} disabled={checkingCameras}>Erneut versuchen</button>
		</div>
	{/if}
	<form class="scoring-bar" on:submit|preventDefault={() => activateScoringUrl(scoringUrlDraft)}>
		<label for="scoring-event-url">3K-Live-Event</label>
		<input id="scoring-event-url" type="text" inputmode="url" bind:value={scoringUrlDraft}
			placeholder="https://live.3k-darts.com/event/5/2995582" spellcheck="false" />
		<button type="submit">Verbinden</button>
		<span class="scoring-status" class:live={scoringStatus === 'live'}
			class:warning={scoringStatus === 'offline' || scoringStatus === 'error'} aria-live="polite">
			{scoringStatusText[scoringStatus]}{scoringUrl && matches.length ? ` · ${matches.length} Match${matches.length === 1 ? '' : 'es'}` : ''}
		</span>
		<button type="button" class="secondary-btn" disabled={!scoringUrl}
			on:click={() => (showIframe = !showIframe)}>{showIframe ? 'Live-Ansicht schließen' : 'Live-Ansicht öffnen'}</button>
		<button type="button" class="secondary-btn" on:click={() => (showFloatingWebcam = !showFloatingWebcam)}
			aria-pressed={showFloatingWebcam}>{showFloatingWebcam ? 'Webcam schließen' : 'Webcam öffnen'}</button>
	</form>
	{#if scoringError}<p class="scoring-error" role="alert">{scoringError}</p>{/if}
	<div class="content-area" bind:this={contentArea}>
	<!-- OBERER BEREICH: KAMERAS -->
	<div
		class="camera-section"
		style="height: {showIframe ? topHeight : 100}%;"
	>
		<!-- Kamera 1 -->
		<CameraView
			camId="cam1"
			width={leftWidth}
			bind:settings={camSettings.cam1}
			editLocked={editingCam !== null}
			bind:selectedDeviceId={selectedCam1}
			bind:label={cam1Label}
			bind:containerElement={container1}
			bind:boardKey={cam1BoardKey}
			bind:scorePos={cam1ScorePos}
			scoringStatus={scoringStatus}
			{videoDevices}
			{matches}
			on:boardChange={(event) => { cam1BoardKey = event.detail.board; saveBoardSelection(); }}
			on:editStart={() => (editingCam = "cam1")}
			on:editEnd={() => (editingCam = null)}
			on:scoreDragStart={(e) => startScoreDrag(1, e.detail.originalEvent)}
		/>

		<!-- Horizontal Resizer -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="resizer-horizontal"
			on:mousedown={startHorizontalDrag}
			on:touchstart={startHorizontalDrag}
		></div>

		<!-- Kamera 2 -->
		<CameraView
			camId="cam2"
			width={100 - leftWidth}
			bind:settings={camSettings.cam2}
			editLocked={editingCam !== null}
			bind:selectedDeviceId={selectedCam2}
			bind:label={cam2Label}
			bind:containerElement={container2}
			bind:boardKey={cam2BoardKey}
			bind:scorePos={cam2ScorePos}
			scoringStatus={scoringStatus}
			{videoDevices}
			{matches}
			on:boardChange={(event) => { cam2BoardKey = event.detail.board; saveBoardSelection(); }}
			on:editStart={() => (editingCam = "cam2")}
			on:editEnd={() => (editingCam = null)}
			on:scoreDragStart={(e) => startScoreDrag(2, e.detail.originalEvent)}
		/>
	</div>

	<!-- Vertical Resizer -->
	{#if showIframe}
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="resizer-vertical"
			on:mousedown={startVerticalDrag}
			on:touchstart={startVerticalDrag}
		></div>
	{/if}

	<!-- UNTERER BEREICH: IFRAME -->
	<IframeSection
		{scoringUrl}
		bind:cropTop
		bind:cropBottom
		bind:iframeZoom
		bind:showFloatingWebcam
		{showIframe}
		{videoDevices}
	>
		<div slot="overlay">
			{#if isDraggingVertical || isDraggingHorizontal}
				<div class="iframe-overlay"></div>
			{/if}
		</div>
	</IframeSection>
	</div>

</main>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background-color: #1a1a1a;
		color: white;
		font-family: sans-serif;
		height: 100vh;
		overflow: hidden;
	}

	.container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100vw;
	}

	.container.dragging {
		user-select: none;
		cursor: grabbing;
	}

	.scoring-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #292929;
		border-bottom: 1px solid #464646;
	}

	.scoring-bar label { font-weight: 700; white-space: nowrap; }
	.scoring-bar input {
		flex: 1 1 320px;
		min-width: 180px;
		min-height: 42px;
		box-sizing: border-box;
		padding: 8px 10px;
		background: #171717;
		border: 1px solid #666;
		border-radius: 6px;
		color: white;
	}
	.scoring-bar button {
		min-height: 42px;
		padding: 0 14px;
		border: 1px solid #2877b8;
		border-radius: 6px;
		background: #1262a0;
		color: white;
		font-weight: 700;
		cursor: pointer;
	}
	.scoring-bar button.secondary-btn { background: #3a3a3a; border-color: #666; }
	.scoring-bar button:disabled { opacity: 0.45; cursor: default; }
	.scoring-status { color: #d2d2d2; font-size: 0.85rem; white-space: nowrap; }
	.scoring-status.live { color: #82dda8; }
	.scoring-status.warning { color: #ffc17c; }
	.scoring-error { margin: 0; padding: 5px 10px; background: #542020; color: #fff; }
	.content-area { display: flex; flex: 1; flex-direction: column; min-height: 0; }

	.camera-notice {
		position: absolute;
		z-index: 200;
		left: 50%;
		top: 8px;
		transform: translateX(-50%);
		padding: 8px 12px;
		background: #542020;
		border: 1px solid #a94c4c;
		border-radius: 4px;
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.camera-section {
		display: flex;
		flex: none;
		padding: 5px;
		background-color: #222;
		box-sizing: border-box;
		min-height: 0;
		position: relative;
	}

	.resizer-vertical {
		height: 8px;
		background: #333;
		cursor: row-resize;
		display: flex;
		justify-content: center;
		align-items: center;
		border-top: 1px solid #444;
		border-bottom: 1px solid #444;
	}

	.resizer-vertical:hover {
		background: #555;
	}

	.resizer-horizontal {
		width: 8px;
		background: #333;
		cursor: col-resize;
		margin: 0 2px;
	}

	.resizer-horizontal:hover {
		background: #555;
	}

	.iframe-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 100;
		background: transparent;
	}
</style>
