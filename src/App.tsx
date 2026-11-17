import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  CAR_CATALOG,
  createDefaultCustomization,
  getCarSpec,
} from './game/carsCatalog';
import { GameEngine } from './game/GameEngine';
import {
  ActiveMenuOverlay,
  AudioSettings,
  CarCustomization,
  CarUpgrades,
  GameScreenState,
  GraphicsSettings,
  HudTelemetry,
  MultiplayerRoom,
  PlayerProfile,
  RaceConfig,
  RaceResultSummary,
  TrackId,
} from './types/game';
import { GameHUD } from './ui/GameHUD';
import { GarageView } from './ui/GarageView';
import {
  LeaderboardModal,
  MultiplayerModal,
  PauseModal,
  RaceModesModal,
  ResultsModal,
  SettingsModal,
} from './ui/Menus';
import { TitleScreen } from './ui/TitleScreen';

const INITIAL_TELEMETRY: HudTelemetry = {
  speedKmh: 0,
  rpm: 950,
  maxRpm: 8400,
  gear: 'N',
  nitro: 100,
  damage: 0,
  driftScore: 0,
  currentDriftPoints: 0,
  driftMultiplier: 1,
  isDrifting: false,
  lap: 1,
  totalLaps: 3,
  checkpoint: 0,
  totalCheckpoints: 10,
  nextCheckpointPos: null,
  position: 1,
  totalRacers: 1,
  elapsedMs: 0,
  timeLimitMs: 0,
  bestLapMs: null,
  cameraMode: 'chase',
  minimapEntities: [],
  playerPos: { x: 0, z: 40, yaw: 0 },
  onRoad: true,
  wrongWay: false,
};

