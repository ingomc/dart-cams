export interface CamSetting {
    autoAlignment?: BoardAlignment;
    scale: number;
    scaleX: number;
    scaleY: number;
    rotate: number;
    x: number;
    y: number;
    /** Manual pan as a fraction of the visible camera frame. Legacy x/y remain readable. */
    panX?: number;
    panY?: number;
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
    /** Darts thrown in the current leg; the feed also provides dartsTotal for the match. */
    darts: number | string;
    dartsTotal?: number;
    avg?: number | string;
    average?: number | string;
    scoreTotal?: number;
    scoreAdditional?: number;
    dartsAdditional?: number;
    lastScore: number;
}

export interface MatchData {
    match: {
        matchKey?: string; // Added optional matchKey as it was used in code
        matchPlayers: MatchPlayer[];
        mode: string;
        roundName: string;
        groupName: string;
        board?: number | string;
        vbName?: string;
        typ?: string;
        teamParentMatchName?: string;
        lastUpdate?: string;
        setsHome?: number;
        setsGuest?: number;
        legsHome?: number;
        legsGuest?: number;
        currentplayerIndex?: number;
    };
}
