import React from 'react';
import {
  Car,
  Flag,
  Globe,
  Play,
  Settings,
  Trophy,
} from 'lucide-react';
import { ActiveMenuOverlay, PlayerProfile, RaceConfig } from '../types/game';
import { getCarSpec } from '../game/carsCatalog';
import { getTrack } from '../game/tracks';

interface TitleScreenProps {
  profile: PlayerProfile;
  raceConfig: RaceConfig;
  onStartPlay: () => void;
  onOpenOverlay: (overlay: ActiveMenuOverlay) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  profile,
  raceConfig,
  onStartPlay,
  onOpenOverlay,
}) => {
  const car = getCarSpec(profile.selectedCarId);
  const track = getTrack(raceConfig.trackId);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      {/* Subtle left-side contrast scrim over live 3D flyover */}
      <div
        className="fixed inset-y-0 left-0 w-full md:w-[520px] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(9,11,16,0.92) 0%, rgba(9,11,16,0.72) 65%, rgba(9,11,16,0) 100%)',
        }}
      />

      {/* Top row: Driver summary on right */}
      <div className="relative z-10 flex items-start justify-between">
        {/* Custom Inline SVG Racing Brand Lockup */}
        <div className="pointer-events-auto">
          <svg
            viewBox="0 0 360 76"
            className="w-[290px] md:w-[360px] h-auto"
            aria-label="Apex Horizon"
          >
            <polygon points="0,12 24,12 14,62 0,62" fill="#ef4444" />
            <polygon points="28,12 40,12 30,62 18,62" fill="#06b6d4" />
            <text
              x="54"
              y="40"
              fill="#f8fafc"
              fontFamily="'Chakra Petch', sans-serif"
              fontWeight="700"
              fontStyle="italic"
              fontSize="36"
              letterSpacing="2"
            >
              APEX HORIZON
            </text>
            <text
              x="56"
              y="60"
              fill="#94a3b8"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              fontWeight="600"
              fontSize="12"
              letterSpacing="3.5"
            >
              OPEN-WORLD &amp; CIRCUIT RACING
            </text>
          </svg>
        </div>

        <div className="pointer-events-auto hidden sm:flex items-center gap-4 px-4 py-2.5 rounded-lg bg-[#0c1018]/90 border border-white/10 text-sm">
          <span className="font-semibold text-zinc-100">{profile.playerName}</span>
          <span className="text-zinc-500" aria-hidden="true">·</span>
          <span className="text-zinc-300">Lv.{profile.level}</span>
          <span className="text-zinc-500" aria-hidden="true">·</span>
          <span className="font-mono-num font-bold text-cyan-400">
            {profile.credits.toLocaleString()} CR
          </span>
        </div>
      </div>

      {/* Main Left-Third Menu Column */}
      <div className="relative z-10 max-w-sm my-auto pointer-events-auto space-y-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-cyan-400 tracking-wider uppercase">
            Selected Vehicle &amp; Event
          </p>
          <h2 className="font-display text-2xl font-bold text-white tracking-tight">
            {car.name}
          </h2>
          <p className="text-sm text-zinc-400 capitalize">
            {track.name} · {raceConfig.mode.replace('_', ' ')}
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            data-start="true"
            onClick={onStartPlay}
            className="w-full flex items-center justify-between px-6 py-4 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-display text-lg font-bold tracking-wide transition-colors shadow-lg shadow-red-950/50 cursor-pointer whitespace-nowrap"
          >
            <span className="flex items-center gap-3">
              <Play className="w-5 h-5 fill-current" />
              Drive Now
            </span>
            <span className="text-xs font-sans font-semibold text-red-100 opacity-85">
              Enter
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onOpenOverlay('modes')}
              className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[#111622]/95 hover:bg-[#1a2233] border border-white/10 text-zinc-100 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Flag className="w-4 h-4 text-red-400 shrink-0" />
              Race Modes
            </button>

            <button
              type="button"
              onClick={() => onOpenOverlay('garage')}
              className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[#111622]/95 hover:bg-[#1a2233] border border-white/10 text-zinc-100 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Car className="w-4 h-4 text-cyan-400 shrink-0" />
              Garage
            </button>

            <button
              type="button"
              onClick={() => onOpenOverlay('multiplayer')}
              className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[#111622]/95 hover:bg-[#1a2233] border border-white/10 text-zinc-100 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
              Multiplayer
            </button>

            <button
              type="button"
              onClick={() => onOpenOverlay('leaderboard')}
              className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[#111622]/95 hover:bg-[#1a2233] border border-white/10 text-zinc-100 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              Leaderboard
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenOverlay('settings')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0d111a]/90 hover:bg-[#171e2d] border border-white/10 text-zinc-300 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            <Settings className="w-4 h-4 text-zinc-400" />
            Settings &amp; Controls
          </button>
        </div>
      </div>

      {/* Bottom Safe Margin Control Hint */}
      <div className="relative z-10 flex items-center justify-between text-xs text-zinc-400">
        <span>
          WASD / Arrows Drive · Space Handbrake · Shift Nitro · C Camera · Esc Pause
        </span>
      </div>
    </div>
  );
};
