<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { base } from "$app/paths";
	import FloatingWebcam from "$lib/FloatingWebcam.svelte";

	interface CamSetting {
		scale: number;
		scaleX: number;
		scaleY: number;
		rotate: number;
		x: number;
		y: number;
		perspective: number;
		rotateX: number;
		rotateY: number;
		skewX: number;
		skewY: number;
		maskVisible: boolean;
		maskRadius: number;
		maskFeather: number;
	}

	interface CamSettings {
		cam1: CamSetting;
		cam2: CamSetting;
		[key: string]: CamSetting; // Allow indexing by string
	}

	// Zustand für verfügbare Geräte und ausgewählte IDs
	let videoDevices: MediaDeviceInfo[] = [];
	let selectedCam1 = "";
	let selectedCam2 = "";
	let cam1Label = "Heim";
	let cam2Label = "Gast";
	let showFloatingWebcam = false;

	// Toggle States for Control Bars
	let showCam1Controls = false;
	let showCam2Controls = false;
	let showIframeControls = false;

	// URL für das 2K Live Scoring (hier anpassbar oder fest hinterlegt)
	let scoringUrl =
		"https://www.2k-dart-software.com/frontend/events/5/mandant/1744";

	// Referenzen zu den HTML Video Elementen
	let videoElem1: HTMLVideoElement;
	let videoElem2: HTMLVideoElement;

	// Layout State
	let topHeight = 50; // in %
	let leftWidth = 50; // in %
	let isDraggingVertical = false;
	let isDraggingHorizontal = false;

	// Iframe Settings
	let cropTop = 0; // Pixel, die oben abgeschnitten werden sollen
	let cropBottom = 0; // Pixel, die unten abgeschnitten werden sollen
	let iframeZoom = 1; // Zoom-Faktor für das Iframe

	// Camera Transform Settings
	const defaultCamSettings: CamSetting = {
		scale: 1,
		scaleX: 1,
		scaleY: 1,
		rotate: 0,
		x: 0,
		y: 0,
		perspective: 1000,
		rotateX: 0,
		rotateY: 0,
		skewX: 0,
		skewY: 0,
		maskVisible: false,
		maskRadius: 45,
		maskFeather: 15,
	};

	let camSettings: CamSettings = {
		cam1: { ...defaultCamSettings },
		cam2: { ...defaultCamSettings },
	};

	let savedSettings: Record<string, CamSetting> = {};
	let isLoadingSettings = { cam1: false, cam2: false };

	let editingCam: "cam1" | "cam2" | null = null; // 'cam1' oder 'cam2' oder null
	let editVideoSource: MediaProvider | null = null; // Stream für das Modal

	// Referenzen zu den HTML Video Elementen

	onMount(() => {
		// Load saved settings from localStorage
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
		// Event Listener, falls Kameras während der Laufzeit eingesteckt werden
		navigator.mediaDevices.ondevicechange = getDevices;

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	});

	onDestroy(() => {
		if (typeof window !== "undefined") {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		}
	});

	// Funktion zum Abrufen aller Video-Inputs
	async function getDevices() {
		try {
			// Erstmalige Erlaubnis anfragen, damit wir Labels (Namen) der Cams sehen
			await navigator.mediaDevices.getUserMedia({ video: true });

			const devices = await navigator.mediaDevices.enumerateDevices();
			videoDevices = devices.filter(
				(device) => device.kind === "videoinput",
			);

			// Auto-Select: Wenn Cams da sind, wähle die ersten beiden standardmäßig aus
			if (videoDevices.length > 0 && !selectedCam1)
				selectedCam1 = videoDevices[0].deviceId;
			if (videoDevices.length > 1 && !selectedCam2)
				selectedCam2 = videoDevices[1].deviceId;
		} catch (err) {
			console.error("Fehler beim Zugriff auf Kameras:", err);
			alert("Kamerazugriff verweigert oder nicht möglich.");
		}
	}

	// Funktion, um den Stream zu starten
	async function startStream(
		deviceId: string,
		videoElement: HTMLVideoElement,
	) {
		if (!deviceId || !videoElement) return;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					deviceId: { exact: deviceId },
					width: 1280,
					height: 720,
				}, // HD Auflösung anfordern
			});
			videoElement.srcObject = stream;
		} catch (err) {
			console.error("Fehler beim Starten des Streams:", err);
		}
	}

	// Drag Handler Logic
	function startVerticalDrag() {
		isDraggingVertical = true;
	}

	function startHorizontalDrag() {
		isDraggingHorizontal = true;
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDraggingVertical) {
			const h = (e.clientY / window.innerHeight) * 100;
			if (h > 10 && h < 90) topHeight = h;
		}
		if (isDraggingHorizontal) {
			const w = (e.clientX / window.innerWidth) * 100;
			if (w > 10 && w < 90) leftWidth = w;
		}
	}

	function handleMouseUp() {
		isDraggingVertical = false;
		isDraggingHorizontal = false;
	}

	function openSettings(camId: "cam1" | "cam2") {
		editingCam = camId;
		// Wir nutzen den gleichen Stream wie im Hauptfenster
		if (camId === "cam1" && videoElem1)
			editVideoSource = videoElem1.srcObject;
		if (camId === "cam2" && videoElem2)
			editVideoSource = videoElem2.srcObject;
	}

	function closeSettings() {
		editingCam = null;
		editVideoSource = null;
	}

	function getTransformStyle(settings: CamSetting) {
		const persp =
			settings.perspective > 0
				? `perspective(${settings.perspective}px)`
				: "";
		// Wir kombinieren den Master-Scale mit den individuellen Achsen-Scales
		const sx = settings.scale * (settings.scaleX || 1);
		const sy = settings.scale * (settings.scaleY || 1);

		// WICHTIG: Reihenfolge der Transformationen!
		// 1. Translate (Verschieben im Screen-Koordinatensystem)
		// 2. Rotate (Drehen um den neuen Mittelpunkt)
		// 3. Scale (Skalieren der Achsen)
		// 4. 3D Rotations (Tilt)

		return `transform: 
			${persp}
			translate(${settings.x}px, ${settings.y}px)
			rotate(${settings.rotate}deg) 
			scale(${sx}, ${sy}) 
			rotateX(${settings.rotateX}deg)
			rotateY(${settings.rotateY}deg)
			skew(${settings.skewX}deg, ${settings.skewY}deg);`;
	}

	function getMaskStyle(settings: CamSetting) {
		if (!settings.maskVisible) return "";
		const r = settings.maskRadius;
		const f = settings.maskFeather;
		const gradient = `radial-gradient(circle at center, black ${r}%, transparent ${r + f}%)`;
		return `-webkit-mask-image: ${gradient}; mask-image: ${gradient};`;
	}

	function srcObject(node: HTMLVideoElement, stream: MediaProvider | null) {
		node.srcObject = stream;
		return {
			update(newStream: MediaProvider | null) {
				node.srcObject = newStream;
			},
		};
	}

	function loadSettings(slot: "cam1" | "cam2", deviceId: string) {
		if (!deviceId) return;
		isLoadingSettings[slot] = true;

		if (savedSettings[deviceId]) {
			console.log(`Loading settings for ${slot} (${deviceId})`);
			camSettings[slot] = { ...savedSettings[deviceId] };
		} else {
			console.log(
				`No saved settings for ${slot} (${deviceId}), using defaults`,
			);
			camSettings[slot] = { ...defaultCamSettings };
		}

		// Allow UI to update before enabling save again
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

		// Deep check if settings are actually different from saved to avoid spamming (optional but good)
		// For now, just save.
		savedSettings[deviceId] = { ...settings };
		localStorage.setItem("dartCamSettings", JSON.stringify(savedSettings));
		// console.log(`Saved settings for ${deviceId}`);
	}

	// Svelte Reaktivität: Wenn sich die Auswahl ändert, Stream neu starten
	$: if (selectedCam1 && videoElem1) {
		startStream(selectedCam1, videoElem1);
		loadSettings("cam1", selectedCam1);
	}
	$: if (selectedCam2 && videoElem2) {
		startStream(selectedCam2, videoElem2);
		loadSettings("cam2", selectedCam2);
	}

	// Auto-Save when settings change
	$: if (selectedCam1 && camSettings.cam1)
		saveSettings("cam1", selectedCam1, camSettings.cam1);
	$: if (selectedCam2 && camSettings.cam2)
		saveSettings("cam2", selectedCam2, camSettings.cam2);

	// Auto-Save Labels
	$: {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(
				"dartCamLabels",
				JSON.stringify({ cam1: cam1Label, cam2: cam2Label }),
			);
		}
	}
