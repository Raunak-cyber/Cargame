import { Server, Socket } from 'socket.io';
import {
  MultiplayerPlayerInfo,
  MultiplayerRoom,
  TrackId,
} from '../src/types/game';

class MultiplayerManager {
  private rooms: Map<string, MultiplayerRoom> = new Map();
  private io: Server | null = null;

  public attach(io: Server): void {
    this.io = io;

    // Seed one open public lobby room so the lobby browser always has an active joinable track
    this.createRoomInternal(
      'public_apex_ring',
      'Apex Grand Prix Lobby',
      'server',
      'circuit',
      3
    );

    io.on('connection', (socket: Socket) => {
      socket.emit('rooms:updated', this.listRooms());

      socket.on('rooms:list', () => {
        socket.emit('rooms:updated', this.listRooms());
      });

      socket.on(
        'room:create',
        (payload: {
          roomName: string;
          trackId: TrackId;
          laps: number;
          playerName: string;
          carId: string;
          paintColor: string;
        }) => {
          const roomId = `room_${Date.now().toString(36)}`;
          const room = this.createRoomInternal(
            roomId,
            (payload.roomName || 'Street Race').slice(0, 28),
            socket.id,
            payload.trackId || 'circuit',
            Math.max(1, Math.min(5, payload.laps || 3))
          );
          this.joinSocketToRoom(socket, room, payload);
        }
      );

      socket.on(
        'room:join',
        (payload: {
          roomId: string;
          playerName: string;
          carId: string;
          paintColor: string;
        }) => {
          const room = this.rooms.get(payload.roomId);
          if (!room) {
            socket.emit('room:error', 'Room no longer exists');
            return;
          }
          if (room.players.length >= room.maxPlayers) {
            socket.emit('room:error', 'Room is full');
            return;
          }
          this.joinSocketToRoom(socket, room, payload);
        }
      );

      socket.on('room:leave', (roomId: string) => {
        this.removeSocketFromRoom(socket, roomId);
      });

      socket.on('room:ready', (payload: { roomId: string; ready: boolean }) => {
        const room = this.rooms.get(payload.roomId);
        if (!room) return;
        const p = room.players.find((pl) => pl.socketId === socket.id);
        if (p) {
          p.ready = Boolean(payload.ready);
          this.broadcastRoomState(room);
        }
      });

      socket.on('race:start', (roomId: string) => {
        const room = this.rooms.get(roomId);
        if (!room) return;
        // Host or first player can start
        if (room.hostId === socket.id || room.hostId === 'server') {
          room.status = 'racing';
          room.players.forEach((p, idx) => {
            p.finished = false;
            p.finishTimeMs = undefined;
            p.lap = 1;
            p.checkpoint = 0;
            p.position = { x: (idx % 2 === 0 ? -2.5 : 2.5), y: 0, z: 40 + idx * 5 };
          });
          this.io?.to(room.roomId).emit('race:started', room);
          this.io?.emit('rooms:updated', this.listRooms());
        }
      });

      socket.on(
        'player:state',
        (payload: {
          roomId: string;
          position: { x: number; y: number; z: number };
          yaw: number;
          speedKmh: number;
          lap: number;
          checkpoint: number;
          finished: boolean;
          finishTimeMs?: number;
        }) => {
          const room = this.rooms.get(payload.roomId);
          if (!room) return;
          const p = room.players.find((pl) => pl.socketId === socket.id);
          if (!p) return;
          p.position = payload.position;
          p.yaw = payload.yaw;
          p.speedKmh = payload.speedKmh;
          p.lap = payload.lap;
          p.checkpoint = payload.checkpoint;
          p.finished = payload.finished;
          if (payload.finishTimeMs !== undefined) {
            p.finishTimeMs = payload.finishTimeMs;
          }

          socket.to(room.roomId).emit('player:updated', {
            socketId: socket.id,
            position: p.position,
            yaw: p.yaw,
            speedKmh: p.speedKmh,
            lap: p.lap,
            checkpoint: p.checkpoint,
            finished: p.finished,
          });
        }
      );

      socket.on('disconnect', () => {
        for (const [roomId] of this.rooms) {
          this.removeSocketFromRoom(socket, roomId);
        }
      });
    });
  }

  private createRoomInternal(
    roomId: string,
    roomName: string,
    hostId: string,
    trackId: TrackId,
    laps: number
  ): MultiplayerRoom {
    const room: MultiplayerRoom = {
      roomId,
      roomName,
      hostId,
      trackId,
      laps,
      status: 'waiting',
      players: [],
      maxPlayers: 8,
    };
    this.rooms.set(roomId, room);
    return room;
  }

  private joinSocketToRoom(
    socket: Socket,
    room: MultiplayerRoom,
    payload: { playerName: string; carId: string; paintColor: string }
  ): void {
    // Idempotent check
    const existing = room.players.find((p) => p.socketId === socket.id);
    if (!existing) {
      const playerInfo: MultiplayerPlayerInfo = {
        socketId: socket.id,
        playerName: (payload.playerName || 'Driver').slice(0, 20),
        carId: payload.carId || 'kuro_gtr',
        paintColor: payload.paintColor || '#1d4ed8',
        ready: false,
        lap: 1,
        checkpoint: 0,
      };
      room.players.push(playerInfo);
      if (room.hostId === 'server') {
        room.hostId = socket.id;
      }
    }
    socket.join(room.roomId);
    this.broadcastRoomState(room);
    this.io?.emit('rooms:updated', this.listRooms());
  }

  private removeSocketFromRoom(socket: Socket, roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const before = room.players.length;
    room.players = room.players.filter((p) => p.socketId !== socket.id);
    if (room.players.length === before) return;

    socket.leave(roomId);
    if (room.players.length === 0) {
      if (room.roomId !== 'public_apex_ring') {
        this.rooms.delete(roomId);
      } else {
        room.hostId = 'server';
        room.status = 'waiting';
      }
    } else if (room.hostId === socket.id) {
      room.hostId = room.players[0].socketId;
    }

    this.broadcastRoomState(room);
    this.io?.emit('rooms:updated', this.listRooms());
  }

  private broadcastRoomState(room: MultiplayerRoom): void {
    this.io?.to(room.roomId).emit('room:state', room);
  }

  public listRooms(): MultiplayerRoom[] {
    return Array.from(this.rooms.values());
  }
}

export const multiplayerManager = new MultiplayerManager();
