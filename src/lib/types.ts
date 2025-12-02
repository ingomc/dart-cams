export interface CamSetting {
    scale: number;
    scaleX: number;
    scaleY: number;
    rotate: number;
    x: number;
    y: number;
    perspective: number;
    rotateX: number;
    rotateY: number;
    skewX: number;
    skewY: number;
    maskVisible: boolean;
    maskRadius: number;
    maskFeather: number;
    brightness: number;
    contrast: number;
    saturate: number;
    sharpness: number;
}

export interface CamSettings {
    cam1: CamSetting;
    cam2: CamSetting;
    [key: string]: CamSetting;
}

export interface MatchPlayer {
    playerName: string;
    points: number;
    legs: number;
    sets: number;
    darts: string;
    lastScore: number;
}

export interface MatchData {
    match: {
        matchKey?: string; // Added optional matchKey as it was used in code
        matchPlayers: MatchPlayer[];
        mode: string;
        roundName: string;
        groupName: string;
        board?: number; // Added board as it was used in code
    };
}
