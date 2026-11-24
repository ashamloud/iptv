// ═══════════════════════════════════════════════════════════════
// BOKK TV — Service Firebase Cloud Firestore (REST API Natif)
// Solution 3 : 1 Compte = 1 Numéro Unique = 1 Seul Écran Actif
// ═══════════════════════════════════════════════════════════════

import { Channel } from '../data/channels';
import { StorageService } from './storage';

const PROJECT_ID = 'bokk-tv';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export interface Subscriber {
  id: string; // Identifiant clair basé sur le numéro (ex: "BK-771234567")
  phone: string;
  prenom: string;
  status: 'active' | 'suspended' | 'expired';
  createdAt: string;
  expiresAt: string;
  activeSessionId?: string;
  activeDeviceName?: string;
  lastActiveAt?: string;
}

export function validatePhone(rawPhone: string): {
  valid: boolean;
  error?: string;
  national?: string;
  id?: string;
  display?: string;
} {
  if (!rawPhone) return { valid: false, error: 'Numéro de téléphone requis.' };
  let clean = rawPhone.trim().replace(/[\s\.\-\(\)]/g, '');
  if (clean.startsWith('00')) clean = '+' + clean.slice(2);

  let national = '';
  if (clean.startsWith('+221')) {
    national = clean.slice(4);
  } else if (clean.startsWith('221') && clean.length === 12) {
    national = clean.slice(3);
  } else if (/^(70|75|76|77|78)\d{7}$/.test(clean)) {
    national = clean;
  }

  if (national) {
    if (!/^(70|75|76|77|78)\d{7}$/.test(national)) {
      return {
        valid: false,
        error: 'Numéro sénégalais invalide (doit commencer par 70, 75, 76, 77 ou 78 et comporter 9 chiffres).'
      };
    }
    if (/^(\d)\1{8}$/.test(national) || /^7[0-8](\d)\1{6}$/.test(national)) {
      return { valid: false, error: 'Numéro non valide (chiffres répétés suspects).' };
    }
    return {
      valid: true,
      national: national,
      id: `BK-${national}`,
      display: national.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4')
    };
  }

  if (/^\+[1-9]\d{7,14}$/.test(clean)) {
    const digits = clean.replace(/\D/g, '');
    if (/^(\d)\1{7,}$/.test(digits)) {
      return { valid: false, error: 'Numéro international non valide (chiffres répétés).' };
    }
    return {
      valid: true,
      national: digits,
      id: `BK-${digits}`,
      display: clean
    };
  }

  return {
    valid: false,
    error: 'Numéro invalide. Entrez un numéro sénégalais (ex: 77 123 45 67) ou international avec indicatif (+33...).'
  };
}

export function normalizePhone(rawPhone: string): string {
  const v = validatePhone(rawPhone);
  return v.valid && v.national ? v.national : (rawPhone || '').replace(/\D/g, '');
}

export interface DisabledChannelsData {
  ids: string[];
  names: string[];
}

export interface AdminMessage {
  id: string;
  title: string;
  body: string;
  targetPhone: string; // '' = broadcast à tous
  createdAt: string;
  expiresAt?: string;  // si absent → permanent jusqu'à suppression
}

