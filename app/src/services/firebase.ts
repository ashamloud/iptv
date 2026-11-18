import { StorageService } from './storage';
import { Channel } from '../data/channels';

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/bokk-tv/databases/(default)/documents';

export interface Subscriber {
  id: string;
  prenom: string;
  phone?: string;
  status: 'active' | 'suspended';
  createdAt?: string;
  expiresAt?: string;
}

export const FirebaseService = {
  async getDisabledChannels(): Promise<string[]> {
    try {
      const res = await fetch(`${FIRESTORE_BASE}/disabled_channels`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.documents) return [];
      return data.documents.map((doc: any) => {
        const parts = doc.name.split('/');
        return parts[parts.length - 1];
      });
    } catch {
      return [];
    }
  },

  async reportChannel(channel: { id: number | string; name: string; group?: string; url?: string }): Promise<boolean> {
    try {
      const idStr = String(channel.id);
      const url = `${FIRESTORE_BASE}/reported_channels/${idStr}`;
      const payload = {
        fields: {
          channelId: { integerValue: String(channel.id) },
          name: { stringValue: channel.name || 'Chaîne inconnue' },
          group: { stringValue: channel.group || 'Général' },
          url: { stringValue: channel.url || '' },
          reportCount: { integerValue: '1' },
          status: { stringValue: 'reported' },
          lastReportedAt: { timestampValue: new Date().toISOString() }
        }
      };
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async registerSubscriber(prenom: string, phone: string = ''): Promise<Subscriber | null> {
    const cleanPrenom = prenom.trim();
    if (!cleanPrenom) return null;

    const num = Math.floor(1000 + Math.random() * 9000);
    const id = `BK-${num}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const subObj: Subscriber = {
      id,
      prenom: cleanPrenom,
      phone: phone.trim(),
      status: 'active',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    try {
      const url = `${FIRESTORE_BASE}/subscribers/${id}`;
      const payload = {
        fields: {
          id: { stringValue: id },
          prenom: { stringValue: cleanPrenom },
          phone: { stringValue: phone.trim() },
          status: { stringValue: 'active' },
          createdAt: { timestampValue: now.toISOString() },
          expiresAt: { timestampValue: expiresAt.toISOString() }
        }
      };

      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      await StorageService.setSubscriber(subObj);
      return subObj;
    } catch (e) {
      await StorageService.setSubscriber(subObj);
      return subObj;
    }
  },

  async loginSubscriber(id: string): Promise<Subscriber | null> {
    const cleanId = id.trim().toUpperCase();
    if (!cleanId) return null;

    try {
      const url = `${FIRESTORE_BASE}/subscribers/${cleanId}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const doc = await res.json();
      if (!doc.fields) return null;

      const f = doc.fields;
      const subObj: Subscriber = {
        id: cleanId,
        prenom: f.prenom?.stringValue || 'Abonné',
        phone: f.phone?.stringValue || '',
        status: (f.status?.stringValue as any) || 'active',
        createdAt: f.createdAt?.timestampValue || new Date().toISOString(),
        expiresAt: f.expiresAt?.timestampValue || new Date(Date.now() + 30 * 86400000).toISOString()
      };

      await StorageService.setSubscriber(subObj);
      return subObj;
    } catch {
      return null;
    }
  },

  async checkSubscriberStatus(id: string): Promise<{ status: string; expiresAt?: string } | null> {
    try {
      const url = `${FIRESTORE_BASE}/subscribers/${id}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const doc = await res.json();
      if (!doc.fields) return null;

      return {
        status: doc.fields.status?.stringValue || 'active',
        expiresAt: doc.fields.expiresAt?.timestampValue
      };
    } catch {
      return null;
    }
  },

  async getM3uChannels(): Promise<Channel[]> {
    try {
      const res = await fetch(`${FIRESTORE_BASE}/m3u_playlists`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.documents) return [];

      const activePlaylists = data.documents.filter((doc: any) => {
        const fields = doc.fields || {};
        return fields.enabled?.booleanValue !== false;
      });

      const allChannels: Channel[] = [];
      const chunkPromises = activePlaylists.map(async (doc: any) => {
        try {
          const chunksRes = await fetch(`${doc.name}/chunks`);
          if (!chunksRes.ok) return;
          const chunksData = await chunksRes.json();
          if (!chunksData.documents) return;
          chunksData.documents.forEach((cd: any) => {
            const rawJson = cd.fields?.channelsJson?.stringValue;
            if (rawJson) {
              try {
                const parsed = JSON.parse(rawJson);
                if (Array.isArray(parsed)) allChannels.push(...parsed);
              } catch {}
            }
          });
        } catch {}
      });

      await Promise.all(chunkPromises);
      return allChannels;
    } catch {
      return [];
    }
  }
};