</script>

<main
	class="container"
	class:dragging={isDraggingVertical || isDraggingHorizontal}
>
	<!-- OBERER BEREICH: KAMERAS -->
	<div class="camera-section" style="height: {topHeight}%;">
		<!-- Kamera 1 -->
		<div class="cam-container" style="width: {leftWidth}%;">
			<div class="controls" class:visible={showCam1Controls}>
				<label for="cam1">Kamera 1:</label>
				<select id="cam1" bind:value={selectedCam1}>
					{#each videoDevices as device}
						<option value={device.deviceId}
							>{device.label || "Kamera"} ({device.deviceId.slice(
								0,
								8,
							)}...)</option
						>
					{/each}
				</select>
				<button
					class="settings-btn"
					on:click={() => openSettings("cam1")}
					title="Einstellungen"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><circle cx="12" cy="12" r="3"></circle><path
							d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
						></path></svg
					>
				</button>
				<button
					class="toggle-bar-btn"
					on:click={() => (showCam1Controls = !showCam1Controls)}
					title={showCam1Controls ? "Ausblenden" : "Einblenden"}
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
						style="transform: rotate({showCam1Controls
							? 180
							: 0}deg); transition: transform 0.3s;"
						><polyline points="6 9 12 15 18 9"></polyline></svg
					>
				</button>
			</div>
			<div class="video-wrapper" style={getMaskStyle(camSettings.cam1)}>
				<!-- svelte-ignore a11y-media-has-caption -->
				<video
					bind:this={videoElem1}
					autoplay
					playsinline
					muted
					style={getTransformStyle(camSettings.cam1)}
				></video>
			</div>
			<div class="cam-label left">
				<input type="text" bind:value={cam1Label} />
			</div>
		</div>

		<!-- Horizontal Resizer (zwischen den Kameras) -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="resizer-horizontal"
			on:mousedown={startHorizontalDrag}
		></div>

		<!-- Kamera 2 -->
		<div class="cam-container" style="width: {100 - leftWidth}%;">
			<div class="controls" class:visible={showCam2Controls}>
				<label for="cam2">Kamera 2:</label>
				<select id="cam2" bind:value={selectedCam2}>
					{#each videoDevices as device}
						<option value={device.deviceId}
							>{device.label || "Kamera"} ({device.deviceId.slice(
								0,
								8,
							)}...)</option
						>
					{/each}
				</select>
				<button
					class="settings-btn"
					on:click={() => openSettings("cam2")}
					title="Einstellungen"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><circle cx="12" cy="12" r="3"></circle><path
							d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
						></path></svg
					>
				</button>
				<button
					class="toggle-bar-btn"
					on:click={() => (showCam2Controls = !showCam2Controls)}
					title={showCam2Controls ? "Ausblenden" : "Einblenden"}
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
						style="transform: rotate({showCam2Controls
							? 180
							: 0}deg); transition: transform 0.3s;"
						><polyline points="6 9 12 15 18 9"></polyline></svg
					>
				</button>
			</div>
			<div class="video-wrapper" style={getMaskStyle(camSettings.cam2)}>
				<!-- svelte-ignore a11y-media-has-caption -->
				<video
					bind:this={videoElem2}
					autoplay
					playsinline
					muted
					style={getTransformStyle(camSettings.cam2)}
				></video>
			</div>
			<div class="cam-label right">
				<input type="text" bind:value={cam2Label} />
			</div>
		</div>
	</div>

	<!-- Vertical Resizer (zwischen Kameras und Iframe) -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="resizer-vertical" on:mousedown={startVerticalDrag}></div>

	<!-- UNTERER BEREICH: 2K DART SOFTWARE IFRAME -->
	<div class="iframe-section" style="flex: 1;">
		<!-- Overlay to prevent iframe from capturing mouse events during drag -->
		{#if isDraggingVertical || isDraggingHorizontal}
			<div class="iframe-overlay"></div>
		{/if}
		<div class="iframe-controls" class:visible={showIframeControls}>
			<label for="url">Scoring URL:</label>
			<input
				type="text"
				id="url"
				bind:value={scoringUrl}
				placeholder="https://..."
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

	<!-- SETTINGS MODAL -->
	{#if editingCam}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal-backdrop" on:click={closeSettings}>
			<div class="modal-content" on:click|stopPropagation>
				<div class="modal-header">
					<h2>
						Einstellungen {editingCam === "cam1"
							? "Kamera 1"
							: "Kamera 2"}
					</h2>
					<button class="close-btn" on:click={closeSettings}
						>&times;</button
					>
				</div>

				<div class="modal-body">
					<div
						class="preview-container"
						style={getMaskStyle(camSettings[editingCam])}
					>
						<!-- svelte-ignore a11y-media-has-caption -->
						<video
							use:srcObject={editVideoSource}
							autoplay
							playsinline
							muted
							style={getTransformStyle(camSettings[editingCam])}
						></video>
						<!-- Hilfskreis für Dartboard -->
						<div class="guide-circle"></div>
					</div>

					<div class="controls-panel">
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label
								>Scale ({camSettings[editingCam].scale})</label
							>
							<input
								type="range"
								min="0.5"
								max="3"
								step="0.01"
								bind:value={camSettings[editingCam].scale}
							/>
						</div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label
								>Scale X ({camSettings[editingCam]
									.scaleX})</label
							>
							<input
								type="range"
								min="0.5"
								max="3"
								step="0.01"
								bind:value={camSettings[editingCam].scaleX}
							/>
						</div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label
								>Scale Y ({camSettings[editingCam]
									.scaleY})</label
							>
							<input
								type="range"
								min="0.5"
								max="3"
								step="0.01"
								bind:value={camSettings[editingCam].scaleY}
							/>
						</div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label
								>Rotate Z ({camSettings[editingCam]
									.rotate}°)</label
							>
							<input
								type="range"
								min="-180"
								max="180"
								step="1"
								bind:value={camSettings[editingCam].rotate}
							/>
						</div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label>Move X ({camSettings[editingCam].x}px)</label
							>
							<input
								type="range"
								min="-500"
								max="500"
								step="1"
								bind:value={camSettings[editingCam].x}
							/>
						</div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label>Move Y ({camSettings[editingCam].y}px)</label
							>
							<input
								type="range"
								min="-500"
								max="500"
								step="1"
								bind:value={camSettings[editingCam].y}
							/>
						</div>

						<hr />

						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label
								>Perspective ({camSettings[editingCam]
									.perspective}px)</label
							>
							<input
								type="range"
								min="0"
								max="2000"
								step="10"
								bind:value={camSettings[editingCam].perspective}
							/>
							<small
								>(0 = aus, kleine Werte = starker 3D Effekt)</small
							>
						</div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label
								>Rotate X (Tilt Up/Down) ({camSettings[
									editingCam
								].rotateX}°)</label
							>
							<input
								type="range"
								min="-80"
								max="80"
								step="1"
								bind:value={camSettings[editingCam].rotateX}
							/>
						</div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label
								>Rotate Y (Tilt Left/Right) ({camSettings[
									editingCam
								].rotateY}°)</label
							>
							<input
								type="range"
								min="-80"
								max="80"
								step="1"
								bind:value={camSettings[editingCam].rotateY}
							/>
						</div>

						<hr />

						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label
								>Skew X ({camSettings[editingCam]
									.skewX}°)</label
							>
							<input
								type="range"
								min="-60"
								max="60"
								step="1"
								bind:value={camSettings[editingCam].skewX}
							/>
						</div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<div class="control-group">
							<label
								>Skew Y ({camSettings[editingCam]
									.skewY}°)</label
							>
							<input
								type="range"
								min="-60"
								max="60"
								step="1"
								bind:value={camSettings[editingCam].skewY}
							/>
						</div>

						<hr />

						<div class="control-group">
							<label
								style="display: flex; align-items: center; gap: 10px; cursor: pointer;"
							>
								<input
									type="checkbox"
									bind:checked={
										camSettings[editingCam].maskVisible
									}
									style="width: auto;"
								/>
								<span>Runde Maske aktivieren</span>
							</label>
						</div>

						{#if camSettings[editingCam].maskVisible}
							<!-- svelte-ignore a11y-label-has-associated-control -->
							<div class="control-group">
								<label
									>Mask Radius ({camSettings[editingCam]
										.maskRadius}%)</label
								>
								<input
									type="range"
									min="10"
									max="100"
									step="1"
									bind:value={
										camSettings[editingCam].maskRadius
									}
								/>
							</div>
							<!-- svelte-ignore a11y-label-has-associated-control -->
							<div class="control-group">
								<label
									>Mask Feather ({camSettings[editingCam]
										.maskFeather}%)</label
								>
								<input
									type="range"
									min="0"
									max="50"
									step="1"
									bind:value={
										camSettings[editingCam].maskFeather
									}
								/>
							</div>
						{/if}

						<button
							class="reset-btn"
							on:click={() => {
								if (editingCam)
									camSettings[editingCam] = {
										...defaultCamSettings,
									};
							}}>Reset</button
						>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<FloatingWebcam bind:visible={showFloatingWebcam} {videoDevices} />
</main>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background-color: #1a1a1a;
		color: white;
		font-family: sans-serif;
		height: 100vh;
		overflow: hidden; /* Kein Scrollen der Hauptseite */
	}

	.container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100vw;
	}

	.container.dragging {
		user-select: none; /* Textauswahl verhindern beim Ziehen */
		cursor: grabbing;
	}

	/* --- Kamera Styles --- */
	.camera-section {
		display: flex;
		/* gap: 10px;  Entfernt, da wir jetzt den Resizer dazwischen haben */
		padding: 5px;
		background-color: #222;
		box-sizing: border-box;
		min-height: 10%;
		max-height: 90%;
	}

	.cam-container {
		display: flex;
		flex-direction: column;
		background: black;
		border-radius: 4px;
		overflow: hidden;
		position: relative;
		min-width: 10%;
	}

	.controls {
		padding: 5px;
		background: rgba(51, 51, 51, 0.9);
		display: flex;
		gap: 10px;
		align-items: center;
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		z-index: 10;
		transform: translateY(-100%);
		transition: transform 0.3s ease-in-out;
		box-sizing: border-box;
	}

	.controls.visible {
		transform: translateY(0);
	}

	select {
		flex: 1;
		padding: 4px;
		background: #444;
		color: white;
		border: 1px solid #555;
	}

	.video-wrapper {
		flex: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		overflow: hidden;
		position: relative; /* Für Settings Button */
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: contain; /* Oder 'contain', wenn du schwarze Balken willst aber alles sehen musst */
		transform-origin: center center;
	}

	.cam-label {
		position: absolute;
		bottom: 10px;
		background: rgba(0, 0, 0, 0.6);
		padding: 5px 10px;
		border-radius: 4px;
		z-index: 20;
	}

	.cam-label.left {
		left: 10px;
	}

	.cam-label.right {
		right: 10px;
	}

	.cam-label input {
		background: transparent;
		border: none;
		color: white;
		font-size: 1.2rem;
		font-weight: bold;
		width: 100px; /* Breite anpassen oder auto lassen */
		text-align: center;
		outline: none;
	}

	.cam-label input:focus {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
	}

	.settings-btn {
		background: none;
		border: none;
		color: #aaa;
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-left: 5px;
	}

	.settings-btn:hover {
		color: white;
		background: #444;
		border-radius: 4px;
	}

	/* --- Modal Styles --- */
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
		object-fit: contain; /* Im Modal wollen wir alles sehen */
		position: absolute;
		top: 0;
		left: 0;
	}

	.guide-circle {
		position: absolute;
		width: 340px; /* Ungefähre Größe eines Dartboards auf dem Screen */
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

	.reset-btn:hover {
		background: #b71c1c;
	}

	/* --- Resizers --- */
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

	/* --- Iframe Styles --- */
	.iframe-section {
		display: flex;
		flex-direction: column;
		position: relative;
		min-height: 10%;
		overflow: hidden;
	}

	.iframe-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 100; /* Über dem Iframe */
		background: transparent;
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
		overflow: hidden; /* Wichtig, damit der abgeschnittene Teil nicht sichtbar ist */
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
		/* height wird inline gesetzt */
		background: white; /* Dartsoftware ist meist hell */
		border: none;
	}
</style>
