<script lang="ts">
    import type { MatchData } from "../types";

    export let data: MatchData;
</script>

<div class="scoreboard">
    <div class="match-info">
        {data.match.groupName} - {data.match.roundName} ({data.match.mode})
    </div>
    <div class="players">
        {#each data.match.matchPlayers as player}
            <div class="player">
                <div class="name">{player.playerName}</div>
                <div class="score">{player.points}</div>
                <div class="stats">
                    Sets: {player.sets} | Legs: {player.legs}
                </div>
                {#if player.lastScore}
                    <div class="last-score">Last: {player.lastScore}</div>
                {/if}
            </div>
        {/each}
    </div>
</div>

<style>
    .scoreboard {
        background: rgba(0, 0, 0, 0.85);
        border: 1px solid #444;
        border-radius: 8px;
        padding: 10px;
        color: white;
        display: flex;
        flex-direction: column;
        gap: 5px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
        pointer-events: none; /* Allow dragging via parent */
    }

    .match-info {
        font-size: 0.8rem;
        color: #aaa;
        text-align: center;
        margin-bottom: 5px;
    }

    .players {
        display: flex;
        gap: 20px;
    }

    .player {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 100px;
    }

    .player .name {
        font-weight: bold;
        font-size: 1.1rem;
        margin-bottom: 5px;
    }

    .player .score {
        font-size: 2.5rem;
        font-weight: bold;
        color: #fff;
        line-height: 1;
    }

    .player .stats {
        font-size: 0.9rem;
        color: #ccc;
    }

    .player .last-score {
        font-size: 0.8rem;
        color: #ffd700;
        margin-top: 2px;
    }
</style>
