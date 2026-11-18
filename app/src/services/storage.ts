import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = 'bokk_native_favorites';
const SUBSCRIBER_KEY = 'bokk_native_subscriber';

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
  }
};

