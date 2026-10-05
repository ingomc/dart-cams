<script lang="ts">
    import type { MatchData } from '../types';
    import { displayAverage, displayNumber } from '../scoring';
    import { isWinner } from '../scoringCelebration';
    import { TextMorph } from 'torph/svelte';

    export let data: MatchData;
    export let stale = false;
    export let scale = 100;
</script>

<div class="scoreboard" class:stale aria-label="Board {data.match.board ?? '–'}: Live-Scoring{stale ? ', letzter Stand' : ''}"
    style:--score-scale={scale / 100}>
    {#each [0, 1] as index}
        {@const player = data.match.matchPlayers[index]}
        {@const winner = isWinner(player?.points)}
        {@const average = displayAverage(player)}
        {@const remaining = displayNumber(player?.points)}
        <div class="player-row" class:active={data.match.currentplayerIndex === index}>
            <span class="player-name" title={player?.playerName || 'Unbekannt'}>
                {#if data.match.currentplayerIndex === index}<span class="sr-only">Am Wurf: </span>{/if}
                {player?.playerName || 'Unbekannt'}
            </span>
            <span class="stat average" aria-label="3-Dart-Average {average}">Ø {average}</span>
            <span class="stat legs" aria-label="Gewonnene Legs {displayNumber(player?.legs)}">{displayNumber(player?.legs)}</span>
            <span class="stat last-score" aria-label="Letzter Wurf {displayNumber(player?.lastScore)}">{displayNumber(player?.lastScore)}</span>
            <span class="stat remaining" class:winner aria-label={winner ? `${player?.playerName || 'Unbekannt'}: Sieger` : `Restscore ${remaining}`}>
                <strong>
                    {#if winner}
                        Sieger
                    {:else if remaining === '–'}
                        {remaining}
                    {:else}
                        {#key `${data.match.matchKey ?? ''}/${data.match.board ?? ''}/${player?.playerName ?? ''}/${scale}`}
                            <TextMorph text={remaining} duration={180} ease="ease-out" scale={false} respectReducedMotion={true} locale="de" />
                        {/key}
                    {/if}
                </strong>
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
        grid-template-columns: minmax(0, 20ch) calc(54px * var(--score-scale)) calc(20px * var(--score-scale))
            calc(28px * var(--score-scale)) calc(48px * var(--score-scale));
        align-items: center;
        gap: calc(6px * var(--score-scale));
        min-height: calc(28px * var(--score-scale));
        padding: calc(3px * var(--score-scale)) calc(8px * var(--score-scale));
        border-left: calc(3px * var(--score-scale)) solid transparent;
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
        font-size: calc(12px * var(--score-scale));
        font-weight: 700;
        line-height: 1.2;
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
        font-size: calc(11px * var(--score-scale));
    }

    .legs {
        padding: calc(2px * var(--score-scale)) 0;
        border: 1px solid var(--color-border);
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.06);
        font: 600 calc(13px * var(--score-scale))/1 var(--font-display);
        text-align: center;
    }

    .last-score {
        color: var(--color-text-muted);
        font: 500 calc(15px * var(--score-scale))/1 var(--font-display);
    }

    .remaining strong {
        font: 600 calc(20px * var(--score-scale))/1 var(--font-display);
    }

    .remaining.winner strong {
        color: #ffd76a;
        font-size: calc(18px * var(--score-scale));
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
