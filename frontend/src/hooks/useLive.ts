// src/hooks/useLive.ts
// Sprint 6C: today's deterministic daily event with realtime updates.
// Initial snapshot via REST (existing JWT interceptor), then a Socket.io
// channel authenticated with the same token receives `daily_event:updated`
// pushes (day rollover broadcast to the global room). The client never
// sends event data — the subscribe payload is ignored by the server.
import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../lib/api';

export type DailyEventType = 'DOUBLE_XP_WORLD' | 'BOSS_BONUS';

export interface DailyEvent {
  /** YYYY-MM-DD (UTC) — deterministic key of the event. */
  date: string;
  type: DailyEventType;
  title: string;
  description: string;
  xpMultiplier: number;
  bossCoinBonus: number;
}

type UseLiveReturn = {
  event: DailyEvent | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
};

export const useLive = (): UseLiveReturn => {
  const [event, setEvent] = useState<DailyEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    let socket: Socket | null = null;
    let cancelled = false;

    const bootstrap = async () => {
      // 1) Initial snapshot (REST, server-derived).
      try {
        const resp = await api.get('/api/live/daily-event');
        if (!cancelled) {
          setEvent(resp.data as DailyEvent);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Daily event unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }

      // 2) Realtime channel: same JWT as REST (handshake auth).
      const base = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      socket = io(base, { auth: { token } });
      socket.on('connect', () => {
        if (!cancelled) setConnected(true);
      });
      socket.on('disconnect', () => {
        if (!cancelled) setConnected(false);
      });
      socket.on('daily_event:updated', (next: DailyEvent) => {
        if (!cancelled) setEvent(next);
      });
      // Read-only subscribe; server ignores anything we put in the payload.
      socket.emit('daily_event:subscribe');
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (socket) socket.disconnect();
    };
  }, []);

  return { event, connected, loading, error };
};

export default useLive;
