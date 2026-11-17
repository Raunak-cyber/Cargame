# Apex Horizon — 3D Open-World & Circuit Racing

A full-stack 3D car racing game built with **Three.js**, **Cannon-es**, **React**, **Node.js**, **Express**, and **Socket.io**.

## Features

- **3D Open-World & Circuits**: Drive across the Apex Grand Circuit, Metro Expressway Ring (city skyline & intersections), and Obsidian Ridge Touge (mountain switchbacks) with dynamic Day/Sunset/Night cycle, Rain, and Fog.
- **5 Distinct Sports Cars**: Kurogane R-35 Spec (JDM), Ironclad V8 Hellhound (Muscle), Aurelia S8 Grand Tourer (Luxury GT), Solaris Corsa Evo (Supercar), and Valkyrie V12 GT (Hypercar).
- **Interactive 3D Garage**: Turntable orbit inspection, paint swatches, 4 wheel designs, rim colors, rear spoilers, headlight signatures, and Engine/Brakes/Handling/Nitro performance upgrades.
- **Driving Physics & Cameras**: Speed-dependent steering, handbrake drifting, nitro boost, suspension pitch/roll, Cannon-es collision detection, vehicle damage, and 4 camera views (`Chase`, `Cockpit`, `Bumper`, `Cinematic`).
- **6 Game Modes**: Free Roam, Quick Race (AI opponents with overtaking), Time Trial, Checkpoint Race, Drift Challenge, and Socket.io Multiplayer.
- **Procedural Web Audio**: RPM-driven engine synthesis, turbo whine, tire screech, nitro jet, impact audio, and toggleable synth driving music.

## Controls

- `W` / `Arrow Up`: Accelerate
- `S` / `Arrow Down`: Brake / Reverse
- `A` / `D` or `Left` / `Right`: Steer
- `Space`: Handbrake Drift
- `Shift`: Nitro Boost
- `C`: Change Camera Mode
- `Esc` / `P`: Pause Menu
- Gamepad supported via Web Gamepad API

## Setup & Running

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Production Build

```bash
npm run build
npm start
```
