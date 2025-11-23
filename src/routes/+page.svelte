<script>
	import { onMount, onDestroy } from 'svelte';
	import { base } from '$app/paths';
	import FloatingWebcam from '$lib/FloatingWebcam.svelte';

	// Zustand für verfügbare Geräte und ausgewählte IDs
	let videoDevices = [];
	let selectedCam1 = '';
	let selectedCam2 = '';
	let showFloatingWebcam = false;
	
	// URL für das 2K Live Scoring (hier anpassbar oder fest hinterlegt)
	let scoringUrl = 'https://www.2k-dart-software.com/frontend/events/5/mandant/1744'; 

	// Referenzen zu den HTML Video Elementen
	let videoElem1;
	let videoElem2;

	// Layout State
	let topHeight = 50; // in %
	let leftWidth = 50; // in %
	let isDraggingVertical = false;
	let isDraggingHorizontal = false;
	
	// Iframe Settings
	let cropTop = 0; // Pixel, die oben abgeschnitten werden sollen
	let cropBottom = 0; // Pixel, die unten abgeschnitten werden sollen
	let cssInjectionStatus = ''; // Statusmeldung für die UI
	
	// Camera Transform Settings
	let camSettings = {
		cam1: { scale: 1, scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0, perspective: 1000, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0, maskVisible: false, maskRadius: 45, maskFeather: 15 },
		cam2: { scale: 1, scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0, perspective: 1000, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0, maskVisible: false, maskRadius: 45, maskFeather: 15 }
	};
	
	let editingCam = null; // 'cam1' oder 'cam2' oder null
	let editVideoSource = null; // Stream für das Modal
	let cvReady = false;
	let debugCanvas; // Referenz zum Debug Canvas im Modal

	// Referenzen zu den HTML Video Elementen

	onMount(() => {
		getDevices();
		// Event Listener, falls Kameras während der Laufzeit eingesteckt werden
		navigator.mediaDevices.ondevicechange = getDevices;

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);

		// Check if OpenCV is already loaded
		if (window.cv && window.cv.Mat) {
			cvReady = true;
		} else {
			window.onOpenCvReady = () => {
				console.log('OpenCV.js is ready');
				cvReady = true;
			};
		}
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

	// Versucht, CSS in das Iframe zu injizieren
	async function injectIframeCss() {
		cssInjectionStatus = 'Versuche CSS zu laden...';
		try {
			const iframe = document.querySelector('iframe');
			// Der Zugriff auf contentDocument wirft einen Fehler bei Cross-Origin
			if (iframe && iframe.contentDocument) {
				// CSS aus der Datei laden
				const res = await fetch(`${base}/iframe.css`);
				if (!res.ok) throw new Error('CSS file not found');
				const css = await res.text();

				const style = iframe.contentDocument.createElement('style');
				style.textContent = css;
				iframe.contentDocument.head.appendChild(style);
				console.log('Custom CSS erfolgreich in Iframe geladen.');
				cssInjectionStatus = '✅ CSS geladen';
			} else {
				throw new Error('Kein Zugriff auf Iframe Content (SOP)');
			}
		} catch (err) {
			console.warn('Konnte CSS nicht in Iframe injizieren:', err);
			cssInjectionStatus = '⚠️ CSS Blockiert (Browser-Sicherheit)';
		}
	}

	function openSettings(camId) {
		editingCam = camId;
		// Wir nutzen den gleichen Stream wie im Hauptfenster
		if (camId === 'cam1' && videoElem1) editVideoSource = videoElem1.srcObject;
		if (camId === 'cam2' && videoElem2) editVideoSource = videoElem2.srcObject;
	}

	function closeSettings() {
		editingCam = null;
		editVideoSource = null;
	}

	async function calibrateCamera(camId) {
		if (!cvReady) {
			alert("OpenCV lädt noch... bitte warten.");
			return;
		}
		
		const video = camId === 'cam1' ? videoElem1 : videoElem2;
		if (!video || !video.videoWidth) {
			alert("Video nicht bereit.");
			return;
		}

		try {
			const cv = window.cv;
			const width = video.videoWidth;
			const height = video.videoHeight;

			// Canvas erstellen
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(video, 0, 0, width, height);

			// OpenCV Processing
			const src = cv.imread(canvas);
			const gray = new cv.Mat();
			cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
			
			// Blur
			cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

			// Thresholding (Otsu)
			const binary = new cv.Mat();
			cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

			// Find Contours
			const contours = new cv.MatVector();
			const hierarchy = new cv.Mat();
			cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

			let ellipses = [];
			const minArea = width * height * 0.01; 

			// Debug Drawing Setup
			let debugCtx = null;
			if (debugCanvas) {
				debugCanvas.width = width;
				debugCanvas.height = height;
				debugCtx = debugCanvas.getContext('2d');
				debugCtx.clearRect(0, 0, width, height);
				debugCtx.lineWidth = 2;
			}

			// Alle potenziellen Ellipsen sammeln
			for (let i = 0; i < contours.size(); ++i) {
				const cnt = contours.get(i);
				const area = cv.contourArea(cnt);
				
				if (area < minArea) continue;
				if (cnt.rows < 5) continue;

				try {
					const ellipse = cv.fitEllipse(cnt);
					ellipses.push({ ellipse, area });
					
					// Debug: Zeichne alle Kandidaten in Blau
					if (debugCtx) {
						debugCtx.strokeStyle = 'rgba(0, 0, 255, 0.3)';
						debugCtx.beginPath();
						debugCtx.ellipse(ellipse.center.x, ellipse.center.y, ellipse.size.width / 2, ellipse.size.height / 2, ellipse.angle * Math.PI / 180, 0, 2 * Math.PI);
						debugCtx.stroke();
					}
				} catch(e) { }
			}

			// Sortieren nach Größe
			ellipses.sort((a, b) => b.area - a.area);

			let bestEllipse = ellipses.length > 0 ? ellipses[0].ellipse : null;
			
			// Ensemble Logic
			let avgWidth = 0;
			let avgHeight = 0;
			let count = 0;

			if (bestEllipse) {
				const centerX = bestEllipse.center.x;
				const centerY = bestEllipse.center.y;
				const tolerance = bestEllipse.size.width * 0.1;

				for (let item of ellipses) {
					const e = item.ellipse;
					const dx = Math.abs(e.center.x - centerX);
					const dy = Math.abs(e.center.y - centerY);

					if (dx < tolerance && dy < tolerance) {
						avgWidth += e.size.width;
						avgHeight += e.size.height;
						count++;
					}
				}
				
				if (count > 0) {
					bestEllipse.size.width = avgWidth / count;
					bestEllipse.size.height = avgHeight / count;
				}

				// Debug: Zeichne das finale Ergebnis in Grün
				if (debugCtx) {
					debugCtx.strokeStyle = '#00ff00';
					debugCtx.lineWidth = 4;
					debugCtx.beginPath();
					debugCtx.ellipse(bestEllipse.center.x, bestEllipse.center.y, bestEllipse.size.width / 2, bestEllipse.size.height / 2, bestEllipse.angle * Math.PI / 180, 0, 2 * Math.PI);
					debugCtx.stroke();
					
					// Zeichne Center
					debugCtx.fillStyle = 'red';
					debugCtx.beginPath();
					debugCtx.arc(bestEllipse.center.x, bestEllipse.center.y, 5, 0, 2 * Math.PI);
					debugCtx.fill();
				}
			}

			if (bestEllipse) {
				const s = camSettings[camId];
				
				// 1. Zentrieren
				// Da wir jetzt translate() VOR rotate() machen, ist x/y einfach die Distanz in Screen-Pixeln
				s.x = (width / 2) - bestEllipse.center.x;
				s.y = (height / 2) - bestEllipse.center.y;

				// 2. Rotation korrigieren
				// Wir drehen das Bild so, dass die Ellipse gerade steht.
				// OpenCV Angle ist oft der Winkel der ersten Achse.
				// Wir probieren, es einfach "gerade" zu drehen.
				// Wenn das Board z.B. 45 Grad gedreht ist, müssen wir -45 Grad drehen.
				s.rotate = -bestEllipse.angle;

				// 3. Aspect Ratio Korrektur
				// Jetzt wo es (hoffentlich) gerade steht, schauen wir uns Breite und Höhe an.
				// fitEllipse liefert width/height der Achsen.
				
				const axis1 = bestEllipse.size.width;
				const axis2 = bestEllipse.size.height;
				
				// Wir wissen nicht sicher, welche Achse welche ist nach der Rotation (hängt von OpenCV Version ab),
				// aber wir wollen einfach, dass BEIDE Achsen gleich lang werden (Kreis).
				// Wir nehmen die längere Achse als Zielgröße.
				
				const maxAxis = Math.max(axis1, axis2);
				const targetSize = height * 0.85; // 85% der Screen-Höhe
				
				// Master Scale setzt die Grundgröße
				s.scale = targetSize / maxAxis;
				
				// Nun die Feinjustierung der Achsen
				// Da wir um -angle gedreht haben, sollte axis1 jetzt X oder Y entsprechen?
				// Das ist tricky. Wir machen es pragmatisch:
				// Wir setzen Scale X und Y so, dass beide Achsen auf 'maxAxis' gestreckt werden.
				
				// Wenn wir annehmen, dass width -> X und height -> Y (im unrotierten System der Ellipse):
				s.scaleX = maxAxis / axis1;
				s.scaleY = maxAxis / axis2;
				
				// Reset 3D & Skew
				s.rotateX = 0;
				s.rotateY = 0;
				s.skewX = 0;
				s.skewY = 0;

				camSettings = camSettings;
				
				alert(`Board erkannt!\nZentriert: Ja\nRotation: ${Math.round(s.rotate)}°\nScale X: ${s.scaleX.toFixed(2)}\nScale Y: ${s.scaleY.toFixed(2)}\n\nFalls es noch "eiert", probiere manuell Scale X/Y nachzujustieren.`);
				
			} else {
				// Debug: Zeige was gesehen wurde, falls nichts erkannt wird
				console.log("Keine passende Ellipse gefunden. Anzahl Konturen:", contours.size());
				alert("Kein Dartboard erkannt. Versuche es mit besserem Licht oder Kontrast.");
			}

			// Cleanup
			src.delete(); gray.delete(); binary.delete(); contours.delete(); hierarchy.delete();
		} catch (err) {
			console.error(err);
			alert("Fehler bei der Erkennung: " + err.message);
		}
	}

	function simulateCamera(camId) {
		const img = new Image();
		img.crossOrigin = "Anonymous";
		// Lokales Testbild aus dem static Ordner
		img.src = `${base}/board-mock.jpeg`;
		
		img.onload = () => {
			const width = 1280;
			const height = 720;
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			
			// Hintergrund
			ctx.fillStyle = '#222';
			ctx.fillRect(0, 0, width, height);
			
			// Bild so skalieren, dass es den Canvas füllt (cover)
			const scale = Math.max(width / img.width, height / img.height);
			const x = (width / 2) - (img.width / 2) * scale;
			const y = (height / 2) - (img.height / 2) * scale;
			
			ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
			
			// Stream erstellen
			const stream = canvas.captureStream(30);
			
			// Video Element updaten
			const video = camId === 'cam1' ? videoElem1 : videoElem2;
			if (video) {
				video.srcObject = stream;
				video.play();
			}
			
			// Wenn wir gerade im Settings Modal sind, auch dort das Video updaten
			if (editingCam === camId) {
				editVideoSource = stream;
			}
			
			alert("Simulation geladen: Testbild füllt nun den Screen. Klicke jetzt auf 'Auto-Calibrate'.");
		};
		
		img.onerror = () => {
			alert("Konnte Testbild 'board-mock.jpeg' nicht laden.");
		};
	}

	function getTransformStyle(settings) {
		const persp = settings.perspective > 0 ? `perspective(${settings.perspective}px)` : '';
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

	function getMaskStyle(settings) {
		if (!settings.maskVisible) return '';
		const r = settings.maskRadius;
		const f = settings.maskFeather;
		const gradient = `radial-gradient(circle at center, black ${r}%, transparent ${r + f}%)`;
		return `-webkit-mask-image: ${gradient}; mask-image: ${gradient};`;
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
				<label for="cam1">Kamera 1:</label>
				<select id="cam1" bind:value={selectedCam1}>
					{#each videoDevices as device}
						<option value={device.deviceId}>{device.label || 'Kamera ' + device.deviceId}</option>
					{/each}
				</select>
				<button class="settings-btn" on:click={() => openSettings('cam1')} title="Einstellungen">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
				</button>
			</div>
			<div class="video-wrapper" style={getMaskStyle(camSettings.cam1)}>
				<!-- svelte-ignore a11y-media-has-caption -->
				<video bind:this={videoElem1} autoplay playsinline muted style={getTransformStyle(camSettings.cam1)}></video>
			</div>
		</div>

		<!-- Horizontal Resizer (zwischen den Kameras) -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="resizer-horizontal" on:mousedown={startHorizontalDrag}></div>

		<!-- Kamera 2 -->
		<div class="cam-container" style="width: {100 - leftWidth}%;">
			<div class="controls">
				<label for="cam2">Kamera 2:</label>
				<select id="cam2" bind:value={selectedCam2}>
					{#each videoDevices as device}
						<option value={device.deviceId}>{device.label || 'Kamera ' + device.deviceId}</option>
					{/each}
				</select>
				<button class="settings-btn" on:click={() => openSettings('cam2')} title="Einstellungen">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
				</button>
			</div>
			<div class="video-wrapper" style={getMaskStyle(camSettings.cam2)}>
				<!-- svelte-ignore a11y-media-has-caption -->
				<video bind:this={videoElem2} autoplay playsinline muted style={getTransformStyle(camSettings.cam2)}></video>
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
			<input type="text" id="url" bind:value={scoringUrl} placeholder="https://..." />
			
			<label for="crop" style="margin-left: 10px;">Crop Top:</label>
			<input type="number" id="crop" bind:value={cropTop} min="0" style="width: 50px;" />

			<label for="cropBottom" style="margin-left: 10px;">Bottom:</label>
			<input type="number" id="cropBottom" bind:value={cropBottom} min="0" style="width: 50px;" />
			
			<button class="toggle-webcam-btn" on:click={() => showFloatingWebcam = !showFloatingWebcam} title="Zusätzliche Webcam anzeigen">
				{showFloatingWebcam ? 'Webcam schließen' : 'Webcam öffnen'}
			</button>

			<span style="margin-left: auto; font-size: 0.7rem; color: #aaa;" title="CSS Injection funktioniert nur bei gleicher Domain oder deaktivierter Sicherheit">{cssInjectionStatus}</span>
		</div>
		<div class="iframe-wrapper">
			<iframe 
				src={scoringUrl} 
				title="Live Scoring" 
				frameborder="0"
				style="margin-top: -{cropTop}px; height: calc(100% + {cropTop}px + {cropBottom}px);"
				on:load={injectIframeCss}
			></iframe>
		</div>
	</div>

	<!-- SETTINGS MODAL -->
	{#if editingCam}
		<div class="modal-backdrop" on:click={closeSettings}>
			<div class="modal-content" on:click|stopPropagation>
				<div class="modal-header">
					<h2>Einstellungen {editingCam === 'cam1' ? 'Kamera 1' : 'Kamera 2'}</h2>
					<button class="close-btn" on:click={closeSettings}>&times;</button>
				</div>
				
				<div class="modal-body">
					<div class="preview-container" style={getMaskStyle(camSettings[editingCam])}>
						<!-- svelte-ignore a11y-media-has-caption -->
						<video 
							srcObject={editVideoSource} 
							autoplay 
							playsinline 
							muted 
							style={getTransformStyle(camSettings[editingCam])}
						></video>
						<!-- Hilfskreis für Dartboard -->
						<div class="guide-circle"></div>
						<!-- Debug Canvas für OpenCV Overlay -->
						<canvas bind:this={debugCanvas} class="debug-canvas"></canvas>
					</div>

					<div class="controls-panel">
						<button class="calibrate-btn" on:click={() => calibrateCamera(editingCam)} disabled={!cvReady}>
							{cvReady ? '🪄 Auto-Calibrate (Beta)' : 'Lade OpenCV...'}
						</button>
						<button class="simulate-btn" on:click={() => simulateCamera(editingCam)}>
							🧪 Testbild laden
						</button>
						<hr />
						<div class="control-group">
							<label>Scale ({camSettings[editingCam].scale})</label>
							<input type="range" min="0.5" max="3" step="0.01" bind:value={camSettings[editingCam].scale} />
						</div>
						<div class="control-group">
							<label>Scale X ({camSettings[editingCam].scaleX})</label>
							<input type="range" min="0.5" max="3" step="0.01" bind:value={camSettings[editingCam].scaleX} />
						</div>
						<div class="control-group">
							<label>Scale Y ({camSettings[editingCam].scaleY})</label>
							<input type="range" min="0.5" max="3" step="0.01" bind:value={camSettings[editingCam].scaleY} />
						</div>
						<div class="control-group">
							<label>Rotate Z ({camSettings[editingCam].rotate}°)</label>
							<input type="range" min="-180" max="180" step="1" bind:value={camSettings[editingCam].rotate} />
						</div>
						<div class="control-group">
							<label>Move X ({camSettings[editingCam].x}px)</label>
							<input type="range" min="-500" max="500" step="1" bind:value={camSettings[editingCam].x} />
						</div>
						<div class="control-group">
							<label>Move Y ({camSettings[editingCam].y}px)</label>
							<input type="range" min="-500" max="500" step="1" bind:value={camSettings[editingCam].y} />
						</div>
						
						<hr />
						
						<div class="control-group">
							<label>Perspective ({camSettings[editingCam].perspective}px)</label>
							<input type="range" min="0" max="2000" step="10" bind:value={camSettings[editingCam].perspective} />
							<small>(0 = aus, kleine Werte = starker 3D Effekt)</small>
						</div>
						<div class="control-group">
							<label>Rotate X (Tilt Up/Down) ({camSettings[editingCam].rotateX}°)</label>
							<input type="range" min="-80" max="80" step="1" bind:value={camSettings[editingCam].rotateX} />
						</div>
						<div class="control-group">
							<label>Rotate Y (Tilt Left/Right) ({camSettings[editingCam].rotateY}°)</label>
							<input type="range" min="-80" max="80" step="1" bind:value={camSettings[editingCam].rotateY} />
						</div>
						
						<hr />

						<div class="control-group">
							<label>Skew X ({camSettings[editingCam].skewX}°)</label>
							<input type="range" min="-60" max="60" step="1" bind:value={camSettings[editingCam].skewX} />
						</div>
						<div class="control-group">
							<label>Skew Y ({camSettings[editingCam].skewY}°)</label>
							<input type="range" min="-60" max="60" step="1" bind:value={camSettings[editingCam].skewY} />
						</div>

						<hr />
						
						<div class="control-group">
							<label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
								<input type="checkbox" bind:checked={camSettings[editingCam].maskVisible} style="width: auto;" />
								<span>Runde Maske aktivieren</span>
							</label>
						</div>
						
						{#if camSettings[editingCam].maskVisible}
							<div class="control-group">
								<label>Mask Radius ({camSettings[editingCam].maskRadius}%)</label>
								<input type="range" min="10" max="100" step="1" bind:value={camSettings[editingCam].maskRadius} />
							</div>
							<div class="control-group">
								<label>Mask Feather ({camSettings[editingCam].maskFeather}%)</label>
								<input type="range" min="0" max="50" step="1" bind:value={camSettings[editingCam].maskFeather} />
							</div>
						{/if}

						<button class="reset-btn" on:click={() => camSettings[editingCam] = { scale: 1, scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0, perspective: 1000, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0, maskVisible: false, maskRadius: 45, maskFeather: 15 }}>Reset</button>
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
		position: relative; /* Für Settings Button */
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: contain; /* Oder 'contain', wenn du schwarze Balken willst aber alles sehen musst */
		transform-origin: center center;
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

	.debug-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 10; /* Über dem Video */
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

	.calibrate-btn {
		width: 100%;
		padding: 10px;
		background: #1976d2;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		margin-bottom: 15px;
		font-weight: bold;
	}

	.calibrate-btn:disabled {
		background: #555;
		cursor: not-allowed;
		opacity: 0.7;
	}

	.calibrate-btn:hover:not(:disabled) {
		background: #1565c0;
	}

	.simulate-btn {
		width: 100%;
		padding: 8px;
		background: #444;
		color: #ccc;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
		margin-bottom: 15px;
		font-size: 0.8rem;
	}

	.simulate-btn:hover {
		background: #555;
		color: white;
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
		padding: 2px 8px;
		background: #444;
		color: white;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
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

	iframe {
		width: 100%;
		/* height wird inline gesetzt */
		background: white; /* Dartsoftware ist meist hell */
		border: none;
	}
</style>