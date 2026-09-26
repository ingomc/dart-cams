<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type { ScoringCelebration } from '../scoringCelebration';

    export let event: ScoringCelebration | null = null;

    interface Particle {
        x: number;
        y: number;
        vx: number;
        vy: number;
        size: number;
        angle: number;
        spin: number;
        delay: number;
    }

    const colors = ['#ffd76a', '#ffffff', '#f04c62', '#62e5cf', '#a998ff'];
    let canvas: HTMLCanvasElement;
    let active: ScoringCelebration | null = null;
    let handledEvent: ScoringCelebration | null = null;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;

    function stop() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        clearTimeout(timer);
        observer?.disconnect();
        observer = undefined;
        active = null;
        // Release the backing store while idle; no animation loop runs between throws.
        if (canvas) { canvas.width = 0; canvas.height = 0; }
    }

    function celebrate(node: HTMLCanvasElement | undefined, next: ScoringCelebration | null) {
        if (!node) return;
        if (next && next === handledEvent) return;
        if (next) handledEvent = next;
        stop();
        if (!next || document.hidden) return;
        active = next;
        timer = setTimeout(stop, 4200);
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const context = node.getContext('2d');
        if (!context) return;

        let width = 0;
        let height = 0;
        // Limit fill rate on high-DPI displays while two camera streams are running.
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        function resize() {
            const bounds = node!.getBoundingClientRect();
            width = bounds.width;
            height = bounds.height;
            node!.width = Math.round(width * pixelRatio);
            node!.height = Math.round(height * pixelRatio);
        }
        resize();
        if (!width || !height) return;
        observer = new ResizeObserver(resize);
        observer.observe(node);

        // Two volleys from both sides, capped at 280 particles per board.
        // Positions are normalized so resizing a board doesn't stretch their trajectories.
        const count = Math.min(280, Math.max(160, Math.round(width / 3)));
        const groups: Particle[][] = colors.map(() => []);
        for (let index = 0; index < count; index++) {
            const left = index % 2 === 0;
            groups[index % colors.length].push({
                x: left ? 0.03 : 0.97,
                y: 0.72 + Math.random() * 0.12,
                vx: (left ? 1 : -1) * (0.2 + Math.random() * 0.58),
                vy: -(0.65 + Math.random() * 0.8),
                size: 5 + Math.random() * 6,
                angle: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 12,
                delay: (index < count / 2 ? 0 : 0.5) + Math.random() * 0.16,
            });
        }

        const start = performance.now();
        let previous = start;
        function draw(now: number) {
            const elapsed = (now - start) / 1000;
            if (elapsed >= 4.2) { stop(); return; }
            const delta = Math.min((now - previous) / 1000, 0.034);
            previous = now;
            context!.setTransform(1, 0, 0, 1, 0, 0);
            context!.clearRect(0, 0, node!.width, node!.height);
            context!.globalAlpha = Math.max(0, Math.min(1, (4.1 - elapsed) / 1.2));
            const drag = Math.exp(-1.15 * delta);
            for (const [colorIndex, particles] of groups.entries()) {
                context!.fillStyle = colors[colorIndex];
                for (const particle of particles) {
                    if (elapsed < particle.delay || particle.y > 1.1) continue;
                    particle.vx *= drag;
                    particle.vy += 0.8 * delta;
                    particle.x += particle.vx * delta;
                    particle.y += particle.vy * delta;
                    particle.angle += particle.spin * delta;
                    const cos = Math.cos(particle.angle) * pixelRatio;
                    const sin = Math.sin(particle.angle) * pixelRatio;
                    const flutter = Math.cos(elapsed * 12 + particle.spin);
                    context!.setTransform(cos, sin, -sin * flutter, cos * flutter,
                        particle.x * width * pixelRatio, particle.y * height * pixelRatio);
                    context!.fillRect(-particle.size / 2, -particle.size / 3, particle.size, particle.size * 0.65);
                }
            }
            frame = requestAnimationFrame(draw);
        }
        frame = requestAnimationFrame(draw);
    }

    $: celebrate(canvas, event);

    onMount(() => {
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const hide = () => { if (document.hidden) stop(); };
        document.addEventListener('visibilitychange', hide);
        motion.addEventListener('change', stop);
        return () => {
            document.removeEventListener('visibilitychange', hide);
            motion.removeEventListener('change', stop);
        };
    });
    onDestroy(stop);
</script>

<div class="celebration" class:visible={active !== null} data-kind={active?.kind}>
    <canvas bind:this={canvas} aria-hidden="true"></canvas>
    {#if active}
        {#key active}
            <div class="announcement" role="status">
                <div class="eyebrow">{active.kind === 'checkout' ? 'Game shot' : 'Nice throw'}</div>
                <strong class:checkout={active.kind === 'checkout'}>{active.kind === 'checkout' ? 'Checkout!' : active.kind}</strong>
                <span class="player-name">{active.playerName}</span>
            </div>
        {/key}
    {/if}
</div>

<style>
    .celebration {
        position: absolute;
        z-index: 90;
        inset: 0;
        overflow: hidden;
        visibility: hidden;
        contain: strict;
        pointer-events: none;
        container-type: inline-size;
    }

    .celebration.visible { visibility: visible; }

    canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }

    .announcement {
        position: absolute;
        top: 42%;
        left: 6%;
        width: 88%;
        display: flex;
        flex-direction: column;
        align-items: center;
        color: #ffd76a;
        text-align: center;
        text-shadow: 0 3px 0 #151719, 0 6px 22px rgba(0, 0, 0, 0.8);
        animation: celebrate-score 4.2s both;
    }

    .eyebrow {
        padding: 5px 13px;
        border: 1px solid rgba(255, 215, 106, 0.65);
        border-radius: 999px;
        background: rgba(21, 23, 25, 0.9);
        font: 600 clamp(10px, 2.5cqw, 15px)/1.2 var(--font-display);
        letter-spacing: 0.22em;
        text-transform: uppercase;
    }

    strong {
        font: 700 clamp(64px, 24cqw, 180px)/1.12 var(--font-display);
        letter-spacing: -0.04em;
    }

    strong.checkout {
        font-size: clamp(28px, 13cqw, 100px);
        text-transform: uppercase;
    }

    .player-name {
        max-width: 100%;
        overflow: hidden;
        padding: 6px 15px;
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.92);
        color: #fff;
        font: 600 clamp(12px, 3cqw, 22px)/1.3 var(--font-display);
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    @keyframes celebrate-score {
        0% { opacity: 0; transform: translateY(24px) scale(0.55) rotate(-6deg); }
        8% { opacity: 1; transform: translateY(0) scale(1.08) rotate(2deg); }
        14%, 72% { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
        100% { opacity: 0; transform: translateY(-16px) scale(0.96); }
    }

    @media (prefers-reduced-motion: reduce) {
        .announcement { animation: none; }
    }
</style>
