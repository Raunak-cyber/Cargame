import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Lock,
  Paintbrush,
  RotateCw,
  Wrench,
  Car as CarIcon,
} from 'lucide-react';
import {
  CAR_CATALOG,
  createDefaultCustomization,
  getCarSpec,
  PAINT_SWATCHES,
  RIM_SWATCHES,
} from '../game/carsCatalog';
import { computeEffectiveStats } from '../game/physics';
import {
  CarCustomization,
  CarUpgrades,
  HeadlightStyle,
  PlayerProfile,
  SpoilerDesign,
  WheelDesign,
} from '../types/game';

interface GarageViewProps {
  profile: PlayerProfile;
  onSelectCar: (carId: string) => void;
  onBuyCar: (carId: string) => Promise<string | null>;
  onUpdateCustomization: (carId: string, custom: CarCustomization) => Promise<void>;
  onUpgradePart: (carId: string, part: keyof CarUpgrades) => Promise<string | null>;
  onRotateOrbit: (dx: number, dy: number) => void;
  onZoomOrbit: (delta: number) => void;
  onToggleAutoSpin: (enabled: boolean) => void;
  onClose: () => void;
}

export const GarageView: React.FC<GarageViewProps> = ({
  profile,
  onSelectCar,
  onBuyCar,
  onUpdateCustomization,
  onUpgradePart,
  onRotateOrbit,
  onZoomOrbit,
  onToggleAutoSpin,
  onClose,
}) => {
  const [tab, setTab] = useState<'cars' | 'visuals' | 'upgrades'>('cars');
  const [viewedCarId, setViewedCarId] = useState(profile.selectedCarId);
  const [autoSpin, setAutoSpin] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const draggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const car = getCarSpec(viewedCarId);
  const isOwned = profile.ownedCars.includes(car.id);
  const customization: CarCustomization =
    profile.customizations[car.id] ?? createDefaultCustomization(car);
  const effective = computeEffectiveStats(car, customization.upgrades);

  const handleCarClick = (carId: string) => {
    setViewedCarId(carId);
    setFeedback(null);
    const nextSpec = getCarSpec(carId);
    const nextCustom =
      profile.customizations[carId] ?? createDefaultCustomization(nextSpec);
    onUpdateCustomization(carId, nextCustom);
    if (profile.ownedCars.includes(carId)) {
      onSelectCar(carId);
    }
  };

  const handleBuy = async () => {
    const err = await onBuyCar(car.id);
    if (err) setFeedback(err);
    else setFeedback(`${car.name} unlocked and equipped.`);
  };

  const handleUpgrade = async (part: keyof CarUpgrades) => {
    const err = await onUpgradePart(car.id, part);
    if (err) setFeedback(err);
    else setFeedback(`Upgraded ${part} successfully.`);
  };

  const patchVisual = (patch: Partial<CarCustomization>) => {
    const updated: CarCustomization = { ...customization, ...patch };
    onUpdateCustomization(car.id, updated);
  };

  return (
    <div className="fixed inset-0 z-30 flex pointer-events-none">
      {/* Left Interactive 3D Viewport Area (drag to rotate car) */}
      <div
        className="flex-1 relative pointer-events-auto cursor-grab active:cursor-grabbing flex flex-col justify-between p-6"
        onPointerDown={(e) => {
          draggingRef.current = true;
          lastPosRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          const dx = e.clientX - lastPosRef.current.x;
          const dy = e.clientY - lastPosRef.current.y;
          lastPosRef.current = { x: e.clientX, y: e.clientY };
          onRotateOrbit(dx, dy);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
        }}
        onWheel={(e) => onZoomOrbit(e.deltaY)}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0d111a]/95 hover:bg-[#1a2233] border border-white/10 text-zinc-100 text-sm font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !autoSpin;
              setAutoSpin(next);
              onToggleAutoSpin(next);
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
              autoSpin
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                : 'bg-[#0d111a]/90 border-white/10 text-zinc-300'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            Turntable {autoSpin ? 'On' : 'Off'}
          </button>
        </div>

        <div className="flex items-end justify-between">
          <div className="px-4 py-3 rounded-lg bg-[#090b10]/85 border border-white/10">
            <div className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">
              {car.category}
            </div>
            <h2 className="font-display text-2xl font-bold text-white">
              {car.name}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 max-w-md">{car.tagline}</p>
          </div>
        </div>
      </div>

      {/* Right Customization Dock */}
      <aside className="w-full max-w-[420px] h-full bg-[#0b0e16]/95 border-l border-white/10 pointer-events-auto flex flex-col">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-white">
              Performance Garage
            </h3>
            <p className="text-xs text-zinc-400">Drag showroom floor to inspect</p>
          </div>
          <div className="font-mono-num text-sm font-bold text-cyan-400">
            {profile.credits.toLocaleString()} CR
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 p-2 bg-[#07090e] border-b border-white/10">
          <button
            type="button"
            onClick={() => setTab('cars')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
              tab === 'cars'
                ? 'bg-red-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <CarIcon className="w-3.5 h-3.5" />
            Vehicles
          </button>
          <button
            type="button"
            onClick={() => setTab('visuals')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
              tab === 'visuals'
                ? 'bg-red-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            Visuals
          </button>
          <button
            type="button"
            onClick={() => setTab('upgrades')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
              tab === 'upgrades'
                ? 'bg-red-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Upgrades
          </button>
        </div>

        {/* Stat Bars Summary */}
        <div className="px-5 py-3.5 border-b border-white/10 grid grid-cols-2 gap-x-4 gap-y-2 bg-[#0d111a]">
          {[
            { label: 'Top Speed', val: `${effective.topSpeedKmh} km/h`, pct: effective.speedRating },
            { label: 'Acceleration', val: String(effective.accelRating), pct: effective.accelRating },
            { label: 'Handling', val: String(effective.handlingRating), pct: effective.handlingRating },
            { label: 'Braking', val: String(effective.brakingRating), pct: effective.brakingRating },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>{s.label}</span>
                <span className="font-mono-num text-zinc-200">{s.val}</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-400"
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {feedback && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-cyan-500/15 border border-cyan-400/30 text-xs text-cyan-200">
            {feedback}
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto racing-scroll p-5 space-y-5">
          {tab === 'cars' && (
            <div className="space-y-2.5">
              {CAR_CATALOG.map((item) => {
                const owned = profile.ownedCars.includes(item.id);
                const selected = profile.selectedCarId === item.id;
                const activeView = viewedCarId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleCarClick(item.id)}
                    className={`w-full text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                      activeView
                        ? 'bg-[#161e2e] border-cyan-400/60'
                        : 'bg-[#101520] hover:bg-[#151c2b] border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-bold text-sm text-white">
                        {item.name}
                      </span>
                      {selected ? (
                        <span className="text-[11px] font-semibold text-cyan-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Equipped
                        </span>
                      ) : owned ? (
                        <span className="text-[11px] text-zinc-400">Owned</span>
                      ) : (
                        <span className="font-mono-num text-xs font-bold text-amber-400 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> {item.price.toLocaleString()} CR
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {item.category} · {item.stats.topSpeedKmh} km/h
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'visuals' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Body Paint
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PAINT_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      title={sw.name}
                      aria-label={`Paint ${sw.name}`}
                      onClick={() => patchVisual({ paintColor: sw.hex })}
                      className={`h-9 rounded-md border-2 cursor-pointer ${
                        customization.paintColor === sw.hex
                          ? 'border-white'
                          : 'border-white/15'
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Wheel Design
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['turbine', 'Aero Turbine'],
                      ['mesh_gt', 'Mesh GT'],
                      ['five_spoke', 'Five Spoke'],
                      ['deep_dish', 'Deep Dish'],
                    ] as [WheelDesign, string][]
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => patchVisual({ wheelDesign: val })}
                      className={`px-3 py-2 rounded-md text-xs font-semibold border cursor-pointer ${
                        customization.wheelDesign === val
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-[#111622] border-white/10 text-zinc-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Rim Finish
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {RIM_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      title={sw.name}
                      aria-label={`Rim ${sw.name}`}
                      onClick={() => patchVisual({ rimColor: sw.hex })}
                      className={`h-8 rounded-md border-2 cursor-pointer ${
                        customization.rimColor === sw.hex
                          ? 'border-white'
                          : 'border-white/15'
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Rear Aero Spoiler
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['none', 'Clean Deck'],
                      ['lip', 'Carbon Lip'],
                      ['gt_wing', 'GT Wing'],
                      ['swan_neck', 'Swan-Neck Aero'],
                    ] as [SpoilerDesign, string][]
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => patchVisual({ spoiler: val })}
                      className={`px-3 py-2 rounded-md text-xs font-semibold border cursor-pointer ${
                        customization.spoiler === val
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-[#111622] border-white/10 text-zinc-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Headlight Signature
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['xenon_white', 'Xenon White'],
                      ['ice_blue', 'Ice Blue'],
                      ['amber_gt', 'Amber GT'],
                      ['crimson_halo', 'Crimson Halo'],
                    ] as [HeadlightStyle, string][]
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => patchVisual({ headlightStyle: val })}
                      className={`px-3 py-2 rounded-md text-xs font-semibold border cursor-pointer ${
                        customization.headlightStyle === val
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-[#111622] border-white/10 text-zinc-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'upgrades' && (
            <div className="space-y-3">
              {(
                [
                  ['engine', 'Engine & Forced Induction', 'Raises top speed and torque'],
                  ['brakes', 'Carbon-Ceramic Brakes', 'Shortens stopping distance'],
                  ['handling', 'Coilovers & Tire Compound', 'Sharpens turn-in and grip'],
                  ['nitro', 'Twin-Stage Nitrous', 'Boosts acceleration punch'],
                ] as [keyof CarUpgrades, string, string][]
              ).map(([part, title, desc]) => {
                const tier = customization.upgrades[part] ?? 0;
                const cost = (tier + 1) * 900;
                const maxed = tier >= 3;
                return (
                  <div
                    key={part}
                    className="p-3.5 rounded-lg bg-[#101520] border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">{title}</div>
                      <div className="text-xs text-zinc-400">{desc}</div>
                      <div className="flex gap-1 mt-2">
                        {[1, 2, 3].map((lvl) => (
                          <span
                            key={lvl}
                            className={`h-1.5 w-6 rounded-full ${
                              tier >= lvl ? 'bg-cyan-400' : 'bg-zinc-700'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!isOwned || maxed}
                      onClick={() => handleUpgrade(part)}
                      className={`px-3 py-2 rounded-md text-xs font-bold font-mono-num shrink-0 cursor-pointer ${
                        !isOwned || maxed
                          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-500 text-white'
                      }`}
                    >
                      {maxed ? 'MAX' : `${cost} CR`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-white/10 bg-[#080a10]">
          {!isOwned ? (
            <button
              type="button"
              onClick={handleBuy}
              className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-sm tracking-wide cursor-pointer"
            >
              Purchase for {car.price.toLocaleString()} CR
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onSelectCar(car.id);
                onClose();
              }}
              className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm tracking-wide cursor-pointer"
            >
              Confirm &amp; Exit Garage
            </button>
          )}
        </div>
      </aside>
    </div>
  );
};
