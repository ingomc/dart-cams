<script lang="ts">
    import type { MatchData } from '../types';
    import { displayLegDarts, displayNumber } from '../scoring';

    export let data: MatchData;
    export let stale = false;
    $: eventTitle = [
        [data.match.vbName, data.match.groupName].filter(Boolean).join(': '),
        data.match.roundName,
        data.match.mode,
    ].filter(Boolean).join(' · ');
</script>

<div class="scoreboard" class:stale aria-label="Live-Score Board {data.match.board ?? ''}">
    <div class="heading">
        <div class="opponent" title={data.match.matchPlayers[0]?.playerName || 'Unbekannt'}>{data.match.matchPlayers[0]?.playerName || 'Unbekannt'}</div>
        <div class="event-score" aria-label="Gesamtstand {displayNumber(data.match.setsHome)} zu {displayNumber(data.match.setsGuest)}, Legs {displayNumber(data.match.legsHome)} zu {displayNumber(data.match.legsGuest)}">
            <strong>{displayNumber(data.match.setsHome)}:{displayNumber(data.match.setsGuest)}</strong>
            <small>Legs {displayNumber(data.match.legsHome)}:{displayNumber(data.match.legsGuest)}</small>
        </div>
        <div class="opponent" title={data.match.matchPlayers[1]?.playerName || 'Unbekannt'}>{data.match.matchPlayers[1]?.playerName || 'Unbekannt'}</div>
    </div>
    <div class="players">
        {#each data.match.matchPlayers as player, index}
            <div class="player" class:active={data.match.currentplayerIndex === index}>
                <div class="score" aria-label="Restscore {displayNumber(player.points)}">{displayNumber(player.points)}</div>
                <div class="throw-stats">Darts <strong>{displayLegDarts(player.darts)}</strong> · Letzte <strong>{displayNumber(player.lastScore)}</strong></div>
            </div>
        {/each}
    </div>
    <div class="title" title={eventTitle}>Board {data.match.board ?? '–'} · {eventTitle}{stale ? ' · Letzter Stand' : ''}</div>
</div>

<style>
    .scoreboard {
        width: 100%;
        padding: 7px 10px 8px;
        border: 1px solid rgba(255, 255, 255, 0.42);
        border-top: 3px solid var(--color-brand);
        border-radius: var(--radius-md);
        background: rgba(21, 23, 25, 0.91);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        color: var(--color-text);
        pointer-events: none;
    }

    .scoreboard.stale {
        border-top-color: var(--color-warning);
    }

    .heading {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: start;
        gap: 6px;
    }

    .opponent {
        min-width: 0;
        overflow: hidden;
        font-size: clamp(0.72rem, 1.3vw, 0.92rem);
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .opponent:last-child { text-align: right; }

    .event-score {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.05;
        white-space: nowrap;
    }

    .event-score strong {
        font: 600 18px/1 var(--font-display);
    }

    .event-score small {
        color: var(--color-text-secondary);
        font-size: 10px;
    }

    .players {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        margin-top: 4px;
    }

    .player {
        min-width: 0;
        padding-bottom: 3px;
        text-align: center;
    }

    .player + .player {
        padding-left: 6px;
        border-left: 1px solid var(--color-border);
    }

    .player.active {
        border-bottom: 2px solid var(--color-brand-text);
    }

    .score {
        font: 600 clamp(1.9rem, 3.5vw, 2.7rem)/1 var(--font-display);
    }

    .throw-stats {
        color: var(--color-text-secondary);
        font-size: 11px;
        white-space: nowrap;
    }

    .throw-stats strong {
        color: var(--color-text);
    }

    .title {
        display: -webkit-box;
        overflow: hidden;
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid var(--color-border);
        color: var(--color-text-secondary);
        font-size: 11px;
        line-height: 1.2;
        text-align: center;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
    }
</style>
