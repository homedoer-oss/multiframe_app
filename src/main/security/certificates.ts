import { app, type WebContents } from 'electron';
import type { Profile } from '@shared/types';
import { log } from '../logging/logger';
import { ownerOf } from '../window/Frame';

type ProfileLookup = (profileId: string) => Profile | undefined;
type PromptEmitter = (data: {
  profileId: string;
  url: string;
  fingerprint: string;
  issuer: string;
}) => void;

/**
 * Ф-2.5 — політика помилок сертифікатів на профіль:
 *   block (типово) — з'єднання відхиляється;
 *   ask            — питаємо користувача (оболонка показує запит);
 *   trust          — приймається лише відбиток із trustedFingerprints.
 *
 * ⚠️ Ф-10.3 — для профілю з тестовим (безкоштовним) проксі політика
 *    примусово block і НЕ може бути пом'якшена. Безкоштовний проксі
 *    з прийнятим сертифікатом — це повний MITM над сесіями користувача.
 */
export function installCertificateHandler(lookup: ProfileLookup, emitPrompt: PromptEmitter): void {
  app.on('certificate-error', (event, webContents: WebContents, url, error, certificate, callback) => {
    const profileId = ownerOf(webContents);
    const profile = profileId ? lookup(profileId) : undefined;

    // Невідоме походження — завжди відхиляємо.
    if (!profile) {
      callback(false);
      return;
    }

    const fingerprint = certificate.fingerprint;

    // Ф-10.3 — тестовий проксі не може отримати виняток довіри за жодних умов.
    if (profile.proxy.class === 'test') {
      log.warn({ code: 'cert.blocked_test_proxy', profileId: profile.id, url, error, fingerprint });
      event.preventDefault();
      callback(false);
      return;
    }

    if (profile.certificatePolicy === 'trust' && profile.trustedFingerprints.includes(fingerprint)) {
      log.warn({ code: 'cert.accepted_by_fingerprint', profileId: profile.id, url, fingerprint });
      event.preventDefault();
      callback(true);
      return;
    }

    if (profile.certificatePolicy === 'ask') {
      emitPrompt({ profileId: profile.id, url, fingerprint, issuer: certificate.issuerName });
    }

    log.warn({
      code: 'cert.blocked',
      profileId: profile.id, url, error, fingerprint,
      policy: profile.certificatePolicy,
    });
    event.preventDefault();
    callback(false);
  });
}
