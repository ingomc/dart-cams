<script lang="ts">
    import type { MatchData } from '../types';
    import { displayAverage, displayNumber } from '../scoring';
    import { isWinner } from '../scoringCelebration';

    export let data: MatchData;
    export let stale = false;
</script>

<div class="scoreboard" class:stale aria-label="Board {data.match.board ?? '–'}: Live-Scoring{stale ? ', letzter Stand' : ''}">
    {#each [0, 1] as index}
        {@const player = data.match.matchPlayers[index]}
        {@const winner = isWinner(player?.points)}
        {@const average = displayAverage(player)}
        <div class="player-row" class:active={data.match.currentplayerIndex === index}>
            <span class="player-name" title={player?.playerName || 'Unbekannt'}>
                {#if data.match.currentplayerIndex === index}<span class="sr-only">Am Wurf: </span>{/if}
                {player?.playerName || 'Unbekannt'}
            </span>
            <span class="stat average" aria-label="3-Dart-Average {average}">Ø {average}</span>
            <span class="stat legs" aria-label="Gewonnene Legs {displayNumber(player?.legs)}">{displayNumber(player?.legs)}</span>
            <span class="stat last-score" aria-label="Letzter Wurf {displayNumber(player?.lastScore)}">{displayNumber(player?.lastScore)}</span>
            <span class="stat remaining" class:winner aria-label={winner ? `${player?.playerName || 'Unbekannt'}: Sieger` : `Restscore ${displayNumber(player?.points)}`}>
                <strong>{winner ? 'Sieger' : displayNumber(player?.points)}</strong>
            </span>
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
        grid-template-columns: minmax(0, 1fr) 54px 20px 28px 48px;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        padding: 3px 8px;
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
        font-variant-numeric: tabular-nums;
        line-height: 1;
        text-align: right;
        white-space: nowrap;
    }

    .average {
        color: var(--color-text-secondary);
        font-size: 11px;
    }

    .legs {
        padding: 2px 0;
        border: 1px solid var(--color-border);
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.06);
        font: 600 13px/1 var(--font-display);
        text-align: center;
    }

    .last-score {
        color: var(--color-text-muted);
        font: 500 15px/1 var(--font-display);
    }

    .remaining strong {
        font: 600 20px/1 var(--font-display);
    }

    .remaining.winner strong {
        color: #ffd76a;
        font-size: 18px;
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
