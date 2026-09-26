<script lang="ts">
    import { createEventDispatcher, onDestroy } from 'svelte';
    import type { CamSetting } from '../types';
    import { defaultCamSettings } from '../constants';
    import { alignDartboard } from '../boardAlignment';
    import { clamp, dragPan, pinchTransform, type Point } from '../manualEdit';

    export let draft: CamSetting;
    export let frameWidth: number;
    export let frameHeight: number;
    export let video: HTMLVideoElement | undefined;

    const dispatch = createEventDispatcher<{ apply: CamSetting; cancel: void }>();
    type NumberField = 'scaleX' | 'scaleY' | 'perspective' | 'rotateX' | 'rotateY' |
        'skewX' | 'skewY' | 'brightness' | 'contrast' | 'saturate' | 'sharpness' | 'maskRadius' | 'maskFeather';
    let mode: 'image' | 'mask' = 'image';
    let showExtras = false;
    let calibrating = false;
    let message = '';
    let topToolsHeight = 0;
    let bottomToolsHeight = 0;
    let history: CamSetting[] = [];
    let activeInput: { field: NumberField; before: CamSetting } | null = null;
    let wheelBefore: CamSetting | null = null;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    let requestId = 0;
    const pointers = new Map<number, Point>();
    let gestureStart = new Map<number, Point>();
    let gestureBase: CamSetting;
    let gestureBefore: CamSetting | null = null;
    let handle: 'rotate' | 'scale' | 'mask' | null = null;
    let handlePointer = -1;
    let handleBefore: CamSetting | null = null;
    let handleBase: CamSetting;
    let handleStart = 0;

    onDestroy(() => {
        requestId++;
        if (wheelTimer) clearTimeout(wheelTimer);
    });

    function copy(value: CamSetting): CamSetting {
        return { ...value, autoAlignment: value.autoAlignment ? { ...value.autoAlignment } : undefined };
    }

    function remember(before: CamSetting | null) {
        if (!before || JSON.stringify(before) === JSON.stringify(draft)) return;
        history = [...history.slice(-29), before];
    }

    function undo() {
        finishInput();
        finishWheel();
        if (!history.length || pointers.size || handle) return;
        draft = copy(history[history.length - 1]);
        history = history.slice(0, -1);
        message = '';
    }

    function change(patch: Partial<CamSetting>) {
        if (calibrating) return;
        const before = copy(draft);
        draft = { ...draft, ...patch };
        remember(before);
        message = '';
    }

    function input(field: NumberField, event: Event) {
        if (calibrating) return;
        const value = Number((event.currentTarget as HTMLInputElement).value);
        if (!activeInput || activeInput.field !== field) {
            finishInput();
            activeInput = { field, before: copy(draft) };
            message = '';
        }
        draft = { ...draft, [field]: value };
    }

    function selectMode(next: 'image' | 'mask') {
        finishInput();
        mode = next;
        if (next === 'mask') showExtras = false;
    }

    function finishInput() {
        if (activeInput) remember(activeInput.before);
        activeInput = null;
    }

    function local(event: PointerEvent | WheelEvent): Point {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function startGesture() {
        gestureStart = new Map(pointers);
        gestureBase = copy(draft);
    }

    function pointerDown(event: PointerEvent) {
        if (mode !== 'image' || calibrating || handle || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault();
        finishWheel();
        message = '';
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        if (!pointers.size) gestureBefore = copy(draft);
        pointers.set(event.pointerId, local(event));
        startGesture();
    }

    function pointerMove(event: PointerEvent) {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, local(event));
        if (pointers.size >= 2) {
            const ids = [...pointers.keys()].slice(0, 2);
            draft = pinchTransform(gestureBase, gestureStart.get(ids[0])!, gestureStart.get(ids[1])!,
                pointers.get(ids[0])!, pointers.get(ids[1])!, frameWidth, frameHeight);
        } else {
            const id = [...pointers.keys()][0];
            const start = gestureStart.get(id)!;
            const current = pointers.get(id)!;
            draft = dragPan(gestureBase, { x: current.x - start.x, y: current.y - start.y }, frameWidth, frameHeight);
        }
    }

    function pointerUp(event: PointerEvent) {
        if (!pointers.has(event.pointerId)) return;
        pointers.delete(event.pointerId);
        if (pointers.size) startGesture();
        else {
            remember(gestureBefore);
            gestureBefore = null;
        }
    }

    function startHandle(event: PointerEvent, kind: 'rotate' | 'scale' | 'mask') {
        if (calibrating || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.stopPropagation();
        event.preventDefault();
        message = '';
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        handle = kind;
        handlePointer = event.pointerId;
        handleBefore = copy(draft);
        handleBase = copy(draft);
        const rect = (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
        const x = event.clientX - rect.left - frameWidth / 2;
        const y = event.clientY - rect.top - frameHeight / 2;
        handleStart = kind === 'rotate' ? Math.atan2(y, x) :
            kind === 'mask' ? event.clientX : Math.hypot(x, y);
    }

    function moveHandle(event: PointerEvent) {
        if (!handle || event.pointerId !== handlePointer) return;
        event.preventDefault();
        const rect = (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
        const x = event.clientX - rect.left - frameWidth / 2;
        const y = event.clientY - rect.top - frameHeight / 2;
        if (handle === 'rotate') {
            draft = { ...handleBase, rotate: handleBase.rotate +
                (Math.atan2(y, x) - handleStart) * 180 / Math.PI };
        } else if (handle === 'scale') {
            draft = { ...handleBase, scale: clamp(handleBase.scale *
                Math.hypot(x, y) / Math.max(handleStart, 1), 0.3, 4) };
        } else {
            const delta = (event.clientX - handleStart) / Math.max(40, frameWidth * 0.2);
            draft = { ...handleBase, maskRadius: Math.round(clamp(handleBase.maskRadius + delta * 100, 10, 100)) };
        }
    }

    function endHandle(event: PointerEvent) {
        if (event.pointerId !== handlePointer) return;
        remember(handleBefore);
        handle = null;
        handlePointer = -1;
        handleBefore = null;
    }

    function zoomWheel(event: WheelEvent) {
        if (mode !== 'image' || calibrating || pointers.size || handle) return;
        event.preventDefault();
        message = '';
        if (!wheelBefore) wheelBefore = copy(draft);
        if (wheelTimer) clearTimeout(wheelTimer);
        const anchor = local(event);
        const centerX = frameWidth / 2;
        const centerY = frameHeight / 2;
        const oldScale = draft.scale;
        const scale = clamp(oldScale * (event.deltaY < 0 ? 1.06 : 1 / 1.06), 0.3, 4);
        const ratio = scale / oldScale;
        draft = {
            ...draft,
            scale,
            panX: (anchor.x - centerX - ratio * (anchor.x - centerX - (draft.panX ?? 0) * frameWidth)) / Math.max(frameWidth, 1),
            panY: (anchor.y - centerY - ratio * (anchor.y - centerY - (draft.panY ?? 0) * frameHeight)) / Math.max(frameHeight, 1),
        };
        wheelTimer = setTimeout(finishWheel, 250);
    }

    function finishWheel() {
        if (wheelTimer) clearTimeout(wheelTimer);
        wheelTimer = null;
        remember(wheelBefore);
        wheelBefore = null;
    }

    function keyDown(event: KeyboardEvent) {
        if (event.target !== event.currentTarget) return;
        const step = event.shiftKey ? 20 : 5;
        if (event.key === 'Escape') { dispatch('cancel'); return; }
        if (mode !== 'image') return;
        if (event.key === 'ArrowLeft') change({ panX: (draft.panX ?? 0) - step / Math.max(frameWidth, 1) });
        else if (event.key === 'ArrowRight') change({ panX: (draft.panX ?? 0) + step / Math.max(frameWidth, 1) });
        else if (event.key === 'ArrowUp') change({ panY: (draft.panY ?? 0) - step / Math.max(frameHeight, 1) });
        else if (event.key === 'ArrowDown') change({ panY: (draft.panY ?? 0) + step / Math.max(frameHeight, 1) });
        else return;
        event.preventDefault();
    }

    async function autoAlign() {
        if (!video || calibrating) return;
        finishInput();
        finishWheel();
        showExtras = false;
        const id = ++requestId;
        calibrating = true;
        message = 'Dartboard wird gesucht …';
        try {
            const result = await alignDartboard(video);
            if (id !== requestId) return;
            if (!result) { message = 'Kein Dartboard erkannt. Entwurf bleibt erhalten.'; return; }
            const before = copy(draft);
            draft = {
                ...draft,
                autoAlignment: {
                    ...result.alignment,
                    topAngle: result.alignment.topAngle ?? draft.autoAlignment?.topAngle ?? null,
                },
                scale: 1, scaleX: 1, scaleY: 1,
                rotate: result.alignment.topAngle === null ? draft.rotate : 0,
                panX: 0, panY: 0, x: 0, y: 0,
                perspective: defaultCamSettings.perspective,
                rotateX: 0, rotateY: 0, skewX: 0, skewY: 0,
            };
            remember(before);
            message = result.warning ?? 'Automatisch ausgerichtet. Mit Übernehmen speichern.';
        } catch (error) {
            message = error instanceof Error ? error.message : 'Ausrichtung fehlgeschlagen.';
        } finally {
            if (id === requestId) calibrating = false;
        }
    }

    function apply() {
        finishInput();
        finishWheel();
        dispatch('apply', copy(draft));
    }

    $: targetRadius = Math.min(frameWidth, frameHeight) * 0.35;
    $: handleRadius = Math.max(0, Math.min(targetRadius, Math.min(frameWidth, frameHeight) / 2 - 24));
    $: maskRadiusPx = Math.hypot(frameWidth / 2, frameHeight / 2) * draft.maskRadius / 100;
    $: maskGripX = frameWidth / 2 + Math.min(maskRadiusPx, Math.max(0, frameWidth / 2 - 24));
    $: extrasTop = topToolsHeight + 12;
    $: extrasBottom = bottomToolsHeight + 12;
</script>

<div class="editor" class:compact={frameWidth < 520} class:narrow={frameWidth < 260}
    class:tiny={frameWidth < 200}
    class:micro={frameWidth < 170}
    role="group" aria-label="Kamerabild bearbeiten">
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions a11y-no-noninteractive-tabindex -->
    <div class="gesture-layer" role="application" tabindex="0" aria-label="Bild ziehen, mit zwei Fingern zoomen und drehen"
        class:inactive={mode !== 'image' || calibrating}
        on:pointerdown={pointerDown} on:pointermove={pointerMove}
        on:pointerup={pointerUp} on:pointercancel={pointerUp}
        on:wheel|nonpassive={zoomWheel} on:keydown={keyDown}></div>

    {#if mode === 'image'}
        <div class="target-ring" style="width: {targetRadius * 2}px; height: {targetRadius * 2}px;"></div>
        <button class="grip rotate-grip" style="left: {frameWidth / 2 + handleRadius * 0.707}px; top: {frameHeight / 2 - handleRadius * 0.707}px;"
            title="Drehen" aria-label="Drehen" on:pointerdown={(event) => startHandle(event, 'rotate')}
            on:pointermove={moveHandle} on:pointerup={endHandle} on:pointercancel={endHandle}>⟳</button>
        <button class="grip scale-grip" style="left: {frameWidth / 2 + handleRadius * 0.707}px; top: {frameHeight / 2 + handleRadius * 0.707}px;"
            title="Größe ändern" aria-label="Größe ändern" on:pointerdown={(event) => startHandle(event, 'scale')}
            on:pointermove={moveHandle} on:pointerup={endHandle} on:pointercancel={endHandle}>⤢</button>
    {:else}
        <div class="mask-ring" class:off={!draft.maskVisible}
            style="width: {maskRadiusPx * 2}px; height: {maskRadiusPx * 2}px;"></div>
        <button class="grip mask-grip"
            style="left: {maskGripX}px; top: {frameHeight / 2}px;"
            title="Maskenradius ändern" aria-label="Maskenradius ändern"
            on:pointerdown={(event) => startHandle(event, 'mask')}
            on:pointermove={moveHandle} on:pointerup={endHandle} on:pointercancel={endHandle}>◉</button>
    {/if}

    <div class="top-tools" bind:clientHeight={topToolsHeight}>
        <div class="mode-tools" role="group" aria-label="Bearbeitungsmodus">
            <button class:active={mode === 'image'} aria-pressed={mode === 'image'}
                on:click={() => selectMode('image')} disabled={calibrating}>Bild</button>
            <button class:active={mode === 'mask'} aria-pressed={mode === 'mask'}
                on:click={() => selectMode('mask')} disabled={calibrating}>Maske</button>
        </div>
        <div class="auto-tools">
            <button class="auto-button" on:click={autoAlign} disabled={calibrating || !video}
                aria-label="Dartboard automatisch ausrichten" title="Dartboard automatisch ausrichten">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m4 20 12-12" /><path d="m14 4 1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
                    <path d="m19 11 .5-1 .5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5Z" />
                    <path d="m3 6 .5-1L4 6l1 .5-1 .5-.5 1L3 7l-1-.5L3 6Z" />
                </svg>
                {#if calibrating}
                    <span>Ausrichtung läuft …</span>
                {:else}
                    <span class="auto-label-full">Automatisch ausrichten</span>
                    <span class="auto-label-short">Auto ausrichten</span>
                    <span class="auto-label-tiny">Auto</span>
                {/if}
            </button>
        </div>
        <div class="utility-tools">
            <button on:click={undo} disabled={(!history.length && !wheelBefore) || calibrating}
                title="Letzten Schritt rückgängig machen" aria-label="Letzten Schritt rückgängig machen">↶</button>
            <button class:active={showExtras} aria-expanded={showExtras} aria-label="Extras" title="Extras"
                on:click={() => { finishInput(); showExtras = !showExtras; }} disabled={calibrating}>
                <span class="extras-label">Extras</span><span class="extras-icon" aria-hidden="true">⋯</span>
            </button>
        </div>
        {#if message}<p class="auto-status" role="status">{message}</p>{/if}
    </div>

    {#if showExtras}
        <div class="extras"
            style="top: {extrasTop}px; max-height: max(0px, calc(100% - {extrasTop + extrasBottom}px));">
            <section class="extras-section" aria-label="Perspektive und Verzerrung">
                <h3>Perspektive &amp; Verzerrung</h3>
                <label>Breite: {draft.scaleX.toFixed(2)}
                    <input type="range" min="0.5" max="3" step="0.01" value={draft.scaleX}
                        on:input={(event) => input('scaleX', event)} on:change={finishInput} /></label>
                <label>Höhe: {draft.scaleY.toFixed(2)}
                    <input type="range" min="0.5" max="3" step="0.01" value={draft.scaleY}
                        on:input={(event) => input('scaleY', event)} on:change={finishInput} /></label>
                <label>Perspektive: {draft.perspective}px
                    <input type="range" min="0" max="2000" step="10" value={draft.perspective}
                        on:input={(event) => input('perspective', event)} on:change={finishInput} /></label>
                <label>Neigung X: {draft.rotateX}°
                    <input type="range" min="-80" max="80" value={draft.rotateX}
                        on:input={(event) => input('rotateX', event)} on:change={finishInput} /></label>
                <label>Neigung Y: {draft.rotateY}°
                    <input type="range" min="-80" max="80" value={draft.rotateY}
                        on:input={(event) => input('rotateY', event)} on:change={finishInput} /></label>
                <label>Schräg X: {draft.skewX}°
                    <input type="range" min="-60" max="60" value={draft.skewX}
                        on:input={(event) => input('skewX', event)} on:change={finishInput} /></label>
                <label>Schräg Y: {draft.skewY}°
                    <input type="range" min="-60" max="60" value={draft.skewY}
                        on:input={(event) => input('skewY', event)} on:change={finishInput} /></label>
                <button on:click={() => change({
                    scale: 1, scaleX: 1, scaleY: 1, rotate: 0, panX: 0, panY: 0, x: 0, y: 0,
                    perspective: defaultCamSettings.perspective, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0,
                })}>
                    Manuelle Korrektur zurücksetzen
                </button>
            </section>
            <section class="extras-section" aria-label="Bildfilter">
                <h3>Bildfilter</h3>
                <label>Helligkeit: {draft.brightness}%
                    <input type="range" min="0" max="200" value={draft.brightness}
                        on:input={(event) => input('brightness', event)} on:change={finishInput} /></label>
                <label>Kontrast: {draft.contrast}%
                    <input type="range" min="0" max="200" value={draft.contrast}
                        on:input={(event) => input('contrast', event)} on:change={finishInput} /></label>
                <label>Sättigung: {draft.saturate}%
                    <input type="range" min="0" max="200" value={draft.saturate}
                        on:input={(event) => input('saturate', event)} on:change={finishInput} /></label>
                <label>Schärfe: {draft.sharpness}
                    <input type="range" min="0" max="100" value={draft.sharpness}
                        on:input={(event) => input('sharpness', event)} on:change={finishInput} /></label>
            </section>
        </div>
    {/if}

    <div class="bottom-tools" bind:clientHeight={bottomToolsHeight}>
        {#if mode === 'image' && !showExtras}
            <div class="adjust-tools" role="group" aria-label="Bild fein einstellen">
                <div class="adjust-group" role="group" aria-label="Größe">
                    <span>Größe</span>
                    <div class="adjust-buttons">
                        <button title="Verkleinern" aria-label="Verkleinern" disabled={calibrating}
                            on:click={() => change({ scale: clamp(draft.scale / 1.08, 0.3, 4) })}>−</button>
                        <button title="Vergrößern" aria-label="Vergrößern" disabled={calibrating}
                            on:click={() => change({ scale: clamp(draft.scale * 1.08, 0.3, 4) })}>+</button>
                    </div>
                </div>
                <div class="adjust-group" role="group" aria-label="Drehung">
                    <span>Drehung</span>
                    <div class="adjust-buttons">
                        <button title="Links drehen" aria-label="Links drehen" disabled={calibrating}
                            on:click={() => change({ rotate: draft.rotate - 5 })}>⟲</button>
                        <button title="Rechts drehen" aria-label="Rechts drehen" disabled={calibrating}
                            on:click={() => change({ rotate: draft.rotate + 5 })}>⟳</button>
                    </div>
                </div>
            </div>
        {:else if mode === 'mask' && !showExtras}
            <div class="mask-tools" role="group" aria-label="Maske einstellen">
                <button class="mask-toggle" class:active={draft.maskVisible} role="switch"
                    aria-checked={draft.maskVisible} disabled={calibrating}
                    on:click={() => change({ maskVisible: !draft.maskVisible })}>
                    Maske {draft.maskVisible ? 'an' : 'aus'}
                </button>
                <label class="mask-slider"><span>Radius</span>
                    <input type="range" min="10" max="100" value={draft.maskRadius} disabled={calibrating}
                        on:input={(event) => input('maskRadius', event)} on:change={finishInput} />
                    <output>{draft.maskRadius}%</output>
                </label>
                <label class="mask-slider"><span>Kante</span>
                    <input type="range" min="0" max="50" value={draft.maskFeather} disabled={calibrating}
                        on:input={(event) => input('maskFeather', event)} on:change={finishInput} />
                    <output>{draft.maskFeather}%</output>
                </label>
            </div>
        {/if}
        <div class="decision-tools">
            <button on:click={() => dispatch('cancel')}>Abbrechen</button>
            <button class="apply" on:click={apply} disabled={calibrating}>Übernehmen</button>
        </div>
    </div>
</div>

<style>
    .editor {
        position: absolute;
        z-index: 200;
        inset: 0;
        overflow: hidden;
        box-shadow: inset 0 0 0 2px var(--color-brand);
        color: var(--color-text);
    }

    .gesture-layer { position: absolute; inset: 0; touch-action: none; cursor: move; }
    .gesture-layer.inactive { pointer-events: none; }

    .target-ring,
    .mask-ring {
        position: absolute;
        top: 50%;
        left: 50%;
        box-sizing: border-box;
        transform: translate(-50%, -50%);
        border: 2px dashed rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        box-shadow: 0 0 0 1px var(--color-background);
        pointer-events: none;
    }

    .mask-ring { border-color: var(--color-brand-text); }
    .mask-ring.off { opacity: 0.55; border-style: dotted; }

    button {
        min-width: 42px;
        min-height: 42px;
        padding: 0 10px;
        border: 1px solid #777b7e;
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.94);
        color: var(--color-text);
        font: 600 13px/1.2 var(--font-body);
        cursor: pointer;
    }

    button:hover:not(:disabled),
    button:focus-visible {
        border-color: var(--color-brand-text);
        background: var(--color-surface-raised);
    }

    button:disabled { opacity: 0.48; cursor: not-allowed; }
    button.active { border-color: var(--color-brand-text); background: var(--color-brand-active); }

    .grip {
        position: absolute;
        z-index: 2;
        padding: 0;
        transform: translate(-50%, -50%);
        touch-action: none;
        font-size: 25px;
        font-weight: 700;
    }

    .mask-grip { border-color: var(--color-brand-text); }

    .top-tools {
        position: absolute;
        z-index: 3;
        top: 8px;
        right: 8px;
        left: 8px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas: 'modes magic utilities' 'status status status';
        align-items: start;
        gap: 6px;
        pointer-events: none;
    }

    .top-tools > * { pointer-events: auto; }
    .top-tools button { padding: 0 8px; }
    .mode-tools { grid-area: modes; display: flex; gap: 4px; }
    .mode-tools button { min-width: 54px; }
    .utility-tools { grid-area: utilities; display: flex; gap: 4px; justify-self: end; }
    .extras-icon { display: none; font-size: 23px; line-height: 1; }
    .auto-tools { grid-area: magic; min-width: 0; }

    .auto-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        border-color: var(--color-brand);
        background: var(--color-brand);
        font-weight: 700;
        white-space: nowrap;
    }

    .auto-button:hover:not(:disabled),
    .auto-button:focus-visible { background: var(--color-brand-hover); }
    .auto-button svg { flex: none; }
    .auto-label-short, .auto-label-tiny { display: none; }

    .auto-status {
        grid-area: status;
        max-height: 72px;
        overflow: auto;
        margin: 0;
        padding: 7px 10px;
        border: 1px solid var(--color-brand-text);
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.96);
        font-size: 12px;
        line-height: 1.4;
    }

    .extras {
        position: absolute;
        z-index: 4;
        right: 8px;
        display: grid;
        align-content: start;
        gap: 16px;
        width: min(320px, calc(100% - 16px));
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 12px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: rgba(34, 36, 38, 0.98);
        box-shadow: var(--shadow-panel);
        font-size: 13px;
    }

    .extras-section { display: grid; gap: 8px; min-width: 0; }
    .extras-section + .extras-section { padding-top: 12px; border-top: 1px solid var(--color-border); }
    .extras h3 { margin: 0; font: 600 17px/1.2 var(--font-display); text-transform: uppercase; }
    .extras label { display: grid; gap: 2px; color: var(--color-text-secondary); }
    .extras input[type="range"] { width: 100%; min-height: 40px; margin: 0; accent-color: var(--color-brand); }
    .extras button { font-size: 12px; }

    .bottom-tools {
        position: absolute;
        z-index: 3;
        right: 8px;
        bottom: 8px;
        left: 8px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
        gap: 6px;
        pointer-events: none;
    }

    .bottom-tools > div { pointer-events: auto; }
    .bottom-tools button { padding: 0 8px; }
    .adjust-tools, .mask-tools { display: flex; flex-wrap: wrap; align-items: end; gap: 6px; min-width: 0; }

    .adjust-group {
        display: grid;
        gap: 3px;
        padding: 5px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.94);
    }

    .adjust-group span { color: var(--color-text-secondary); font-size: 11px; text-align: center; }
    .adjust-buttons { display: flex; gap: 4px; }
    .adjust-buttons button { font-size: 22px; }
    .mask-toggle { white-space: nowrap; }

    .mask-slider {
        display: grid;
        grid-template-columns: 42px minmax(60px, 1fr) 33px;
        align-items: center;
        gap: 4px;
        flex: 1 1 172px;
        min-width: 0;
        min-height: 42px;
        padding: 0 6px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.94);
        font-size: 12px;
    }

    .mask-slider input { width: 100%; min-width: 0; min-height: 40px; margin: 0; accent-color: var(--color-brand); }
    .mask-slider output { text-align: right; }
    .decision-tools { display: flex; flex-wrap: wrap; gap: 4px; justify-self: end; }
    .bottom-tools .apply { border-color: var(--color-brand); background: var(--color-brand); }
    .bottom-tools .apply:hover:not(:disabled),
    .bottom-tools .apply:focus-visible { background: var(--color-brand-hover); }

    .editor.compact .top-tools {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas: 'modes utilities' 'magic magic' 'status status';
    }

    .editor.compact .mode-tools button { min-width: 42px; }
    .editor.compact .auto-label-full { display: none; }
    .editor.compact .auto-label-short { display: inline; }
    .editor.compact .bottom-tools { grid-template-columns: minmax(0, 1fr); }
    .editor.compact .adjust-group { padding: 2px; }
    .editor.compact .adjust-buttons { gap: 0; }
    .editor.compact .decision-tools { justify-self: end; }
    .editor.narrow .extras-label { display: none; }
    .editor.narrow .extras-icon { display: inline; }
    .editor.tiny .top-tools { grid-template-areas: 'modes modes' 'utilities utilities' 'magic magic' 'status status'; }
    .editor.tiny .auto-label-short { display: none; }
    .editor.tiny .auto-label-tiny { display: inline; }
    .editor.tiny .mask-slider { flex-basis: 100%; }
    .editor.micro .mask-slider { grid-template-columns: minmax(0, 1fr) auto; padding-top: 4px; }
    .editor.micro .mask-slider input { grid-column: 1 / -1; grid-row: 2; }
    .editor.micro .decision-tools { width: 100%; }
    .editor.micro .decision-tools button { flex: 1 1 100%; }
</style>
