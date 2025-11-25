<script>
	import { onMount, onDestroy } from "svelte";

	export let videoDevices = [];
	export let visible = false;

	let videoElement;
	let selectedDeviceId = "";
	let stream = null;

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
	function startDrag(e) {
		if (e.target.closest(".controls") || e.target.closest(".resizer"))
			return;
		if (e.type === "touchstart") e.preventDefault();

		isDragging = true;

		if (e.touches) {
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
	function startResize(e) {
		e.stopPropagation();
		if (e.type === "touchstart") e.preventDefault();

		isResizing = true;

		if (e.touches) {
			resizeStartX = e.touches[0].clientX;
			resizeStartY = e.touches[0].clientY;
		} else {
			resizeStartX = e.clientX;
			resizeStartY = e.clientY;
		}

		initialWidth = width;
		initialHeight = height;
	}

	function handleMove(e) {
		if (isDragging) {
			if (e.type === "touchmove") e.preventDefault();

			let clientX, clientY;
			if (e.touches) {
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
			if (e.touches) {
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
			<button class="close-btn" on:click={handleClose}>&times;</button>
		</div>

		<div class="video-container">
			<!-- svelte-ignore a11y-media-has-caption -->
			<video bind:this={videoElement} autoplay playsinline muted></video>
		</div>

		<div class="controls">
			<select bind:value={selectedDeviceId}>
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
		background: #222;
		border: 1px solid #444;
		border-radius: 8px;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		z-index: 2000;
		overflow: hidden;
		min-width: 160px;
		min-height: 120px;
	}

	.header {
		background: #333;
		padding: 5px 10px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: move;
		user-select: none;
	}

	.drag-handle {
		font-size: 0.8rem;
		color: #ccc;
		font-weight: bold;
	}

	.close-btn {
		background: none;
		border: none;
		color: #aaa;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0 5px;
		line-height: 1;
	}

	.close-btn:hover {
		color: white;
	}

	.video-container {
		flex: 1;
		background: black;
		overflow: hidden;
		position: relative;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.controls {
		padding: 5px;
		background: #333;
	}

	select {
		width: 100%;
		padding: 4px;
		background: #444;
		color: white;
		border: 1px solid #555;
		font-size: 0.8rem;
	}

	.resizer {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 15px;
		height: 15px;
		cursor: se-resize;
		background: linear-gradient(135deg, transparent 50%, #666 50%);
	}

	.drag-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: 1999;
	}
</style>
