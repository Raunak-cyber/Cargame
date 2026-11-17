import React, { useEffect, useState } from 'react';
import {
  Check,
  Play,
  Plus,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { TRACKS } from '../game/tracks';
import {
  AudioSettings,
  GameMode,
  GraphicsSettings,
  LeaderboardEntry,
  MultiplayerRoom,
  PlayerProfile,
  RaceConfig,
  RaceResultSummary,
  TimeOfDay,
  TrackId,
  WeatherType,
} from '../types/game';

function formatMs(ms: number | null): string {
  if (!ms) return '--:--.-';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const tenth = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenth}`;
}

export const RaceModesModal: React.FC<{
  config: RaceConfig;
  onLaunch: (next: RaceConfig) => void;
  onClose: () => void;
}> = ({ config, onLaunch, onClose }) => {
  const [draft, setDraft] = useState<RaceConfig>(config);

  const modes: { id: GameMode; name: string; desc: string }[] = [
    { id: 'free_roam', name: 'Free Roam', desc: 'Explore city streets, highways & mountain passes freely' },
    { id: 'quick_race', name: 'Quick Race', desc: 'Wheel-to-wheel circuit battle against AI opponents' },
    { id: 'time_trial', name: 'Time Trial', desc: 'Beat the target lap clock on an open track' },
    { id: 'checkpoint_race', name: 'Checkpoint Race', desc: 'Clear every gate at full speed across laps' },
    { id: 'drift_challenge', name: 'Drift Challenge', desc: 'Chain high-angle drifts within 90 seconds' },
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-3xl rounded-xl bg-[#0b0f18] border border-white/15 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">
            Race Modes &amp; Environment
          </h2>
          <button
            type="button"
            aria-label="Close Race Modes"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto racing-scroll">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
              Select Event Mode
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {modes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, mode: m.id })}
                  className={`text-left p-3.5 rounded-lg border cursor-pointer transition-colors ${
                    draft.mode === m.id
                      ? 'bg-red-600/20 border-red-500 text-white'
                      : 'bg-[#111622] border-white/10 text-zinc-300 hover:bg-[#171e2d]'
                  }`}
                >
                  <div className="font-display font-bold text-sm">{m.name}</div>
                  <div className="text-xs text-zinc-400 mt-1">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
              Circuit / Location
            </h3>
            <div className="grid sm:grid-cols-3 gap-2.5">
              {(Object.keys(TRACKS) as TrackId[]).map((tid) => {
                const t = TRACKS[tid];
                return (
                  <button
                    key={tid}
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, trackId: tid, laps: t.defaultLaps })
                    }
                    className={`text-left p-3.5 rounded-lg border cursor-pointer ${
                      draft.trackId === tid
                        ? 'bg-cyan-500/15 border-cyan-400 text-white'
                        : 'bg-[#111622] border-white/10 text-zinc-300 hover:bg-[#171e2d]'
                    }`}
                  >
                    <div className="font-display font-bold text-sm">{t.name}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {t.lengthLabel} · {t.difficulty}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Time of Day
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['day', 'sunset', 'night', 'cycle'] as TimeOfDay[]).map((tod) => (
                  <button
                    key={tod}
                    type="button"
                    onClick={() => setDraft({ ...draft, timeOfDay: tod })}
                    className={`py-2 rounded-md text-xs font-semibold capitalize border cursor-pointer ${
                      draft.timeOfDay === tod
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : 'bg-[#111622] border-white/10 text-zinc-300'
                    }`}
                  >
                    {tod}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Weather
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['clear', 'fog', 'rain'] as WeatherType[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setDraft({ ...draft, weather: w })}
                    className={`py-2 rounded-md text-xs font-semibold capitalize border cursor-pointer ${
                      draft.weather === w
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : 'bg-[#111622] border-white/10 text-zinc-300'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Laps / AI Grid
              </label>
              <div className="flex gap-2">
                <select
                  aria-label="Laps"
                  value={draft.laps}
                  onChange={(e) =>
                    setDraft({ ...draft, laps: Number(e.target.value) })
                  }
                  className="flex-1 px-2.5 py-2 rounded-md bg-[#111622] border border-white/10 text-xs text-white"
                >
                  {[1, 2, 3, 5].map((l) => (
                    <option key={l} value={l}>
                      {l} {l === 1 ? 'Lap' : 'Laps'}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="AI Opponents"
                  value={draft.aiCount}
                  onChange={(e) =>
                    setDraft({ ...draft, aiCount: Number(e.target.value) })
                  }
                  className="flex-1 px-2.5 py-2 rounded-md bg-[#111622] border border-white/10 text-xs text-white"
                >
                  {[1, 2, 3, 4, 5].map((a) => (
                    <option key={a} value={a}>
                      {a} AI
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-[#080b11] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg bg-[#141925] text-zinc-300 text-sm font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onLaunch(draft)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            Launch Event
          </button>
        </div>
      </div>
    </div>
  );
};

export const MultiplayerModal: React.FC<{
  rooms: MultiplayerRoom[];
  activeRoom: MultiplayerRoom | null;
  socketId: string;
  connected: boolean;
  onCreateRoom: (roomName: string, trackId: TrackId, laps: number) => void;
  onJoinRoom: (roomId: string) => void;
  onLeaveRoom: (roomId: string) => void;
  onToggleReady: (roomId: string, ready: boolean) => void;
  onStartRace: (roomId: string) => void;
  onRefreshRooms: () => void;
  onClose: () => void;
}> = ({
  rooms,
  activeRoom,
  socketId,
  connected,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onStartRace,
  onRefreshRooms,
  onClose,
}) => {
  const [roomName, setRoomName] = useState('Midnight Apex Run');
  const [trackId, setTrackId] = useState<TrackId>('circuit');
  const [laps, setLaps] = useState(3);

  const me = activeRoom?.players.find((p) => p.socketId === socketId);
  const isHost = activeRoom?.hostId === socketId;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-3xl rounded-xl bg-[#0b0f18] border border-white/15 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Multiplayer Lobby
            </h2>
            <p className="text-xs text-zinc-400">
              {connected ? 'Connected to Socket.io Race Server' : 'Connecting to race server...'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Multiplayer"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[74vh] overflow-y-auto racing-scroll">
          {!activeRoom ? (
            <>
              <div className="p-4 rounded-lg bg-[#111622] border border-white/10 space-y-3">
                <h3 className="text-sm font-semibold text-white">Create Race Room</h3>
                <div className="grid sm:grid-cols-4 gap-2.5">
                  <input
                    type="text"
                    aria-label="Room Name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Room Name"
                    className="sm:col-span-2 px-3 py-2 rounded-md bg-[#090c14] border border-white/15 text-sm text-white"
                  />
                  <select
                    aria-label="Multiplayer Track"
                    value={trackId}
                    onChange={(e) => setTrackId(e.target.value as TrackId)}
                    className="px-3 py-2 rounded-md bg-[#090c14] border border-white/15 text-sm text-white"
                  >
                    {(Object.keys(TRACKS) as TrackId[]).map((tid) => (
                      <option key={tid} value={tid}>
                        {TRACKS[tid].name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onCreateRoom(roomName, trackId, laps)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-sm font-semibold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Create
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>Laps:</span>
                  {[1, 2, 3, 5].map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLaps(l)}
                      className={`px-2.5 py-1 rounded border cursor-pointer ${
                        laps === l
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'border-white/10 text-zinc-400'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Active Rooms ({rooms.length})
                  </h3>
                  <button
                    type="button"
                    onClick={onRefreshRooms}
                    className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh
                  </button>
                </div>
                <div className="space-y-2">
                  {rooms.map((r) => (
                    <div
                      key={r.roomId}
                      className="p-3.5 rounded-lg bg-[#111622] border border-white/10 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-display font-bold text-sm text-white">
                          {r.roomName}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {TRACKS[r.trackId]?.name ?? r.trackId} · {r.laps} Laps ·{' '}
                          {r.players.length}/{r.maxPlayers} Drivers · {r.status}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onJoinRoom(r.roomId)}
                        className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Join Room
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-[#111622] border border-white/10">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    {activeRoom.roomName}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {TRACKS[activeRoom.trackId]?.name} · {activeRoom.laps} Laps
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onLeaveRoom(activeRoom.roomId)}
                  className="px-3.5 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 cursor-pointer"
                >
                  Leave Room
                </button>
              </div>

              <div className="space-y-2">
                {activeRoom.players.map((p) => (
                  <div
                    key={p.socketId}
                    className="px-4 py-3 rounded-lg bg-[#101520] border border-white/10 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-white">
                        {p.playerName}
                        {p.socketId === activeRoom.hostId ? ' (Host)' : ''}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold flex items-center gap-1 ${
                        p.ready ? 'text-emerald-400' : 'text-zinc-400'
                      }`}
                    >
                      {p.ready && <Check className="w-3.5 h-3.5" />}
                      {p.ready ? 'Ready' : 'Waiting'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onToggleReady(activeRoom.roomId, !me?.ready)}
                  className="px-5 py-2.5 rounded-lg bg-[#182032] hover:bg-[#222d44] border border-white/15 text-sm font-semibold text-white cursor-pointer"
                >
                  {me?.ready ? 'Unready' : 'Ready Up'}
                </button>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => onStartRace(activeRoom.roomId)}
                    className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm cursor-pointer"
                  >
                    Start Multiplayer Race
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const LeaderboardModal: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?trackId=${encodeURIComponent(trackFilter)}`)
      .then((r) => r.json())
      .then((data) => {
        setEntries(Array.isArray(data) ? data : []);
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [trackFilter]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-3xl rounded-xl bg-[#0b0f18] border border-white/15 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">
            Global Track Leaderboard
          </h2>
          <button
            type="button"
            aria-label="Close Leaderboard"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-white/10 flex gap-2">
          {[
            ['all', 'All Tracks'],
            ['circuit', 'Apex Circuit'],
            ['city_highway', 'Metro Expressway'],
            ['mountain_pass', 'Obsidian Touge'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTrackFilter(id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                trackFilter === id
                  ? 'bg-red-600 text-white'
                  : 'bg-[#121826] text-zinc-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto racing-scroll">
          {loading ? (
            <div className="text-sm text-zinc-400 py-8 text-center">
              Loading leaderboard records...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-zinc-400 py-8 text-center">
              No records posted for this circuit yet.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-zinc-400 border-b border-white/10">
                  <th className="pb-2.5 pr-3">#</th>
                  <th className="pb-2.5 pr-3">Driver</th>
                  <th className="pb-2.5 pr-3">Vehicle</th>
                  <th className="pb-2.5 pr-3">Mode</th>
                  <th className="pb-2.5 pr-3 text-right">Time</th>
                  <th className="pb-2.5 text-right">Drift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries.map((entry, idx) => (
                  <tr key={entry.id} className="text-zinc-200">
                    <td className="py-2.5 pr-3 font-mono-num text-zinc-400">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold text-white">
                      {entry.playerName}
                    </td>
                    <td className="py-2.5 pr-3 text-zinc-300">{entry.carName}</td>
                    <td className="py-2.5 pr-3 text-xs capitalize text-zinc-400">
                      {entry.mode.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono-num text-cyan-400">
                      {formatMs(entry.bestTimeMs)}
                    </td>
                    <td className="py-2.5 text-right font-mono-num text-amber-400">
                      {entry.driftScore.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export const SettingsModal: React.FC<{
  profile: PlayerProfile;
  graphics: GraphicsSettings;
  audio: AudioSettings;
  onUpdateName: (name: string) => void;
  onUpdateGraphics: (g: GraphicsSettings) => void;
  onUpdateAudio: (a: AudioSettings) => void;
  onClose: () => void;
}> = ({
  profile,
  graphics,
  audio,
  onUpdateName,
  onUpdateGraphics,
  onUpdateAudio,
  onClose,
}) => {
  const [nameInput, setNameInput] = useState(profile.playerName);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-xl rounded-xl bg-[#0b0f18] border border-white/15 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">
            Settings &amp; Controls
          </h2>
          <button
            type="button"
            aria-label="Close Settings"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto racing-scroll">
          <div>
            <label
              htmlFor="driver-name-input"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5"
            >
              Driver Callsign
            </label>
            <div className="flex gap-2">
              <input
                id="driver-name-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-[#111622] border border-white/15 text-sm text-white"
              />
              <button
                type="button"
                onClick={() => onUpdateName(nameInput)}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Graphics Quality
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() =>
                    onUpdateGraphics({
                      ...graphics,
                      quality: q,
                      shadows: q !== 'low',
                    })
                  }
                  className={`py-2 rounded-md text-xs font-semibold capitalize border cursor-pointer ${
                    graphics.quality === q
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-[#111622] border-white/10 text-zinc-300'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 pt-1 text-xs text-zinc-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={graphics.shadows}
                  onChange={(e) =>
                    onUpdateGraphics({ ...graphics, shadows: e.target.checked })
                  }
                />
                Dynamic Shadows
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={graphics.particles}
                  onChange={(e) =>
                    onUpdateGraphics({ ...graphics, particles: e.target.checked })
                  }
                />
                Drift Smoke &amp; Sparks
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={graphics.weatherEffects}
                  onChange={(e) =>
                    onUpdateGraphics({
                      ...graphics,
                      weatherEffects: e.target.checked,
                    })
                  }
                />
                Rain &amp; Atmospheric Fog
              </label>
            </div>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Audio Mix
            </h3>
            {(
              [
                ['master', 'Master Volume'],
                ['engine', 'Engine & Exhaust'],
                ['sfx', 'Tires, Nitro & Impacts'],
                ['music', 'Driving Synth Music'],
              ] as [keyof AudioSettings, string][]
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="text-xs text-zinc-300 w-40">{label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={Number(audio[key])}
                  onChange={(e) =>
                    onUpdateAudio({ ...audio, [key]: Number(e.target.value) })
                  }
                  className="flex-1 accent-cyan-400"
                />
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-lg bg-[#101520] border border-white/10 text-xs text-zinc-300 space-y-1">
            <div className="font-semibold text-white mb-1">PC &amp; Controller Bindings</div>
            <div>W / Up Arrow: Accelerate · S / Down Arrow: Brake / Reverse</div>
            <div>A / D or Left / Right: Steer · Space: Handbrake Drift</div>
            <div>Left Shift: Nitro Boost · C: Cycle Camera · Esc / P: Pause</div>
            <div className="text-zinc-400 pt-1">
              USB/Bluetooth Gamepad supported (Left Stick Steer, RT/LT Gas/Brake, A/X Handbrake, B/RB Nitro).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PauseModal: React.FC<{
  onResume: () => void;
  onRestart: () => void;
  onOpenGarage: () => void;
  onExitToTitle: () => void;
}> = ({ onResume, onRestart, onOpenGarage, onExitToTitle }) => (
  <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/70">
    <div className="w-full max-w-sm rounded-xl bg-[#0b0f18] border border-white/15 p-6 space-y-5 shadow-2xl">
      <div className="text-center">
        <h2 className="font-display text-2xl font-bold text-white">Race Paused</h2>
        <p className="text-xs text-zinc-400 mt-1">Simulation suspended</p>
      </div>
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={onResume}
          className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm cursor-pointer"
        >
          Resume Driving
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="w-full py-2.5 rounded-lg bg-[#141a28] hover:bg-[#1b2335] border border-white/10 text-zinc-100 text-sm font-semibold cursor-pointer"
        >
          Restart Event
        </button>
        <button
          type="button"
          onClick={onOpenGarage}
          className="w-full py-2.5 rounded-lg bg-[#141a28] hover:bg-[#1b2335] border border-white/10 text-zinc-100 text-sm font-semibold cursor-pointer"
        >
          Open Garage
        </button>
        <button
          type="button"
          onClick={onExitToTitle}
          className="w-full py-2.5 rounded-lg bg-[#0d111a] hover:bg-[#141a28] border border-white/10 text-zinc-300 text-sm font-semibold cursor-pointer"
        >
          Main Menu
        </button>
      </div>
    </div>
  </div>
);

export const ResultsModal: React.FC<{
  summary: RaceResultSummary;
  onPlayAgain: () => void;
  onOpenGarage: () => void;
  onExitToTitle: () => void;
}> = ({ summary, onPlayAgain, onOpenGarage, onExitToTitle }) => (
  <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
    <div className="w-full max-w-md rounded-xl bg-[#0b0f18] border border-white/15 p-6 space-y-5 shadow-2xl">
      <div className="text-center">
        <div
          className={`text-xs font-bold uppercase tracking-widest ${
            summary.victory ? 'text-cyan-400' : 'text-red-400'
          }`}
        >
          {summary.victory ? 'Event Complete' : 'Session Finished'}
        </div>
        <h2 className="font-display text-3xl font-bold text-white mt-1">
          {summary.reason}
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div className="p-3 rounded-lg bg-[#111622] border border-white/10">
          <div className="text-[11px] text-zinc-400 uppercase">Time</div>
          <div className="font-mono-num text-base font-bold text-white mt-0.5">
            {formatMs(summary.elapsedMs)}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[#111622] border border-white/10">
          <div className="text-[11px] text-zinc-400 uppercase">Drift Pts</div>
          <div className="font-mono-num text-base font-bold text-amber-400 mt-0.5">
            {summary.driftScore.toLocaleString()}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[#111622] border border-white/10">
          <div className="text-[11px] text-zinc-400 uppercase">Reward</div>
          <div className="font-mono-num text-base font-bold text-cyan-400 mt-0.5">
            +{summary.rewardCredits.toLocaleString()} CR
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <button
          type="button"
          data-start="true"
          onClick={onPlayAgain}
          className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm cursor-pointer"
        >
          Race Again
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onOpenGarage}
            className="py-2.5 rounded-lg bg-[#141a28] hover:bg-[#1b2335] border border-white/10 text-zinc-100 text-sm font-semibold cursor-pointer"
          >
            Garage
          </button>
          <button
            type="button"
            onClick={onExitToTitle}
            className="py-2.5 rounded-lg bg-[#141a28] hover:bg-[#1b2335] border border-white/10 text-zinc-300 text-sm font-semibold cursor-pointer"
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  </div>
);
