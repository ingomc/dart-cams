<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from "svelte";

	export let videoDevices: MediaDeviceInfo[] = [];
	export let visible = false;
	export let checkingCameras = false;
	export let cameraError = '';

	let videoElement: HTMLVideoElement;
	let selectedDeviceId = "";
	let stream: MediaStream | null = null;
	let streamError = '';
	let streamRequest = 0;
	let boundVisible = false;
	let boundDeviceId = '';
	let boundElement: HTMLVideoElement | undefined;
	let settingsOpen = false;
	let mirrored = true;
	let settingsButton: HTMLButtonElement;
	const dispatch = createEventDispatcher<{
		interaction: { active: boolean };
		refreshDevices: { requestPermission: boolean };
	}>();

	// Position and Size
	let x = 20;
	let y = 20;
	let width = 320;
	let height = 240;

	// Dragging state
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let initialX = 0;
	let initialY = 0;

	// Resizing state
	let isResizing = false;
	let resizeStartX = 0;
	let resizeStartY = 0;
	let initialWidth = 0;
	let initialHeight = 0;

	onMount(() => {
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleEnd);
		window.addEventListener("touchmove", handleMove, { passive: false });
		window.addEventListener("touchend", handleEnd);
		window.addEventListener("touchcancel", handleEnd);
	});

	onDestroy(() => {
		window.removeEventListener("mousemove", handleMove);
		window.removeEventListener("mouseup", handleEnd);
		window.removeEventListener("touchmove", handleMove);
		window.removeEventListener("touchend", handleEnd);
		window.removeEventListener("touchcancel", handleEnd);
		stopStream();
	});

	function resetControls() {
		settingsOpen = false;
		isDragging = false;
		isResizing = false;
	}

	function toggleSettings() {
		settingsOpen = !settingsOpen;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !settingsOpen) return;
		event.preventDefault();
		event.stopPropagation();
		settingsOpen = false;
		settingsButton?.focus();
	}

	async function startStream(deviceId: string, element: HTMLVideoElement, request: number) {
		try {
			const nextStream = await navigator.mediaDevices.getUserMedia({
				video: { deviceId: { exact: deviceId } },
			});
			if (request !== streamRequest) {
				nextStream.getTracks().forEach(track => track.stop());
				return;
			}
			stream = nextStream;
			element.srcObject = nextStream;
			dispatch('refreshDevices', { requestPermission: false });
		} catch (err) {
			if (request !== streamRequest) return;
			const name = err instanceof Error ? err.name : '';
			streamError = name === 'NotAllowedError'
				? 'Kamerazugriff im Browser erlauben.'
				: name === 'NotReadableError'
					? 'Kamera nicht verfügbar. Prüfe, ob eine andere App sie belegt.'
					: name === 'NotFoundError' || name === 'OverconstrainedError'
						? 'Kamera nicht gefunden. Kameras neu suchen.'
						: 'Webcam konnte nicht gestartet werden.';
			settingsOpen = true;
		}
	}

	function syncStream(show: boolean, deviceId: string, element: HTMLVideoElement | undefined) {
		if (show === boundVisible && deviceId === boundDeviceId && element === boundElement) return;
		boundVisible = show;
		boundDeviceId = deviceId;
		boundElement = element;
		stopStream();
		streamError = '';
		if (show && deviceId && element) void startStream(deviceId, element, streamRequest);
	}

	function stopStream() {
		streamRequest++;
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			stream = null;
		}
		if (videoElement) {
			videoElement.srcObject = null;
		}
	}

	function handleClose() {
		visible = false;
		resetControls();
		stopStream();
	}

	// Dragging Logic
	function startDrag(e: MouseEvent | TouchEvent) {
		const target = e.target as HTMLElement | null;
		if (target?.closest(".webcam-actions, .webcam-settings, .resizer") || ('button' in e && e.button !== 0))
			return;
		if (e.type === "touchstart") e.preventDefault();

		isDragging = true;

		if ("touches" in e) {
			dragStartX = e.touches[0].clientX;
			dragStartY = e.touches[0].clientY;
		} else {
			dragStartX = e.clientX;
			dragStartY = e.clientY;
		}

		initialX = x;
		initialY = y;
	}

	// Resizing Logic
	function startResize(e: MouseEvent | TouchEvent) {
		e.stopPropagation();
		if ('button' in e && e.button !== 0) return;
		if (e.type === "touchstart") e.preventDefault();

		isResizing = true;

		if ("touches" in e) {
			resizeStartX = e.touches[0].clientX;
			resizeStartY = e.touches[0].clientY;
		} else {
			resizeStartX = e.clientX;
			resizeStartY = e.clientY;
		}

		initialWidth = width;
		initialHeight = height;
	}

	function handleMove(e: MouseEvent | TouchEvent) {
		if (isDragging) {
			if (e.type === "touchmove") e.preventDefault();

			let clientX, clientY;
			if ("touches" in e) {
				clientX = e.touches[0].clientX;
				clientY = e.touches[0].clientY;
			} else {
				clientX = e.clientX;
				clientY = e.clientY;
			}

			const dx = clientX - dragStartX;
			const dy = clientY - dragStartY;
			x = initialX + dx;
			y = initialY + dy;
		} else if (isResizing) {
			if (e.type === "touchmove") e.preventDefault();

			let clientX, clientY;
			if ("touches" in e) {
				clientX = e.touches[0].clientX;
				clientY = e.touches[0].clientY;
			} else {
				clientX = e.clientX;
				clientY = e.clientY;
			}

			const dx = clientX - resizeStartX;
			const dy = clientY - resizeStartY;
			width = Math.max(160, initialWidth + dx); // Min width
			height = Math.max(120, initialHeight + dy); // Min height
		}
	}

	function handleEnd() {
		isDragging = false;
		isResizing = false;
	}

	function handleResizeKeydown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		const step = event.shiftKey ? 1 : 10;
		if (event.key === 'ArrowLeft') width = Math.max(160, width - step);
		if (event.key === 'ArrowRight') width += step;
		if (event.key === 'ArrowUp') height = Math.max(120, height - step);
		if (event.key === 'ArrowDown') height += step;
	}

	$: if (!visible) resetControls();
	$: dispatch('interaction', { active: visible && (settingsOpen || isDragging || isResizing) });

	$: syncStream(visible, selectedDeviceId, videoElement);
