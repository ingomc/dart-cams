<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import CameraView from "$lib/components/CameraView.svelte";
	import SettingsModal from "$lib/components/SettingsModal.svelte";
	import IframeSection from "$lib/components/IframeSection.svelte";
	import { defaultCamSettings } from "$lib/constants";
	import type { CamSettings, CamSetting, MatchData } from "$lib/types";

	// Zustand für verfügbare Geräte und ausgewählte IDs
	let videoDevices: MediaDeviceInfo[] = [];
	let selectedCam1 = "";
	let selectedCam2 = "";
	let cam1Label = "Heim";
	let cam2Label = "Gast";
	let showFloatingWebcam = false;

	// URL für das 2K Live Scoring
	let scoringUrl =
		"https://www.2k-dart-software.com/frontend/events/5/mandant/1744";

	// Referenzen zu den HTML Video Elementen (gebunden aus CameraView)
	let videoElem1: HTMLVideoElement;
	let videoElem2: HTMLVideoElement;
	let container1: HTMLElement;
	let container2: HTMLElement;

	// Layout State
	let topHeight = 50; // in %
	let leftWidth = 50; // in %
	let isDraggingVertical = false;
	let isDraggingHorizontal = false;
	let showIframe = true;

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
	let editVideoSource: MediaProvider | null = null;

	// WebSocket State
	let ws: WebSocket | null = null;
	let wsMessage: string | null = "Kein WebSocket";
	let wsUrl = "";

	let matches: MatchData["match"][] = [];
	let databaseId = "";
	let groupKey = "";

	// Scoreboard State per Camera
	let cam1BoardKey = "";
	let cam2BoardKey = "";

	// Scoreboard Positions (Percent)
	let cam1ScorePos = { x: 50, y: 10 };
	let cam2ScorePos = { x: 50, y: 10 };

	let isDraggingScore1 = false;
	let isDraggingScore2 = false;

	// Reaktivität: Wenn Scoring URL sich ändert, Matches laden
	$: if (scoringUrl) {
		const match = scoringUrl.match(/event\/(\d+)\/(\d+)/);
		if (match) {
			databaseId = match[1];
			groupKey = match[2];
			fetchMatches();

			// Automatisch WS URL setzen
			const baseUrl =
				"wss://live-backend.2k-dart-software.com/dartsscorer-liveticker/api/v1/websocket";
			const serverId = Math.floor(Math.random() * 1000)
				.toString()
				.padStart(3, "0");
			const sessionId = Math.random().toString(36).substring(2, 10);
			const newWsUrl = `${baseUrl}/${serverId}/${sessionId}/websocket`;

			if (wsUrl !== newWsUrl) {
				wsUrl = newWsUrl;
			}
		}
	}

	// Reaktivität: Wenn wsUrl oder IDs sich ändern, verbinden
	$: if (wsUrl && databaseId && groupKey) {
		connectWs(wsUrl);
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

		if (isDraggingScore1 && container1) {
			const rect = container1.getBoundingClientRect();
			const x = ((clientX - rect.left) / rect.width) * 100;
			const y = ((clientY - rect.top) / rect.height) * 100;
			cam1ScorePos = {
				x: Math.max(0, Math.min(100, x)),
				y: Math.max(0, Math.min(100, y)),
			};
		}

		if (isDraggingScore2 && container2) {
			const rect = container2.getBoundingClientRect();
			const x = ((clientX - rect.left) / rect.width) * 100;
			const y = ((clientY - rect.top) / rect.height) * 100;
			cam2ScorePos = {
				x: Math.max(0, Math.min(100, x)),
				y: Math.max(0, Math.min(100, y)),
			};
		}
	}

	function handleScoreEnd() {
		isDraggingScore1 = false;
		isDraggingScore2 = false;
	}

	async function fetchMatches() {
		if (!databaseId || !groupKey) return;
		try {
			const res = await fetch(
				`https://live-backend.2k-dart-software.com/dartsscorer-liveticker/api/v1/match/${databaseId}/0/${groupKey}`,
			);
			const json = await res.json();
			if (json && json.data) {
				matches = json.data;
			}
		} catch (e) {
			console.error("Fehler beim Laden der Matches:", e);
		}
	}

	function connectWs(url: string) {
		if (ws) {
			ws.close();
		}
		try {
			console.log("Verbinde zu WebSocket:", url);
			ws = new WebSocket(url);

			ws.onopen = () => {
				wsMessage = "Verbunden. Abonniere...";
				ws?.send(
					'["CONNECT\\naccept-version:1.1,1.0\\nheart-beat:10000,10000\\n\\n\\u0000"]',
				);
			};

			ws.onmessage = (event) => {
				const data = event.data;
				if (data === 'a["\\n"]') return;

				if (typeof data === "string" && data.startsWith('a["')) {
					try {
						const inner = JSON.parse(data.substring(1));
						if (Array.isArray(inner) && inner.length > 0) {
							const stompMessage = inner[0];

							if (stompMessage.startsWith("CONNECTED")) {
								wsMessage = "Verbunden. Warte auf Daten...";
								const topic = `/topic/${databaseId}-${groupKey}`;
								const subId = "sub-0";
								const subFrame = `["SUBSCRIBE\\nid:${subId}\\ndestination:${topic}\\n\\n\\u0000"]`;
								ws?.send(subFrame);
								return;
							}

							const bodyStart = stompMessage.indexOf("\n\n");
							if (bodyStart !== -1) {
								let jsonStr = stompMessage.substring(
									bodyStart + 2,
								);
								if (jsonStr.endsWith("\u0000")) {
									jsonStr = jsonStr.substring(
										0,
										jsonStr.length - 1,
									);
								}
								const parsed = JSON.parse(jsonStr);

								if (parsed && parsed.match) {
									const idx = matches.findIndex(
										(m) =>
											m.matchKey ===
											parsed.match.matchKey,
									);
									if (idx !== -1) {
										matches[idx] = parsed.match;
									}
								}
							}
						}
					} catch (e) {
						console.error("Parse error:", e);
					}
				}
			};

			ws.onerror = (error) => {
				console.error("WebSocket Fehler:", error);
				wsMessage = "Fehler bei Verbindung";
			};

			ws.onclose = () => {
				wsMessage = "Verbindung getrennt";
			};
		} catch (e) {
			console.error("Konnte WebSocket nicht erstellen:", e);
			wsMessage = "Ungültige URL";
		}
	}

	onMount(() => {
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
		navigator.mediaDevices.ondevicechange = getDevices;

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
		if (typeof window !== "undefined") {
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
		try {
			await navigator.mediaDevices.getUserMedia({ video: true });
			const devices = await navigator.mediaDevices.enumerateDevices();
			videoDevices = devices.filter(
				(device) => device.kind === "videoinput",
			);

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
			} else if (videoDevices.length > 0 && !selectedCam1) {
				selectedCam1 = videoDevices[0].deviceId;
			}

			if (
				savedCam2 &&
				videoDevices.some((d) => d.deviceId === savedCam2)
			) {
				selectedCam2 = savedCam2;
			} else if (videoDevices.length > 1 && !selectedCam2) {
				selectedCam2 = videoDevices[1].deviceId;
			}
		} catch (err) {
			console.error("Fehler beim Zugriff auf Kameras:", err);
			alert("Kamerazugriff verweigert oder nicht möglich.");
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
			const h = (clientY / window.innerHeight) * 100;
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

	function openSettings(camId: "cam1" | "cam2") {
		editingCam = camId;
		if (camId === "cam1" && videoElem1)
			editVideoSource = videoElem1.srcObject;
		if (camId === "cam2" && videoElem2)
			editVideoSource = videoElem2.srcObject;
	}

	function closeSettings() {
		editingCam = null;
		editVideoSource = null;
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
			bind:selectedDeviceId={selectedCam1}
			bind:label={cam1Label}
			bind:videoElement={videoElem1}
			bind:containerElement={container1}
			bind:boardKey={cam1BoardKey}
			bind:scorePos={cam1ScorePos}
			{videoDevices}
			{matches}
			on:openSettings={() => openSettings("cam1")}
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
			bind:selectedDeviceId={selectedCam2}
			bind:label={cam2Label}
			bind:videoElement={videoElem2}
			bind:containerElement={container2}
			bind:boardKey={cam2BoardKey}
			bind:scorePos={cam2ScorePos}
			{videoDevices}
			{matches}
			on:openSettings={() => openSettings("cam2")}
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
		bind:scoringUrl
		bind:wsUrl
		bind:cropTop
		bind:cropBottom
		bind:iframeZoom
		bind:showFloatingWebcam
		bind:showIframe
		{matches}
		{videoDevices}
	>
		<div slot="overlay">
			{#if isDraggingVertical || isDraggingHorizontal}
				<div class="iframe-overlay"></div>
			{/if}
		</div>
	</IframeSection>

	<!-- SETTINGS MODAL -->
	{#if editingCam}
		<SettingsModal
			{editingCam}
			bind:settings={camSettings[editingCam]}
			videoSource={editVideoSource}
			on:close={closeSettings}
		/>
	{/if}
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

	.camera-section {
		display: flex;
		padding: 5px;
		background-color: #222;
		box-sizing: border-box;
		min-height: 10%;
		max-height: 98%;
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
