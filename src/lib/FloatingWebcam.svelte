<script lang="ts">
	import { onMount, onDestroy } from "svelte";

	export let videoDevices: MediaDeviceInfo[] = [];
	export let visible = false;

	let videoElement: HTMLVideoElement;
	let selectedDeviceId = "";
	let stream: MediaStream | null = null;

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
	});

	onDestroy(() => {
		window.removeEventListener("mousemove", handleMove);
		window.removeEventListener("mouseup", handleEnd);
		window.removeEventListener("touchmove", handleMove);
		window.removeEventListener("touchend", handleEnd);
		stopStream();
	});

	async function startStream() {
		stopStream();
		if (!selectedDeviceId) return;

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { deviceId: { exact: selectedDeviceId } },
			});
			if (videoElement) {
				videoElement.srcObject = stream;
			}
		} catch (err) {
			console.error("Error starting webcam stream:", err);
		}
	}

	function stopStream() {
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
		stopStream();
	}

	// Dragging Logic
	function startDrag(e: MouseEvent | TouchEvent) {
		const target = e.target as HTMLElement | null;
		if (target?.closest(".controls") || target?.closest(".resizer") || target?.closest(".close-btn"))
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

	$: if (selectedDeviceId) {
		startStream();
	}

	// Stop stream when hidden
	$: if (!visible) {
		stopStream();
	} else if (visible && selectedDeviceId && !stream) {
		startStream();
	}
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
		style="left: {x}px; top: {y}px; width: {width}px; height: {height}px;"
		on:mousedown={startDrag}
		on:touchstart={startDrag}
	>
		<div class="header">
			<span class="drag-handle">Webcam</span>
			<button class="close-btn" aria-label="Webcam schließen" on:click={handleClose}>&times;</button>
		</div>

		<div class="video-container">
			<!-- svelte-ignore a11y-media-has-caption -->
			<video bind:this={videoElement} autoplay playsinline muted></video>
		</div>

		<div class="controls">
			<label for="floating-webcam-device">Kameraquelle</label>
			<select class="ui-field" id="floating-webcam-device" bind:value={selectedDeviceId}>
				<option value="">Kamera wählen...</option>
				{#each videoDevices as device}
					<option value={device.deviceId}
						>{device.label || "Kamera"} ({device.deviceId.slice(
							0,
							8,
						)}...)</option
					>
				{/each}
			</select>
		</div>

		<div
			class="resizer"
			on:mousedown={startResize}
			on:touchstart={startResize}
		></div>
	</div>
{/if}

<style>
    .floating-window {
        position: fixed;
        z-index: 2000;
        display: flex;
        flex-direction: column;
        min-width: 160px;
        min-height: 120px;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-top: 3px solid var(--color-brand);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        box-shadow: var(--shadow-panel);
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        min-height: 42px;
        padding: 2px var(--space-2) 2px var(--space-3);
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface-raised);
        cursor: move;
        user-select: none;
    }

    .drag-handle {
        color: var(--color-text);
        font: 600 15px/1 var(--font-display);
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .close-btn {
        width: 34px;
        height: 34px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 24px;
        line-height: 1;
    }

    .close-btn:hover {
        border-color: var(--color-border);
        background: var(--color-brand-active);
        color: var(--color-text);
    }

    .video-container {
        position: relative;
        flex: 1;
        overflow: hidden;
        background: var(--color-video);
    }

    video {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .controls {
        display: grid;
        gap: 4px;
        padding: var(--space-2);
        border-top: 1px solid var(--color-border);
        background: var(--color-surface);
    }

    .controls label {
        color: var(--color-text-secondary);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
    }

    .controls select {
        min-height: 36px;
        padding: 5px 8px;
        font-size: 12px;
    }

    .resizer {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 16px;
        height: 16px;
        cursor: se-resize;
        background: linear-gradient(135deg, transparent 50%, var(--color-brand-text) 50%);
    }

    .drag-overlay {
        position: fixed;
        z-index: 1999;
        inset: 0;
        cursor: grabbing;
    }
</style>
