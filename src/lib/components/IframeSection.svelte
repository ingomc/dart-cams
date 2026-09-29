<script lang="ts">
    import FloatingWebcam from "$lib/FloatingWebcam.svelte";

    export let scoringUrl: string;
    export let cropTop: number;
    export let cropBottom: number;
    export let iframeZoom: number;
    export let showFloatingWebcam: boolean;
    export let showIframe: boolean;
    export let videoDevices: MediaDeviceInfo[];
</script>

{#if showIframe}
    <section class="iframe-section" aria-label="3K-Live-Ansicht">
        <div class="iframe-heading">
            <strong>3K Live-Ansicht</strong>
            <span>Externer Inhalt</span>
        </div>
        <slot name="overlay"></slot>
        <div class="iframe-wrapper">
            <iframe
                src={scoringUrl}
                title="3K-Live-Ansicht"
                style="
                    margin-top: -{cropTop}px;
                    width: {100 / iframeZoom}%;
                    height: calc((100% + {cropTop}px + {cropBottom}px) / {iframeZoom});
                    transform: scale({iframeZoom});
                    transform-origin: 0 0;
                "
            ></iframe>
        </div>
    </section>
{/if}

<FloatingWebcam bind:visible={showFloatingWebcam} {videoDevices} />

<style>
    .iframe-section {
        position: relative;
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 10%;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-video);
    }

    .iframe-heading {
        position: relative;
        z-index: 1;
        display: flex;
        flex: none;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        min-height: 34px;
        padding: 5px var(--space-3);
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
    }

    .iframe-heading strong {
        font: 600 13px/1.2 var(--font-display);
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .iframe-heading span {
        color: var(--color-text-muted);
        font-size: 11px;
    }

    .iframe-wrapper {
        position: relative;
        flex: 1;
        overflow: hidden;
        background: #fff;
    }

    iframe {
        width: 100%;
        border: 0;
        background: #fff;
    }
</style>