export const FirebaseService = {
  // ── 0. Messages Admin → Utilisateurs (popup in-app) ──
  async getAdminMessages(subscriberPhone: string = ''): Promise<AdminMessage[]> {
    try {
      const url = `${FIRESTORE_BASE}/admin_messages?pageSize=50&_t=${Date.now()}`;
      const res = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.documents) return [];

      const now = new Date();
      return data.documents
        .map((doc: any) => {
          const f = doc.fields || {};
          const parts = doc.name.split('/');
          const docId = parts[parts.length - 1];
          return {
            id: docId,
            title: f.title?.stringValue || 'Message BOKK TV',
            body: f.body?.stringValue || '',
            targetPhone: f.targetPhone?.stringValue || '',
            createdAt: f.createdAt?.timestampValue || '',
            expiresAt: f.expiresAt?.timestampValue || '',
          } as AdminMessage;
        })
        .filter((msg: AdminMessage) => {
          // Filtrer les messages expirés
          if (msg.expiresAt && new Date(msg.expiresAt) < now) return false;
          // Filtrer : broadcast (targetPhone vide) OU ciblé vers cet abonné
          if (msg.targetPhone && msg.targetPhone !== subscriberPhone) return false;
          return msg.body.trim().length > 0;
        });
    } catch {
      return [];
    }
  },

  // ── 1. Chaînes désactivées ET chaînes signalées (avec pagination et anti-cache) ──
  async getDisabledChannels(): Promise<DisabledChannelsData> {
    try {
      const allIds: string[] = [];
      const allNames: string[] = [];

      // A. Chaînes masquées par l'admin (disabled_channels)
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
            const docId = parts[parts.length - 1];
            if (docId) allIds.push(String(docId));
            const chId = doc.fields?.channelId?.stringValue || doc.fields?.id?.stringValue;
            if (chId) allIds.push(String(chId));
            const name = doc.fields?.name?.stringValue;
            if (name) allNames.push(name.toLowerCase().trim());
          });
        }
        pageToken = data.nextPageToken || '';
      } while (pageToken);

      // B. Chaînes signalées comme HS (reported_channels) — Masquées pour le public
      pageToken = '';
      do {
        const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
        const url = `${FIRESTORE_BASE}/reported_channels?pageSize=300&_t=${Date.now()}${tokenParam}`;
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
            const docId = parts[parts.length - 1];
            if (docId) allIds.push(String(docId));
            const chId = doc.fields?.id?.stringValue || doc.fields?.channelId?.stringValue;
            if (chId) allIds.push(String(chId));
            const name = doc.fields?.name?.stringValue;
            if (name) allNames.push(name.toLowerCase().trim());
          });
        }
        pageToken = data.nextPageToken || '';
      } while (pageToken);

      return {
        ids: Array.from(new Set(allIds)),
        names: Array.from(new Set(allNames))
      };
    } catch {
      return { ids: [], names: [] };
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

  // ── 3. Authentification par Numéro de Téléphone Unique (1 Compte = 1 Numéro) ──
  async loginOrRegisterWithPhone(rawPhone: string, prenom: string = ''): Promise<{ subscriber: Subscriber | null; isExisting?: boolean; error?: string }> {
    const val = validatePhone(rawPhone);
    if (!val.valid || !val.national || !val.id) {
      return { subscriber: null, error: val.error || 'Numéro invalide' };
    }

    const standardId = val.id; // Ex: "BK-771234567"
    const nationalPhone = val.national; // Ex: "771234567"
    const candidateIds = [standardId, nationalPhone, `221${nationalPhone}`];

    try {
      // A. Vérifier si le compte existe déjà sous l'un des formats d'identifiant
      for (const candId of candidateIds) {
        const url = `${FIRESTORE_BASE}/subscribers/${candId}`;
        const checkRes = await fetch(url);
        if (checkRes.ok) {
          const doc = await checkRes.json();
          if (doc.fields) {
            const f = doc.fields;
            const subObj: Subscriber = {
              id: candId,
              phone: f.phone?.stringValue || nationalPhone,
              prenom: f.prenom?.stringValue || prenom.trim() || 'Abonné',
              status: (f.status?.stringValue as any) || 'active',
              createdAt: f.createdAt?.timestampValue || new Date().toISOString(),
              expiresAt: f.expiresAt?.timestampValue || new Date(Date.now() + 30 * 86400000).toISOString(),
              activeSessionId: f.activeSessionId?.stringValue,
              activeDeviceName: f.activeDeviceName?.stringValue
            };
            await StorageService.setSubscriber(subObj);
            return { subscriber: subObj, isExisting: true };
          }
        }
      }

      // B. Si nouveau numéro : Création avec 30 jours offerts et ID = BK-<phone>
      const cleanPrenom = prenom.trim() || 'Abonné BOKK';
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const subObj: Subscriber = {
        id: standardId,
        phone: nationalPhone,
        prenom: cleanPrenom,
        status: 'active',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      };

      const payload = {
        fields: {
          id: { stringValue: standardId },
          phone: { stringValue: nationalPhone },
          prenom: { stringValue: cleanPrenom },
          status: { stringValue: 'active' },
          createdAt: { timestampValue: now.toISOString() },
          expiresAt: { timestampValue: expiresAt.toISOString() }
        }
      };

      const createUrl = `${FIRESTORE_BASE}/subscribers/${standardId}`;
      await fetch(createUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      await StorageService.setSubscriber(subObj);
      return { subscriber: subObj, isExisting: false };
    } catch (e: any) {
      return { subscriber: null, error: e?.message || 'Erreur réseau' };
    }
  },

  // Connexion par Numéro direct ou Identifiant (BK-...)
  async loginSubscriber(idOrPhone: string): Promise<Subscriber | null> {
    const raw = (idOrPhone || '').trim();
    if (!raw) return null;

    const val = validatePhone(raw);
    const candidateIds: string[] = [];

    if (val.valid && val.id && val.national) {
      candidateIds.push(val.id);
      candidateIds.push(val.national);
      candidateIds.push(`221${val.national}`);
    } else {
      const clean = raw.toUpperCase();
      candidateIds.push(clean);
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 6) {
        candidateIds.push(`BK-${digits}`);
        candidateIds.push(digits);
      }
    }

    try {
      for (const candId of candidateIds) {
        const url = `${FIRESTORE_BASE}/subscribers/${candId}`;
        const res = await fetch(url);
        if (res.ok) {
          const doc = await res.json();
          if (doc.fields) {
            const f = doc.fields;
            const subObj: Subscriber = {
              id: candId,
              phone: f.phone?.stringValue || val.national || candId,
              prenom: f.prenom?.stringValue || 'Abonné',
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
      }
      return null;
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
  },

  // ── 6. Déclarations de Paiements Wave (Option C - Notification Automatique & Validation 1-Clic) ──
  async submitPaymentClaim(claim: {
    subscriberId: string;
    subscriberName?: string;
    payerPhone: string;
    plan: '1m' | '3m' | '12m';
    amount: number;
    days: number;
    txId?: string;
    autoCreated?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const subId = claim.subscriberId.trim();
      const payer = claim.payerPhone.trim();
      if (!subId || !payer) {
        return { success: false, error: 'Numéro de compte et numéro Wave requis' };
      }

      const cleanClaimId = `${subId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
      const url = `${FIRESTORE_BASE}/payment_claims/${cleanClaimId}`;
      const payload = {
        fields: {
          claimId: { stringValue: cleanClaimId },
          subscriberId: { stringValue: subId },
          subscriberName: { stringValue: claim.subscriberName || '' },
          payerPhone: { stringValue: payer },
          plan: { stringValue: claim.plan },
          amount: { integerValue: String(claim.amount) },
          days: { integerValue: String(claim.days) },
          txId: { stringValue: claim.txId || '' },
          autoCreated: { booleanValue: claim.autoCreated !== false },
          status: { stringValue: 'pending' },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return { success: res.ok };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Erreur réseau' };
    }
  }
};
