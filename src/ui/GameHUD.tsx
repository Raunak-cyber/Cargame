import React, { useMemo } from 'react';
import { Camera, Pause, Volume2, VolumeX } from 'lucide-react';
import { GameMode, HudTelemetry, TrackId } from '../types/game';
import { getTrack } from '../game/tracks';

interface GameHUDProps {
  telemetry: HudTelemetry;
  mode: GameMode;
  trackId: TrackId;
  countdown: number | null;
  muted: boolean;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onPause: () => void;
}

function formatTimeMs(ms: number): string {
  const totalSec = Math.max(0, ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  telemetry,
  mode,
  trackId,
  countdown,
  muted,
  onCycleCamera,
  onToggleMute,
  onPause,
}) => {
  const track = useMemo(() => getTrack(trackId), [trackId]);

  // Precompute SVG polyline points for corner minimap (-360..360 world coords -> 0..140 SVG space)
  const trackPath = useMemo(() => {
    const mapCoord = (v: number) => ((v + 340) / 680) * 136 + 2;
    return track.waypoints
      .filter((_, idx) => idx % 2 === 0)
      .map((wp) => `${mapCoord(wp.x).toFixed(1)},${mapCoord(wp.z).toFixed(1)}`)
      .join(' ');
  }, [track]);

  const toMap = (v: number) => Math.max(4, Math.min(136, ((v + 340) / 680) * 136 + 2));

  const rpmPct = Math.max(0, Math.min(1, telemetry.rpm / telemetry.maxRpm));
  const arcDash = 220;
  const arcOffset = arcDash * (1 - rpmPct);

  const remainingTimeMs =
    telemetry.timeLimitMs > 0
      ? Math.max(0, telemetry.timeLimitMs - telemetry.elapsedMs)
      : telemetry.elapsedMs;

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6"
      data-testid="game-hud"
    >
      {/* Top Row: Race Info (Left) + Utility Icon Buttons (Right) */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-lg bg-[#090b10]/85 border border-white/10">
          {mode === 'quick_race' || mode === 'multiplayer' ? (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">
                Position
              </div>
              <div className="font-display text-2xl font-bold text-white tabular-nums leading-none">
                P{telemetry.position}
                <span className="text-sm text-zinc-400 font-normal">
                  /{telemetry.totalRacers}
                </span>
              </div>
            </div>
          ) : null}

          {mode !== 'free_roam' && mode !== 'drift_challenge' ? (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">
                Lap
              </div>
              <div className="font-display text-2xl font-bold text-white tabular-nums leading-none">
                {telemetry.lap}
                <span className="text-sm text-zinc-400 font-normal">
                  /{mode === 'time_trial' ? 1 : telemetry.totalLaps}
                </span>
              </div>
            </div>
          ) : null}

          {mode !== 'free_roam' ? (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">
                {telemetry.timeLimitMs > 0 ? 'Time Left' : 'Race Time'}
              </div>
              <div
                className={`font-mono-num text-xl font-bold leading-none ${
                  telemetry.timeLimitMs > 0 && remainingTimeMs < 15000
                    ? 'text-red-400'
                    : 'text-cyan-400'
                }`}
              >
                {formatTimeMs(remainingTimeMs)}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">
                Free Roam
              </div>
              <div className="font-display text-lg font-bold text-zinc-100 leading-none">
                {track.name}
              </div>
            </div>
          )}

          {mode === 'checkpoint_race' || mode === 'quick_race' ? (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">
                Checkpoints
              </div>
              <div className="font-mono-num text-lg font-bold text-zinc-100 leading-none">
                {telemetry.checkpoint}/{telemetry.totalCheckpoints}
              </div>
            </div>
          ) : null}

          {(mode === 'drift_challenge' || telemetry.driftScore > 0) && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">
                Drift Score
              </div>
              <div className="font-mono-num text-xl font-bold text-amber-400 leading-none">
                {telemetry.driftScore.toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* Compact Top-Right Utility Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cycle Camera"
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleCamera();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#090b10]/85 hover:bg-[#171c28] border border-white/10 text-zinc-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Camera className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline capitalize">{telemetry.cameraMode}</span>
            <span className="text-zinc-500">[C]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="p-2 rounded-lg bg-[#090b10]/85 hover:bg-[#171c28] border border-white/10 text-zinc-200 cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Game"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="p-2 rounded-lg bg-[#090b10]/85 hover:bg-[#171c28] border border-white/10 text-zinc-200 cursor-pointer"
          >
            <Pause className="w-4 h-4 text-zinc-200" />
          </button>
        </div>
      </div>

      {/* Transient Center Notices (Countdown / Active Drift Streak / Wrong Way) */}
      <div className="flex flex-col items-center justify-center gap-2">
        {countdown !== null && countdown > 0 && (
          <div className="font-display text-7xl font-bold text-white hud-stroke">
            {countdown}
          </div>
        )}
        {telemetry.wrongWay && (
          <div className="px-5 py-2 rounded-lg bg-red-600/90 text-white font-display text-xl font-bold tracking-widest">
            WRONG WAY
          </div>
        )}
        {telemetry.isDrifting && telemetry.currentDriftPoints > 15 && (
          <div className="px-4 py-1.5 rounded-lg bg-[#090b10]/85 border border-amber-400/40 text-amber-300 font-display text-lg font-bold tabular-nums">
            DRIFT +{Math.round(telemetry.currentDriftPoints)} ×{telemetry.driftMultiplier}
          </div>
        )}
      </div>

      {/* Bottom Row: Minimap (Left) & Speedometer / Tachometer (Right) */}
      <div className="flex items-end justify-between gap-4">
        {/* Corner Minimap */}
        <div className="p-2.5 rounded-lg bg-[#090b10]/85 border border-white/10">
          <svg
            viewBox="0 0 140 140"
            className="w-28 h-28 md:w-36 md:h-36"
            aria-label="Track Minimap"
          >
            <polygon
              points={trackPath}
              fill="none"
              stroke="rgba(148,163,184,0.38)"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            {telemetry.nextCheckpointPos && (
              <circle
                cx={toMap(telemetry.nextCheckpointPos.x)}
                cy={toMap(telemetry.nextCheckpointPos.z)}
                r="4.5"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            )}
            {telemetry.minimapEntities.map((ent) => (
              <circle
                key={ent.id}
                cx={toMap(ent.x)}
                cy={toMap(ent.z)}
                r={ent.kind === 'player' ? 4.5 : 3.2}
                fill={ent.kind === 'player' ? '#06b6d4' : ent.color}
                stroke={ent.kind === 'player' ? '#ffffff' : 'none'}
                strokeWidth="1.2"
              />
            ))}
          </svg>
        </div>

        {/* Speedometer, Tachometer, Gear, Nitro & Integrity */}
        <div className="flex items-center gap-4 px-5 py-3.5 rounded-lg bg-[#090b10]/90 border border-white/10">
          {/* SVG Arc RPM Tachometer + Gear */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-[215deg]">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
                strokeDasharray="220 360"
                strokeLinecap="round"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={rpmPct > 0.84 ? '#ef4444' : '#06b6d4'}
                strokeWidth="8"
                strokeDasharray={`${arcDash} 360`}
                strokeDashoffset={arcOffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-2xl font-bold text-white leading-none">
                {telemetry.gear}
              </span>
              <span className="font-mono-num text-[10px] text-zinc-400 mt-1">
                {Math.round(telemetry.rpm / 100) / 10}k
              </span>
            </div>
          </div>

          {/* Digital Speed & Meters */}
          <div className="min-w-[130px] space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="font-display text-4xl font-bold text-white tabular-nums leading-none"
                data-testid="hud-speed"
              >
                {telemetry.speedKmh}
              </span>
              <span className="text-xs font-semibold text-zinc-400">KM/H</span>
            </div>

            {/* Nitro Bar */}
            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
                <span>Nitro</span>
                <span className="font-mono-num text-cyan-400">{telemetry.nitro}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-[width] duration-75"
                  style={{ width: `${telemetry.nitro}%` }}
                />
              </div>
            </div>

            {/* Chassis Integrity */}
            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
                <span>Chassis</span>
                <span className="font-mono-num text-zinc-300">
                  {Math.max(0, 100 - telemetry.damage)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-150 ${
                    telemetry.damage > 60 ? 'bg-red-500' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.max(0, 100 - telemetry.damage)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
