import { Router } from 'express';
import { multiplayerManager } from './multiplayer';
import { gameStorage } from './storage';

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'apex-horizon-api' });
  });

  router.get('/profile/:playerId', (req, res) => {
    const profile = gameStorage.getOrCreateProfile(req.params.playerId);
    res.json(profile);
  });

  router.patch('/profile/:playerId', (req, res) => {
    const profile = gameStorage.updateProfileMeta(req.params.playerId, req.body ?? {});
    res.json(profile);
  });

  router.post('/cars/buy', (req, res) => {
    const { playerId, carId } = req.body ?? {};
    if (!playerId || !carId) {
      res.status(400).json({ error: 'playerId and carId are required' });
      return;
    }
    const result = gameStorage.buyCar(playerId, carId);
    if (!result.ok) {
      res.status(400).json({ error: result.error, profile: result.profile });
      return;
    }
    res.json(result.profile);
  });

  router.post('/cars/customize', (req, res) => {
    const { playerId, carId, customization } = req.body ?? {};
    if (!playerId || !carId || !customization) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const result = gameStorage.saveCustomization(playerId, carId, customization);
    if (!result.ok) {
      res.status(400).json({ error: result.error, profile: result.profile });
      return;
    }
    res.json(result.profile);
  });

  router.post('/cars/upgrade', (req, res) => {
    const { playerId, carId, part } = req.body ?? {};
    if (!playerId || !carId || !part) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const result = gameStorage.upgradeCarPart(playerId, carId, part);
    if (!result.ok) {
      res.status(400).json({ error: result.error, profile: result.profile });
      return;
    }
    res.json(result.profile);
  });

  router.get('/leaderboard', (req, res) => {
    const trackId = typeof req.query.trackId === 'string' ? req.query.trackId : undefined;
    const mode = typeof req.query.mode === 'string' ? req.query.mode : undefined;
    res.json(gameStorage.getLeaderboard(trackId, mode));
  });

  router.post('/races/result', (req, res) => {
    const { playerId, summary } = req.body ?? {};
    if (!playerId || !summary) {
      res.status(400).json({ error: 'Missing race result payload' });
      return;
    }
    const recorded = gameStorage.recordRaceResult(playerId, summary);
    res.json(recorded);
  });

  router.get('/rooms', (_req, res) => {
    res.json(multiplayerManager.listRooms());
  });

  return router;
}
