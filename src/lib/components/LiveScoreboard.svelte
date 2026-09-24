<script lang="ts">
    import type { MatchData } from '../types';
    import { displayLegDarts, displayNumber } from '../scoring';

    export let data: MatchData;
    export let stale = false;
</script>

<div class="scoreboard" class:stale aria-label="Board {data.match.board ?? '–'}: Live-Scoring{stale ? ', letzter Stand' : ''}">
    {#each [0, 1] as index}
        {@const player = data.match.matchPlayers[index]}
        <div class="player-row" class:active={data.match.currentplayerIndex === index}>
            <span class="player-name" title={player?.playerName || 'Unbekannt'}>
                {#if data.match.currentplayerIndex === index}<span class="sr-only">Am Wurf: </span>{/if}
                {player?.playerName || 'Unbekannt'}
            </span>
            <span class="stat"><small>Darts</small><strong>{displayLegDarts(player?.darts)}</strong></span>
            <span class="stat"><small>Letzte</small><strong>{displayNumber(player?.lastScore)}</strong></span>
            <span class="stat remaining"><small>Rest</small><strong>{displayNumber(player?.points)}</strong></span>
        </div>
    {/each}
</div>

<style>
    .scoreboard {
        width: 100%;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.32);
        border-radius: var(--radius-sm);
        background: rgba(21, 23, 25, 0.88);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        color: var(--color-text);
        pointer-events: none;
    }

    .scoreboard.stale {
        border-color: var(--color-warning);
    }

    .player-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 36px 42px 48px;
        align-items: center;
        gap: 8px;
        min-height: 43px;
        padding: 4px 8px;
        border-left: 3px solid transparent;
    }

    .player-row + .player-row {
        border-top: 1px solid rgba(255, 255, 255, 0.12);
    }

    .player-row.active {
        border-left-color: var(--color-brand-text);
        background: rgba(190, 8, 38, 0.13);
    }

    .player-name {
        min-width: 0;
        overflow: hidden;
        font-size: 12px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .stat {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        line-height: 1.05;
        white-space: nowrap;
    }

    .stat small {
        color: var(--color-text-secondary);
        font-size: 9px;
    }

    .stat strong {
        margin-top: 3px;
        font: 600 16px/1 var(--font-display);
    }

    .remaining strong {
        font-size: 22px;
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }
</style>