function getLocalFallbackProfile(): PlayerProfile {
  const starter = CAR_CATALOG[0];
  return {
    playerId: 'local_driver',
    playerName: 'Driver_01',
    credits: 6000,
    xp: 0,
    level: 1,
    selectedCarId: starter.id,
    ownedCars: [starter.id],
    customizations: {
      [starter.id]: createDefaultCustomization(starter),
    },
    stats: {
      racesCompleted: 0,
      wins: 0,
      bestDriftScore: 0,
      totalDistanceKm: 0,
    },
  };
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [playerId] = useState(() => {
    try {
      const saved = localStorage.getItem('apex_player_id');
      if (saved) return saved;
      const id = 'local_driver';
      localStorage.setItem('apex_player_id', id);
      return id;
    } catch {
      return 'local_driver';
    }
  });

  const [profile, setProfile] = useState<PlayerProfile>(getLocalFallbackProfile);
  const [screenState, setScreenState] = useState<GameScreenState>('title');
  const [activeOverlay, setActiveOverlay] = useState<ActiveMenuOverlay>('none');
  const [raceConfig, setRaceConfig] = useState<RaceConfig>({
    mode: 'free_roam',
    trackId: 'circuit',
    laps: 3,
    aiCount: 3,
    timeOfDay: 'day',
    weather: 'clear',
  });
  const [telemetry, setTelemetry] = useState<HudTelemetry>(INITIAL_TELEMETRY);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [raceResult, setRaceResult] = useState<RaceResultSummary | null>(null);

  const [graphics, setGraphics] = useState<GraphicsSettings>({
    quality: 'high',
    shadows: true,
    particles: true,
    weatherEffects: true,
  });

  const [audio, setAudio] = useState<AudioSettings>({
    master: 0.7,
    engine: 0.75,
    sfx: 0.8,
    music: 0.45,
    muted: false,
  });

  // Multiplayer state
  const [mpConnected, setMpConnected] = useState(false);
  const [mpSocketId, setMpSocketId] = useState('');
  const [mpRooms, setMpRooms] = useState<MultiplayerRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<MultiplayerRoom | null>(null);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const screenStateRef = useRef(screenState);
  screenStateRef.current = screenState;
  const activeOverlayRef = useRef(activeOverlay);
  activeOverlayRef.current = activeOverlay;
  const raceConfigRef = useRef(raceConfig);
  raceConfigRef.current = raceConfig;
  const activeRoomRef = useRef(activeRoom);
  activeRoomRef.current = activeRoom;

  // Sync game state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = screenState;
  }, [screenState]);

  // Load player profile from Express API
  useEffect(() => {
    fetch(`/api/profile/${encodeURIComponent(playerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.playerId) {
          setProfile(data);
          const spec = getCarSpec(data.selectedCarId);
          const custom =
            data.customizations?.[data.selectedCarId] ??
            createDefaultCustomization(spec);
          engineRef.current?.updatePlayerCar(data.selectedCarId, custom);
        }
      })
      .catch(() => {});
  }, [playerId]);

  const startRaceSession = useCallback((config: RaceConfig, room?: MultiplayerRoom) => {
    const prof = profileRef.current;
    const spec = getCarSpec(prof.selectedCarId);
    const custom =
      prof.customizations[prof.selectedCarId] ?? createDefaultCustomization(spec);

    setRaceConfig(config);
    setRaceResult(null);
    setActiveOverlay('none');
    setScreenState('playing');
    document.body.dataset.state = 'playing';

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    engineRef.current?.startSession(
      config,
      prof.selectedCarId,
      custom,
      room?.players ?? [],
      socketRef.current?.id ?? ''
    );
  }, []);

  // Mount Three.js GameEngine once
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const initialProf = profileRef.current;
    const spec = getCarSpec(initialProf.selectedCarId);
    const custom =
      initialProf.customizations[initialProf.selectedCarId] ??
      createDefaultCustomization(spec);

    const engine = new GameEngine(mountEl, initialProf.selectedCarId, custom, {
      onTelemetry: (t) => setTelemetry(t),
      onCameraChange: () => {},
      onCountdownTick: (c) => setCountdown(c),
      onPauseToggle: () => {
        setScreenState((prev) => {
          if (prev === 'playing') {
            engineRef.current?.setScreenState('paused');
            return 'paused';
          }
          if (prev === 'paused') {
            engineRef.current?.setScreenState('playing');
            return 'playing';
          }
          return prev;
        });
      },
      onMultiplayerSync: (payload) => {
        const room = activeRoomRef.current;
        if (room && socketRef.current?.connected) {
          socketRef.current.emit('player:state', {
            roomId: room.roomId,
            ...payload,
          });
        }
      },
      onRaceFinish: (summary) => {
        setRaceResult(summary);
        setScreenState('gameover');
        engineRef.current?.setScreenState('gameover');

        fetch('/api/races/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: profileRef.current.playerId,
            summary,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((res) => {
            if (res?.profile) setProfile(res.profile);
          })
          .catch(() => {});
      },
    });

    engineRef.current = engine;

    // Support ?autostart=1 to launch directly into gameplay
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startRaceSession(raceConfigRef.current);
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [startRaceSession]);

  // Socket.io connection for Multiplayer
  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setMpConnected(true);
      setMpSocketId(socket.id ?? '');
      socket.emit('rooms:list');
    });

    socket.on('disconnect', () => {
      setMpConnected(false);
    });

    socket.on('rooms:updated', (rooms: MultiplayerRoom[]) => {
      setMpRooms(rooms);
    });

    socket.on('room:state', (room: MultiplayerRoom) => {
      const stillInside = room.players.some((p) => p.socketId === socket.id);
      if (stillInside) {
        setActiveRoom(room);
        if (raceConfigRef.current.mode === 'multiplayer' && screenStateRef.current === 'playing') {
          engineRef.current?.syncMultiplayerRoster(room.players, socket.id ?? '');
        }
      } else {
        setActiveRoom((prev) => (prev?.roomId === room.roomId ? null : prev));
      }
    });

    socket.on('race:started', (room: MultiplayerRoom) => {
      setActiveRoom(room);
      startRaceSession(
        {
          ...raceConfigRef.current,
          mode: 'multiplayer',
          trackId: room.trackId,
          laps: room.laps,
        },
        room
      );
    });

    socket.on(
      'player:updated',
      (data: {
        socketId: string;
        position: { x: number; y: number; z: number };
        yaw: number;
        speedKmh: number;
      }) => {
        engineRef.current?.applyRemotePlayerState(
          data.socketId,
          data.position,
          data.yaw,
          data.speedKmh
        );
      }
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [startRaceSession]);

  // Bind Enter / Space on Title screen to start gameplay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        screenStateRef.current === 'title' &&
        activeOverlayRef.current === 'none' &&
        (e.code === 'Enter' || e.code === 'Space')
      ) {
        e.preventDefault();
        startRaceSession(raceConfigRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startRaceSession]);

  const openGarage = () => {
    const prof = profileRef.current;
    const spec = getCarSpec(prof.selectedCarId);
    const custom =
      prof.customizations[prof.selectedCarId] ?? createDefaultCustomization(spec);
    engineRef.current?.sound.playUiClick(580);
    engineRef.current?.enterGarage(prof.selectedCarId, custom);
    setActiveOverlay('garage');
  };

  const closeGarage = () => {
    engineRef.current?.exitGarage();
    setActiveOverlay('none');
    if (screenState === 'paused') {
      setScreenState('title');
      engineRef.current?.setScreenState('title');
    }
  };

  const handleSelectCar = async (carId: string) => {
    setProfile((prev) => ({ ...prev, selectedCarId: carId }));
    const spec = getCarSpec(carId);
    const custom =
      profileRef.current.customizations[carId] ?? createDefaultCustomization(spec);
    engineRef.current?.updatePlayerCar(carId, custom);

    fetch(`/api/profile/${encodeURIComponent(playerId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedCarId: carId }),
    }).catch(() => {});
  };

  const handleBuyCar = async (carId: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/cars/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, carId }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Could not purchase car';
      setProfile(data);
      const spec = getCarSpec(carId);
      const custom = data.customizations?.[carId] ?? createDefaultCustomization(spec);
      engineRef.current?.updatePlayerCar(carId, custom);
      engineRef.current?.sound.playUiClick(740);
      return null;
    } catch {
      return 'Network error';
    }
  };

  const handleUpdateCustomization = async (
    carId: string,
    custom: CarCustomization
  ) => {
    engineRef.current?.updatePlayerCar(carId, custom);
    setProfile((prev) => ({
      ...prev,
      customizations: {
        ...prev.customizations,
        [carId]: custom,
      },
    }));

    if (profileRef.current.ownedCars.includes(carId)) {
      fetch('/api/cars/customize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, carId, customization: custom }),
      }).catch(() => {});
    }
  };

  const handleUpgradePart = async (
    carId: string,
    part: keyof CarUpgrades
  ): Promise<string | null> => {
    try {
      const res = await fetch('/api/cars/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, carId, part }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Upgrade failed';
      setProfile(data);
      const spec = getCarSpec(carId);
      const custom = data.customizations?.[carId] ?? createDefaultCustomization(spec);
      engineRef.current?.updatePlayerCar(carId, custom);
      engineRef.current?.sound.playUiClick(820);
      return null;
    } catch {
      return 'Network error';
    }
  };

  const handleUpdateGraphics = (next: GraphicsSettings) => {
    setGraphics(next);
    engineRef.current?.setGraphicsSettings(next);
  };

  const handleUpdateAudio = (next: AudioSettings) => {
    setAudio(next);
    engineRef.current?.setAudioSettings(next);
  };

  const handleUpdateName = async (name: string) => {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;
    setProfile((prev) => ({ ...prev, playerName: trimmed }));
    fetch(`/api/profile/${encodeURIComponent(playerId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: trimmed }),
    }).catch(() => {});
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#090b10]">
      {/* Isolated WebGL Canvas Mount */}
      <div
        ref={canvasMountRef}
        data-testid="game-viewport"
        className="fixed inset-0 w-full h-full"
      />

      {/* Title Screen */}
      {screenState === 'title' && activeOverlay === 'none' && (
        <TitleScreen
          profile={profile}
          raceConfig={raceConfig}
          onStartPlay={() => startRaceSession(raceConfig)}
          onOpenOverlay={(overlay) => {
            engineRef.current?.sound.init();
            engineRef.current?.sound.playUiClick(560);
            if (overlay === 'garage') openGarage();
            else setActiveOverlay(overlay);
          }}
        />
      )}

      {/* Active Gameplay HUD */}
      {screenState === 'playing' && activeOverlay === 'none' && (
        <GameHUD
          telemetry={telemetry}
          mode={raceConfig.mode}
          trackId={raceConfig.trackId}
          countdown={countdown}
          muted={audio.muted}
          onCycleCamera={() => engineRef.current?.cycleCamera()}
          onToggleMute={() => handleUpdateAudio({ ...audio, muted: !audio.muted })}
          onPause={() => {
            setScreenState('paused');
            engineRef.current?.setScreenState('paused');
          }}
        />
      )}

      {/* 3D Garage Overlay */}
      {activeOverlay === 'garage' && (
        <GarageView
          profile={profile}
          onSelectCar={handleSelectCar}
          onBuyCar={handleBuyCar}
          onUpdateCustomization={handleUpdateCustomization}
          onUpgradePart={handleUpgradePart}
          onRotateOrbit={(dx, dy) => engineRef.current?.rotateGarageOrbit(dx, dy)}
          onZoomOrbit={(d) => engineRef.current?.zoomGarageOrbit(d)}
          onToggleAutoSpin={(en) => engineRef.current?.setGarageAutoSpin(en)}
          onClose={closeGarage}
        />
      )}

      {/* Race Modes Modal */}
      {activeOverlay === 'modes' && (
        <RaceModesModal
          config={raceConfig}
          onLaunch={(next) => {
            engineRef.current?.updateEnvironmentSettings(next.timeOfDay, next.weather);
            startRaceSession(next);
          }}
          onClose={() => setActiveOverlay('none')}
        />
      )}

      {/* Multiplayer Modal */}
      {activeOverlay === 'multiplayer' && (
        <MultiplayerModal
          rooms={mpRooms}
          activeRoom={activeRoom}
          socketId={mpSocketId}
          connected={mpConnected}
          onCreateRoom={(roomName, trackId, laps) => {
            const spec = getCarSpec(profile.selectedCarId);
            const paint =
              profile.customizations[profile.selectedCarId]?.paintColor ??
              spec.defaultPaint;
            socketRef.current?.emit('room:create', {
              roomName,
              trackId,
              laps,
              playerName: profile.playerName,
              carId: profile.selectedCarId,
              paintColor: paint,
            });
          }}
          onJoinRoom={(roomId) => {
            const spec = getCarSpec(profile.selectedCarId);
            const paint =
              profile.customizations[profile.selectedCarId]?.paintColor ??
              spec.defaultPaint;
            socketRef.current?.emit('room:join', {
              roomId,
              playerName: profile.playerName,
              carId: profile.selectedCarId,
              paintColor: paint,
            });
          }}
          onLeaveRoom={(roomId) => {
            socketRef.current?.emit('room:leave', roomId);
            setActiveRoom(null);
          }}
          onToggleReady={(roomId, ready) => {
            socketRef.current?.emit('room:ready', { roomId, ready });
          }}
          onStartRace={(roomId) => {
            socketRef.current?.emit('race:start', roomId);
          }}
          onRefreshRooms={() => socketRef.current?.emit('rooms:list')}
          onClose={() => setActiveOverlay('none')}
        />
      )}

      {/* Leaderboard Modal */}
      {activeOverlay === 'leaderboard' && (
        <LeaderboardModal onClose={() => setActiveOverlay('none')} />
      )}

      {/* Settings Modal */}
      {activeOverlay === 'settings' && (
        <SettingsModal
          profile={profile}
          graphics={graphics}
          audio={audio}
          onUpdateName={handleUpdateName}
          onUpdateGraphics={handleUpdateGraphics}
          onUpdateAudio={handleUpdateAudio}
          onClose={() => setActiveOverlay('none')}
        />
      )}

      {/* Pause Modal */}
      {screenState === 'paused' && activeOverlay === 'none' && (
        <PauseModal
          onResume={() => {
            setScreenState('playing');
            engineRef.current?.setScreenState('playing');
          }}
          onRestart={() => startRaceSession(raceConfig)}
          onOpenGarage={openGarage}
          onExitToTitle={() => {
            setScreenState('title');
            engineRef.current?.setScreenState('title');
          }}
        />
      )}

      {/* Race Complete / Game Over Modal */}
      {screenState === 'gameover' && raceResult && activeOverlay === 'none' && (
        <ResultsModal
          summary={raceResult}
          onPlayAgain={() => startRaceSession(raceConfig)}
          onOpenGarage={openGarage}
          onExitToTitle={() => {
            setRaceResult(null);
            setScreenState('title');
            engineRef.current?.setScreenState('title');
          }}
        />
      )}
    </div>
  );
}
