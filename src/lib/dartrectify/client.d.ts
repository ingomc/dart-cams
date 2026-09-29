export interface BoardStatus {
  output_radius?: number; output_side?: number; darts?: DartStatus;
  id: 'home' | 'guest'; label: string; ready: boolean; status: string;
  calibrated: boolean; orientation_confirmed: boolean; demo: boolean;
  source_age_ms: number; capture_sequence: number; calibration_revision: number;
  generation: number; warp_ms: number; encode_ms: number; encoded_frames: number;
  dropped_pending: number; viewers: number; jpeg_bytes: number;
  streams: Array<{id: string; send_age_ms: number; sequence: number}>;
}
export interface DartHit {
  id: number; x: number; y: number; raw_x: number; raw_y: number;
  label: string; segment: number; multiplier: number; points: number;
  estimated: boolean; manual: boolean; uncertainty: number; capture_sequence: number;
}
export interface DartStatus {
  phase: 'paused' | 'needs_reference' | 'capturing_reference' | 'ready' | 'motion' | 'settling' | 'round_complete' | 'clearing' | 'obstructed';
  round: number; version: number; calibration_revision: number; capture_sequence: number;
  processing_ms: number; hits: DartHit[];
}
/** Same-origin POST /api/v1/boards/home/darts/{reference|reset|correct|add}.
 * Requires Bearer token, application/json; corrections/additions also require x/y.
 * HTTP 409 means the snapshot is stale or the detector cannot accept this command.
 */
export interface DartCommand {
  round: number; version: number; calibration_revision: number;
  x?: number; y?: number; hit?: number;
}
export interface ServerStatus {
  version: string; transport: 'mjpeg'; stream_fps_limit: number;
  stale_after_ms: number; boards: BoardStatus[];
}
export class DartRectifyClient {
  constructor(options: {
    baseUrl?: string; token: string; home?: HTMLImageElement; guest?: HTMLImageElement;
    onStatus?: (status: ServerStatus) => void; onError?: (error: Error) => void;
  });
  start(): void;
  stop(): void;
  destroy(): void;
}
