// ═══════════════════════════════════════════════════════════════
// BOKK TV — Service Firebase Cloud Firestore (REST API Natif)
// Solution 3 : 1 Compte = 1 Numéro Unique = 1 Seul Écran Actif
// ═══════════════════════════════════════════════════════════════

import { Channel } from '../data/channels';
import { StorageService } from './storage';

const PROJECT_ID = 'bokk-tv';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export interface Subscriber {
  id: string; // Clé unique : Numéro de téléphone normalisé (ex: "221771234567")
  phone: string;
  prenom: string;
  status: 'active' | 'suspended' | 'expired';
  createdAt: string;
  expiresAt: string;
  activeSessionId?: string;
  activeDeviceName?: string;
  lastActiveAt?: string;
}

export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';
  // Supprimer espaces, tirets, parenthèses, plus
  const digits = rawPhone.replace(/\D/g, '');
  // Si numéro sénégalais local 9 chiffres (77xxxxxxx), préfixer avec 221
  if (digits.length === 9 && (digits.startsWith('70') || digits.startsWith('75') || digits.startsWith('76') || digits.startsWith('77') || digits.startsWith('78'))) {
    return `221${digits}`;
  }
  return digits;
}

export const FirebaseService = {
  // ── 1. Chaînes désactivées (avec pagination et anti-cache) ──
  async getDisabledChannels(): Promise<string[]> {
    try {
      const allIds: string[] = [];
      let pageToken = '';

      do {
        const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
        const url = `${FIRESTORE_BASE}/disabled_channels?pageSize=300&_t=${Date.now()}${tokenParam}`;
        const res = await fetch(url, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        if (!res.ok) break;
        const data = await res.json();
        if (data.documents) {
          data.documents.forEach((doc: any) => {
            const parts = doc.name.split('/');
            allIds.push(parts[parts.length - 1]);
          });
        }
        pageToken = data.nextPageToken || '';
      } while (pageToken);

      return allIds;
    } catch {
      return [];
    }
  },

  // ── 2. Signalement d'une chaîne HS ──
  async reportChannel(channel: Channel): Promise<boolean> {
    try {
      const channelId = String(channel.id);
      const url = `${FIRESTORE_BASE}/reported_channels/${channelId}`;
      const payload = {
        fields: {
          id: { stringValue: channelId },
          name: { stringValue: channel.name },
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

  // ── 3. Authentification par Numéro de Téléphone Unique (Connexion / Inscription) ──
  async loginOrRegisterWithPhone(rawPhone: string, prenom: string = ''): Promise<Subscriber | null> {
    const cleanPhone = normalizePhone(rawPhone);
    if (!cleanPhone || cleanPhone.length < 6) return null;

    try {
      const url = `${FIRESTORE_BASE}/subscribers/${cleanPhone}`;
      
      // A. Vérifier si le compte existe déjà
      const checkRes = await fetch(url);
      if (checkRes.ok) {
        const doc = await checkRes.json();
        if (doc.fields) {
          const f = doc.fields;
          const subObj: Subscriber = {
            id: cleanPhone,
            phone: cleanPhone,
            prenom: f.prenom?.stringValue || prenom.trim() || 'Abonné',
            status: (f.status?.stringValue as any) || 'active',
            createdAt: f.createdAt?.timestampValue || new Date().toISOString(),
            expiresAt: f.expiresAt?.timestampValue || new Date(Date.now() + 30 * 86400000).toISOString(),
            activeSessionId: f.activeSessionId?.stringValue,
            activeDeviceName: f.activeDeviceName?.stringValue
          };
          await StorageService.setSubscriber(subObj);
          return subObj;
        }
      }

      // B. Si nouveau numéro : Création automatique avec 30 jours offerts
      const cleanPrenom = prenom.trim() || 'Abonné BOKK';
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const subObj: Subscriber = {
        id: cleanPhone,
        phone: cleanPhone,
        prenom: cleanPrenom,
        status: 'active',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      };

      const payload = {
        fields: {
          id: { stringValue: cleanPhone },
          phone: { stringValue: cleanPhone },
          prenom: { stringValue: cleanPrenom },
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
    } catch {
      return null;
    }
  },

  // Rétrocompatibilité : connexion avec ancien identifiant BK-XXXX
  async loginSubscriber(idOrPhone: string): Promise<Subscriber | null> {
    const clean = idOrPhone.trim().toUpperCase();
    if (!clean) return null;

    try {
      // Tenter d'abord comme numéro normalisé
      const phoneDigits = normalizePhone(clean);
      const targetId = phoneDigits.length >= 6 ? phoneDigits : clean;

      const url = `${FIRESTORE_BASE}/subscribers/${targetId}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const doc = await res.json();
      if (!doc.fields) return null;

      const f = doc.fields;
      const subObj: Subscriber = {
        id: targetId,
        phone: f.phone?.stringValue || targetId,
        prenom: f.prenom?.stringValue || 'Abonné',
        status: (f.status?.stringValue as any) || 'active',
        createdAt: f.createdAt?.timestampValue || new Date().toISOString(),
        expiresAt: f.expiresAt?.timestampValue || new Date(Date.now() + 30 * 86400000).toISOString(),
        activeSessionId: f.activeSessionId?.stringValue,
        activeDeviceName: f.activeDeviceName?.stringValue
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

  // ── 4. Solution 3 : Gestion de la Session Unique (1 Écran Simultané) ──
  
  // A. Prendre possession de la session de diffusion sur cet appareil
  async claimActiveSession(subId: string, sessionId: string, deviceName: string): Promise<boolean> {
    if (!subId || !sessionId) return false;
    try {
      const url = `${FIRESTORE_BASE}/subscribers/${subId}?updateMask.fieldPaths=activeSessionId&updateMask.fieldPaths=activeDeviceName&updateMask.fieldPaths=lastActiveAt`;
      const payload = {
        fields: {
          activeSessionId: { stringValue: sessionId },
          activeDeviceName: { stringValue: deviceName },
          lastActiveAt: { timestampValue: new Date().toISOString() }
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

  // B. Vérifier en continu si un autre appareil a pris le flux
  async verifyActiveSession(subId: string, mySessionId: string): Promise<{ isValid: boolean; otherDevice?: string; isSuspended?: boolean }> {
    if (!subId || !mySessionId) return { isValid: true };
    try {
      const url = `${FIRESTORE_BASE}/subscribers/${subId}`;
      const res = await fetch(url);
      if (!res.ok) return { isValid: true };
      const doc = await res.json();
      if (!doc.fields) return { isValid: true };

      const f = doc.fields;

      // Compte suspendu par l'administrateur
      if (f.status?.stringValue === 'suspended') {
        return { isValid: false, isSuspended: true };
      }

      const remoteSession = f.activeSessionId?.stringValue;
      const remoteDevice = f.activeDeviceName?.stringValue || 'Un autre écran';

      // Si un autre écran a pris la main avec un sessionId différent
      if (remoteSession && remoteSession !== mySessionId) {
        return {
          isValid: false,
          otherDevice: remoteDevice
        };
      }

      return { isValid: true };
    } catch {
      return { isValid: true };
    }
  },

  // C. Libérer la session quand l'utilisateur quitte la vidéo
  async releaseActiveSession(subId: string, mySessionId: string): Promise<void> {
    if (!subId || !mySessionId) return;
    try {
      const checkRes = await fetch(`${FIRESTORE_BASE}/subscribers/${subId}`);
      if (!checkRes.ok) return;
      const doc = await checkRes.json();
      if (doc.fields?.activeSessionId?.stringValue === mySessionId) {
        const url = `${FIRESTORE_BASE}/subscribers/${subId}?updateMask.fieldPaths=activeSessionId`;
        const payload = {
          fields: {
            activeSessionId: { stringValue: '' }
          }
        };
        await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    } catch {}
  },

  // ── 5. Chaînes M3U Cloud synchronisées (avec anti-cache) ──
  async getM3uChannels(): Promise<Channel[]> {
    try {
      const url = `${FIRESTORE_BASE}/m3u_playlists?pageSize=100&_t=${Date.now()}`;
      const res = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
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
          const chunksUrl = `${doc.name}/chunks?pageSize=100&_t=${Date.now()}`;
          const chunksRes = await fetch(chunksUrl, {
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
          });
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
