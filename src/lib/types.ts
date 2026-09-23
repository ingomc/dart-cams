export interface CamSetting {
    autoAlignment?: BoardAlignment;
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

/** Coordinates are relative to the raw camera frame, before CSS transforms. */
export interface BoardAlignment {
    sourceWidth: number;
    sourceHeight: number;
    centerX: number;
    centerY: number;
    majorRadius: number;
    minorRadius: number;
    majorAngle: number;
    /** Projected bull position; older saved alignments may omit it. */
    bullX?: number;
    bullY?: number;
    /** Angle of the 20 in ellipse-normalized coordinates, or null if unreadable. */
    topAngle: number | null;
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
