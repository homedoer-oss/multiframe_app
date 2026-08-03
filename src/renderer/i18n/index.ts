import i18next from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';
import { FALLBACK_LOCALE, SUPPORTED_LOCALES, type Locale } from '@shared/constants';

import en from './locales/en.json';
import uk from './locales/uk.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

/**
 * Ф-8.10 — ICU MessageFormat: форми множини й інтерполяція.
 *          Конкатенація рядків для побудови речень заборонена.
 * Ф-8.12 — ланцюжок відкату: ключ → en → дослівний ключ.
 *
 * ⚠️ Ф-8.7 — глобальний ключ Chromium --lang НЕ використовується:
 *    він змінив би локаль усіх сесій і типовий Accept-Language,
 *    зв'язавши мову інтерфейсу з мовними параметрами профілів.
 */
const resources = {
  en: { translation: en },
  uk: { translation: uk },
  de: { translation: de },
  es: { translation: es },
  fr: { translation: fr },
} as const;

export async function initI18n(locale: Locale): Promise<void> {
  await i18next
    .use(ICU)
    .use(initReactI18next)
    .init({
      resources,
      lng: SUPPORTED_LOCALES.includes(locale) ? locale : FALLBACK_LOCALE,
      fallbackLng: FALLBACK_LOCALE,
      interpolation: { escapeValue: false },
      returnNull: false,
      saveMissing: import.meta.env.DEV,
      missingKeyHandler: (_lng, _ns, key) => {
        if (import.meta.env.DEV) console.warn(`[i18n] відсутній ключ: ${key}`);
      },
    });
}

/** Ф-8.3 — перемикання без перезапуску і без перезавантаження фреймів. */
export async function changeLocale(locale: Locale): Promise<void> {
  await i18next.changeLanguage(locale);
}
