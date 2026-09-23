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

<div class="scoreboard" aria-label="Live-Score Board {data.match.board ?? ''}">
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
        box-sizing: border-box;
        padding: 5px 8px 6px;
        color: white;
        background: rgba(8, 12, 18, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 9px;
        box-shadow: 0 5px 14px rgba(0, 0, 0, 0.5);
        pointer-events: none;
    }
    .heading { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: start; gap: 6px; }
    .opponent { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 750; font-size: clamp(0.72rem, 1.3vw, 0.92rem); }
    .opponent:last-child { text-align: right; }
    .event-score { display: flex; flex-direction: column; align-items: center; white-space: nowrap; line-height: 1.05; }
    .event-score strong { font-size: 1rem; }
    .event-score small { color: #bfc9d3; font-size: 0.62rem; }
    .players { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .player { min-width: 0; text-align: center; }
    .player + .player { border-left: 1px solid #49505b; padding-left: 6px; }
    .player.active .score { color: #82dda8; }
    .score { font-size: clamp(1.65rem, 3.3vw, 2.2rem); font-weight: 800; line-height: 1; }
    .throw-stats { color: #d0d6dd; font-size: 0.7rem; white-space: nowrap; }
    .throw-stats strong { color: white; }
    .title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; border-top: 1px solid #49505b; margin-top: 3px; padding-top: 3px; text-align: center; color: #cbd3db; font-size: 0.68rem; line-height: 1.15; }
</style>
