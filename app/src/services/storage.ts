import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

const FAVORITES_KEY = 'bokk_native_favorites';
const SUBSCRIBER_KEY = 'bokk_native_subscriber';
const DEVICE_ID_KEY = 'bokk_native_device_id';
const LAST_WATCHED_KEY = 'bokk_last_watched';
const DISABLED_CACHE_KEY = 'bokk_disabled_cache';
const DISABLED_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const StorageService = {
  async getFavorites(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(FAVORITES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async toggleFavorite(channelId: string | number): Promise<string[]> {
    try {
      const idStr = String(channelId);
      const favs = await this.getFavorites();
      const next = favs.includes(idStr) ? favs.filter(id => id !== idStr) : [...favs, idStr];
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    } catch {
      return [];
    }
  },

  async getSubscriber(): Promise<any | null> {
    try {
      const raw = await AsyncStorage.getItem(SUBSCRIBER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async setSubscriber(data: any): Promise<void> {
    try {
      await AsyncStorage.setItem(SUBSCRIBER_KEY, JSON.stringify(data));
    } catch {}
  },

  async removeSubscriber(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SUBSCRIBER_KEY);
    } catch {}
  },

  async getDeviceId(): Promise<string> {
    try {
      let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        await AsyncStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch {
      return `dev_${Date.now()}`;
    }
  },

  getDeviceName(): string {
    const brand = Device.brand ? Device.brand.charAt(0).toUpperCase() + Device.brand.slice(1) : '';
    const model = Device.modelName || 'Smartphone';
    return brand ? `${brand} ${model}` : model;
  },

  // ── Historique des dernières chaînes regardées ──
  async addLastWatched(channelId: string): Promise<void> {
    try {
      const existing = await this.getLastWatched();
      const filtered = existing.filter(id => id !== channelId);
      const next = [channelId, ...filtered].slice(0, 10);
      await AsyncStorage.setItem(LAST_WATCHED_KEY, JSON.stringify(next));
    } catch {}
  },

  async getLastWatched(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(LAST_WATCHED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  // ── Cache intelligent des chaînes désactivées (TTL 5 min) ──
  async getCachedDisabledIds(): Promise<{ ids: string[]; names: string[]; ts: number } | null> {
    try {
      const raw = await AsyncStorage.getItem(DISABLED_CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as { ids: string[]; names: string[]; ts: number };
      if (Date.now() - data.ts > DISABLED_CACHE_TTL) return null;
      return data;
    } catch {
      return null;
    }
  },

  async setCachedDisabledIds(ids: string[], names: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(DISABLED_CACHE_KEY, JSON.stringify({ ids, names, ts: Date.now() }));
    } catch {}
  },
};
