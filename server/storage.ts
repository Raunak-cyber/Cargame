import fs from 'fs';
import path from 'path';
import {
  CAR_CATALOG,
  createDefaultCustomization,
  getCarSpec,
} from '../src/game/carsCatalog';
import {
  CarCustomization,
  CarUpgrades,
  LeaderboardEntry,
  PlayerProfile,
  RaceResultSummary,
} from '../src/types/game';

interface DatabaseSchema {
  profiles: Record<string, PlayerProfile>;
  leaderboard: LeaderboardEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'game-db.json');

function createSeedLeaderboard(): LeaderboardEntry[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'seed_1',
      playerName: 'Kaito_Z',
      carId: 'apex_v12',
      carName: 'Valkyrie V12 GT',
      trackId: 'circuit',
      mode: 'time_trial',
      bestTimeMs: 41850,
      driftScore: 1840,
      createdAt: now,
    },
    {
      id: 'seed_2',
      playerName: 'Elena_R',
      carId: 'solaris_evo',
      carName: 'Solaris Corsa Evo',
      trackId: 'city_highway',
      mode: 'quick_race',
      bestTimeMs: 52400,
      driftScore: 2450,
      createdAt: now,
    },
    {
      id: 'seed_3',
      playerName: 'Rex_V8',
      carId: 'domination_v8',
      carName: 'Ironclad V8 Hellhound',
      trackId: 'mountain_pass',
      mode: 'drift_challenge',
      bestTimeMs: 68200,
      driftScore: 6420,
      createdAt: now,
    },
    {
      id: 'seed_4',
      playerName: 'Sora_GT',
      carId: 'kuro_gtr',
      carName: 'Kurogane R-35 Spec',
      trackId: 'circuit',
      mode: 'checkpoint_race',
      bestTimeMs: 46910,
      driftScore: 3120,
      createdAt: now,
    },
  ];
}