</script>

{#if visible}
	{#if isDragging || isResizing}
		<div
			class="drag-overlay"
			style="cursor: {isResizing ? 'se-resize' : 'grabbing'}"
		></div>
	{/if}
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="floating-window"
		class:controls-visible={settingsOpen || isDragging || isResizing}
		class:dragging={isDragging}
		style="left: {x}px; top: {y}px; width: {width}px; height: {height}px;"
		on:mousedown={startDrag}
		on:touchstart={startDrag}
		on:keydown={handleKeydown}
	>
		<div class="video-container">
			<!-- svelte-ignore a11y-media-has-caption -->
			<video bind:this={videoElement} class:mirrored autoplay playsinline muted></video>
		</div>

		<div class="webcam-actions">
			<button type="button" class="ui-icon-button webcam-action" bind:this={settingsButton}
				aria-label="Webcam-Einstellungen {settingsOpen ? 'schließen' : 'öffnen'}"
				title="Kamera auswählen" aria-controls="floating-webcam-settings" aria-expanded={settingsOpen}
				on:click={toggleSettings}>
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
					stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">
					<path d="M10 2h4l.5 2.2 1.7.7 1.9-1.2 2.8 2.8-1.2 1.9.7 1.7L22 10v4l-2.2.5-.7 1.7 1.2 1.9-2.8 2.8-1.9-1.2-1.7.7L14 22h-4l-.5-2.2-1.7-.7-1.9 1.2-2.8-2.8 1.2-1.9-.7-1.7L2 14v-4l2.2-.5.7-1.7-1.2-1.9 2.8-2.8 1.9 1.2 1.7-.7L10 2Z" />
					<circle cx="12" cy="12" r="3" />
				</svg>
			</button>
			<button type="button" class="ui-icon-button webcam-action close-btn"
				aria-label="Webcam schließen" title="Webcam schließen" on:click={handleClose}>
				<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
					stroke-width="2" stroke-linecap="round" aria-hidden="true">
					<path d="m6 6 12 12M18 6 6 18" />
				</svg>
			</button>
		</div>

		{#if settingsOpen}
			<div id="floating-webcam-settings" class="webcam-settings ui-panel">
				<label class="ui-label" for="floating-webcam-device">Kameraquelle</label>
				<select class="ui-field" id="floating-webcam-device" bind:value={selectedDeviceId} disabled={checkingCameras}>
					<option value="">Kamera wählen…</option>
					{#if selectedDeviceId && !videoDevices.some(device => device.deviceId === selectedDeviceId)}
						<option value={selectedDeviceId}>Ausgewählte Kamera (derzeit nicht gefunden)</option>
					{/if}
					{#each videoDevices as device, index}
						<option value={device.deviceId}>{device.label || `Kamera ${index + 1}`}</option>
					{/each}
				</select>
				<div class="webcam-settings-actions">
				<button type="button" class="ui-button ui-button--secondary ui-button--small"
					disabled={checkingCameras}
					on:click={() => dispatch('refreshDevices', { requestPermission: true })}>
					{checkingCameras ? 'Aktualisiere Geräte…' : 'Geräte aktualisieren'}
				</button>
				<button type="button" class="ui-icon-button ui-button--secondary mirror-toggle"
					aria-label="Bild spiegeln" title="Bild spiegeln" aria-pressed={mirrored}
					on:click={() => mirrored = !mirrored}>
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
					stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">
					<path d="M12 3v18M3 6l6 3v6l-6 3V6Zm18 0-6 3v6l6 3V6Z" />
					</svg>
				</button>
				</div>
				{#if streamError || cameraError}<p class="webcam-error" role="alert">{streamError || cameraError}</p>{/if}
			</div>
		{/if}

		<button type="button"
			class="resizer"
			aria-label="Webcam-Größe ändern" title="Größe ändern"
			on:mousedown={startResize}
			on:touchstart={startResize}
			on:keydown={handleResizeKeydown}
		>
			<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor"
				stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
				<path d="m5 15 10-10m-4 10 4-4" />
			</svg>
		</button>
	</div>
{/if}

<style>
    .floating-window {
        position: fixed;
        z-index: 2000;
        min-width: 160px;
        min-height: 120px;
        overflow: hidden;
        border-radius: var(--radius-md);
        background: var(--color-video);
        box-shadow: var(--shadow-panel);
        cursor: grab;
        touch-action: none;
        user-select: none;
    }

    .floating-window.dragging {
        cursor: grabbing;
    }

    .webcam-actions {
        position: absolute;
        z-index: 3;
        top: var(--space-2);
        right: var(--space-2);
        display: flex;
        gap: var(--space-1);
    }

    .webcam-actions,
    .resizer {
        opacity: var(--controls-opacity, 1);
        pointer-events: var(--controls-pointer-events, auto);
        transition: opacity 200ms ease;
    }

    .controls-visible .webcam-actions,
    .controls-visible .resizer,
    .floating-window:has(:focus-visible) .webcam-actions,
    .floating-window:has(:focus-visible) .resizer {
        opacity: 1;
        pointer-events: auto;
    }

    .webcam-action {
        width: 32px;
        min-height: 32px;
        padding: 0;
        border-color: rgba(255, 255, 255, 0.3);
        background: rgba(21, 23, 25, 0.92);
        color: var(--color-text);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }

    .webcam-action[aria-expanded="true"],
    .close-btn:hover {
        border-color: var(--color-brand-text);
        background: var(--color-brand-active);
    }

    .video-container {
        position: absolute;
        inset: 0;
        overflow: hidden;
    }

    video {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    video.mirrored {
        transform: scaleX(-1);
    }

    .webcam-settings-actions {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 36px;
        gap: var(--space-1);
        align-items: stretch;
    }

    .webcam-settings-actions .ui-button {
        min-height: 36px;
        padding: 5px 8px;
        font-size: 12px;
    }

    .mirror-toggle {
        width: 36px;
        min-height: 36px;
        padding: 0;
    }

    .mirror-toggle[aria-pressed="true"] {
        border-color: var(--color-brand-text);
        background: var(--color-brand-active);
        color: var(--color-text);
    }

    .webcam-settings {
        position: absolute;
        z-index: 4;
        top: 48px;
        right: var(--space-2);
        display: grid;
        gap: var(--space-1);
        width: min(280px, calc(100% - 16px));
        max-height: calc(100% - 56px);
        overflow-y: auto;
        padding: 12px;
        background: var(--color-surface);
        box-shadow: var(--shadow-panel);
        cursor: default;
        user-select: text;
    }

    .webcam-settings select {
        min-height: 36px;
        padding: 5px 8px;
        font-size: 12px;
    }

    .resizer {
        position: absolute;
        z-index: 3;
        right: 4px;
        bottom: 4px;
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        background: rgba(21, 23, 25, 0.92);
        color: var(--color-text);
        cursor: se-resize;
        touch-action: none;
    }

    .webcam-error {
        margin: 4px 0 0;
        color: #ffb2ba;
        font-size: 12px;
    }

    .resizer:hover {
        border-color: var(--color-brand-text);
        background: var(--color-surface-raised);
    }

    .drag-overlay {
        position: fixed;
        z-index: 1999;
        inset: 0;
        cursor: grabbing;
    }

    @media (prefers-reduced-motion: reduce) {
        .webcam-actions,
        .resizer { transition: none; }
    }
</style>
