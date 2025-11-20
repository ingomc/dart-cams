<script>
	import { onMount, onDestroy } from 'svelte';

	// Zustand für verfügbare Geräte und ausgewählte IDs
	let videoDevices = [];
	let selectedCam1 = '';
	let selectedCam2 = '';
	
	// URL für das 2K Live Scoring (hier anpassbar oder fest hinterlegt)
	let scoringUrl = 'https://www.2k-dart-software.com/'; 

	// Referenzen zu den HTML Video Elementen
	let videoElem1;
	let videoElem2;

	// Layout State
	let topHeight = 50; // in %
	let leftWidth = 50; // in %
	let isDraggingVertical = false;
	let isDraggingHorizontal = false;

	onMount(() => {
		getDevices();
		// Event Listener, falls Kameras während der Laufzeit eingesteckt werden
		navigator.mediaDevices.ondevicechange = getDevices;

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		}
	});

	// Funktion zum Abrufen aller Video-Inputs
	async function getDevices() {
		try {
			// Erstmalige Erlaubnis anfragen, damit wir Labels (Namen) der Cams sehen
			await navigator.mediaDevices.getUserMedia({ video: true });
			
			const devices = await navigator.mediaDevices.enumerateDevices();
			videoDevices = devices.filter(device => device.kind === 'videoinput');
			
			// Auto-Select: Wenn Cams da sind, wähle die ersten beiden standardmäßig aus
			if (videoDevices.length > 0 && !selectedCam1) selectedCam1 = videoDevices[0].deviceId;
			if (videoDevices.length > 1 && !selectedCam2) selectedCam2 = videoDevices[1].deviceId;
		} catch (err) {
			console.error("Fehler beim Zugriff auf Kameras:", err);
			alert("Kamerazugriff verweigert oder nicht möglich.");
		}
	}

	// Funktion, um den Stream zu starten
	async function startStream(deviceId, videoElement) {
		if (!deviceId || !videoElement) return;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { deviceId: { exact: deviceId }, width: 1280, height: 720 } // HD Auflösung anfordern
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

	function handleMouseMove(e) {
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

	// Svelte Reaktivität: Wenn sich die Auswahl ändert, Stream neu starten
	$: if (selectedCam1 && videoElem1) startStream(selectedCam1, videoElem1);
	$: if (selectedCam2 && videoElem2) startStream(selectedCam2, videoElem2);
</script>

<main class="container" class:dragging={isDraggingVertical || isDraggingHorizontal}>
	<!-- OBERER BEREICH: KAMERAS -->
	<div class="camera-section" style="height: {topHeight}%;">
		
		<!-- Kamera 1 -->
		<div class="cam-container" style="width: {leftWidth}%;">
			<div class="controls">
				<label for="cam1">Kamera 1 (Board):</label>
				<select id="cam1" bind:value={selectedCam1}>
					{#each videoDevices as device}
						<option value={device.deviceId}>{device.label || 'Kamera ' + device.deviceId}</option>
					{/each}
				</select>
			</div>
			<div class="video-wrapper">
				<!-- svelte-ignore a11y-media-has-caption -->
				<video bind:this={videoElem1} autoplay playsinline muted></video>
			</div>
		</div>

		<!-- Horizontal Resizer (zwischen den Kameras) -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="resizer-horizontal" on:mousedown={startHorizontalDrag}></div>

		<!-- Kamera 2 -->
		<div class="cam-container" style="flex: 1;">
			<div class="controls">
				<label for="cam2">Kamera 2 (Spieler/Split):</label>
				<select id="cam2" bind:value={selectedCam2}>
					{#each videoDevices as device}
						<option value={device.deviceId}>{device.label || 'Kamera ' + device.deviceId}</option>
					{/each}
				</select>
			</div>
			<div class="video-wrapper">
				<!-- svelte-ignore a11y-media-has-caption -->
				<video bind:this={videoElem2} autoplay playsinline muted></video>
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
		<div class="iframe-controls">
			<label for="url">Scoring URL:</label>
			<input type="text" bind:value={scoringUrl} placeholder="https://..." />
		</div>
		<iframe src={scoringUrl} title="Live Scoring" frameborder="0"></iframe>
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
		background: #333;
		display: flex;
		gap: 10px;
		align-items: center;
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
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: cover; /* Oder 'contain', wenn du schwarze Balken willst aber alles sehen musst */
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
		background: #333;
		display: flex;
		gap: 10px;
		align-items: center;
		font-size: 0.8rem;
	}
	
	.iframe-controls input {
		flex: 1;
		background: #222;
		border: 1px solid #444;
		color: white;
		padding: 2px 5px;
	}

	iframe {
		width: 100%;
		flex: 1;
		background: white; /* Dartsoftware ist meist hell */
	}
</style>