function createDefaultProfile(playerId: string): PlayerProfile {
  const starter = CAR_CATALOG[0];
  return {
    playerId,
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

class GameStorage {
  private db: DatabaseSchema;

  constructor() {
    this.db = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseSchema;
        if (parsed && parsed.profiles && Array.isArray(parsed.leaderboard)) {
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh DB
    }

    const fresh: DatabaseSchema = {
      profiles: {
        local_driver: createDefaultProfile('local_driver'),
      },
      leaderboard: createSeedLeaderboard(),
    };
    this.save(fresh);
    return fresh;
  }

  private save(data: DatabaseSchema = this.db): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Ignore write errors in read-only environments
    }
  }

  public getOrCreateProfile(playerId: string): PlayerProfile {
    const safeId = playerId || 'local_driver';
    if (!this.db.profiles[safeId]) {
      this.db.profiles[safeId] = createDefaultProfile(safeId);
      this.save();
    }
    return this.db.profiles[safeId];
  }

  public updateProfileMeta(
    playerId: string,
    updates: { playerName?: string; selectedCarId?: string }
  ): PlayerProfile {
    const profile = this.getOrCreateProfile(playerId);
    if (updates.playerName && updates.playerName.trim().length > 0) {
      profile.playerName = updates.playerName.trim().slice(0, 20);
    }
    if (
      updates.selectedCarId &&
      profile.ownedCars.includes(updates.selectedCarId)
    ) {
      profile.selectedCarId = updates.selectedCarId;
    }
    this.save();
    return profile;
  }

  public buyCar(
    playerId: string,
    carId: string
  ): { ok: boolean; error?: string; profile: PlayerProfile } {
    const profile = this.getOrCreateProfile(playerId);
    const car = CAR_CATALOG.find((c) => c.id === carId);
    if (!car) {
      return { ok: false, error: 'Car not found', profile };
    }
    if (profile.ownedCars.includes(carId)) {
      profile.selectedCarId = carId;
      this.save();
      return { ok: true, profile };
    }
    if (profile.credits < car.price) {
      return { ok: false, error: 'Insufficient credits', profile };
    }

    profile.credits -= car.price;
    profile.ownedCars.push(carId);
    profile.selectedCarId = carId;
    profile.customizations[carId] = createDefaultCustomization(car);
    this.save();
    return { ok: true, profile };
  }

  public saveCustomization(
    playerId: string,
    carId: string,
    customization: Partial<CarCustomization>
  ): { ok: boolean; error?: string; profile: PlayerProfile } {
    const profile = this.getOrCreateProfile(playerId);
    if (!profile.ownedCars.includes(carId)) {
      return { ok: false, error: 'Car is not owned yet', profile };
    }
    const spec = getCarSpec(carId);
    const current =
      profile.customizations[carId] ?? createDefaultCustomization(spec);
    profile.customizations[carId] = {
      ...current,
      ...customization,
      upgrades: current.upgrades,
    };
    this.save();
    return { ok: true, profile };
  }

  public upgradeCarPart(
    playerId: string,
    carId: string,
    part: keyof CarUpgrades
  ): { ok: boolean; error?: string; profile: PlayerProfile } {
    const profile = this.getOrCreateProfile(playerId);
    if (!profile.ownedCars.includes(carId)) {
      return { ok: false, error: 'Own this car before upgrading', profile };
    }
    const spec = getCarSpec(carId);
    const current =
      profile.customizations[carId] ?? createDefaultCustomization(spec);
    const currentTier = current.upgrades[part] ?? 0;
    if (currentTier >= 3) {
      return { ok: false, error: 'Maximum upgrade tier reached', profile };
    }

    const cost = (currentTier + 1) * 900;
    if (profile.credits < cost) {
      return { ok: false, error: `Requires ${cost} CR`, profile };
    }

    profile.credits -= cost;
    current.upgrades[part] = currentTier + 1;
    profile.customizations[carId] = current;
    this.save();
    return { ok: true, profile };
  }

  public recordRaceResult(
    playerId: string,
    summary: RaceResultSummary
  ): { profile: PlayerProfile; entry: LeaderboardEntry } {
    const profile = this.getOrCreateProfile(playerId);
    profile.credits += Math.max(0, summary.rewardCredits);
    profile.xp += Math.max(0, summary.xpEarned);
    profile.level = 1 + Math.floor(profile.xp / 1500);
    profile.stats.racesCompleted += 1;
    if (summary.victory) profile.stats.wins += 1;
    if (summary.driftScore > profile.stats.bestDriftScore) {
      profile.stats.bestDriftScore = summary.driftScore;
    }

    const spec = getCarSpec(summary.carId);
    const entry: LeaderboardEntry = {
      id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      playerName: profile.playerName,
      carId: summary.carId,
      carName: spec.name,
      trackId: summary.trackId,
      mode: summary.mode,
      bestTimeMs: summary.elapsedMs > 0 ? summary.elapsedMs : null,
      driftScore: summary.driftScore,
      createdAt: new Date().toISOString(),
    };

    this.db.leaderboard.unshift(entry);
    this.db.leaderboard = this.db.leaderboard.slice(0, 80);
    this.save();
    return { profile, entry };
  }

  public getLeaderboard(trackId?: string, mode?: string): LeaderboardEntry[] {
    let list = [...this.db.leaderboard];
    if (trackId && trackId !== 'all') {
      list = list.filter((e) => e.trackId === trackId);
    }
    if (mode && mode !== 'all') {
      list = list.filter((e) => e.mode === mode);
    }
    list.sort((a, b) => {
      if (mode === 'drift_challenge') {
        return b.driftScore - a.driftScore;
      }
      if (a.bestTimeMs && b.bestTimeMs) return a.bestTimeMs - b.bestTimeMs;
      return b.driftScore - a.driftScore;
    });
    return list.slice(0, 25);
  }
}

export const gameStorage = new GameStorage();
