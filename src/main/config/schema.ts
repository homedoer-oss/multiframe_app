import { z } from 'zod';
import { MAX_PROFILES, SUPPORTED_LOCALES } from '@shared/constants';

/** Ф-5.7 — версіонована схема з міграціями. Підняти при будь-якій несумісній зміні. */
export const CONFIG_VERSION = 1;

export const proxySchema = z.object({
  mode: z.enum(['direct', 'https', 'socks5']),
  host: z.string().default(''),
  port: z.number().int().min(0).max(65535).default(0),
  username: z.string().optional(),
  hasPassword: z.boolean().default(false),
  class: z.enum(['manual', 'imported', 'test']).default('manual'),
});

export const identitySchema = z.object({
  userAgent: z.string(),
  platform: z.string(),
  platformVersion: z.string(),
  architecture: z.string(),
  logicalWidth: z.number().int().positive(),
  dpr: z.number().positive(),
  screenWidth: z.number().int().positive(),
  screenHeight: z.number().int().positive(),
  hardwareConcurrency: z.number().int().positive(),
  deviceMemory: z.number().positive(),
  gpuVendor: z.string(),
  gpuRenderer: z.string(),
  timezone: z.string(),
  locale: z.string(),
  acceptLanguages: z.string(),
  noiseSeed: z.string(),
  clockOffsetMs: z.number().int(),
});

export const profileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  color: z.string(),
  startUrl: z.string().default('about:blank'),
  persistSession: z.boolean().default(false),
  proxy: proxySchema,
  identity: identitySchema,
  /** Ф-4.6 — країна exit-IP призначеного проксі, визначена при `proxy:assign`. */
  exitCountry: z.string().nullable().default(null),
  userZoom: z.number().min(0.5).max(2).default(1),
  certificatePolicy: z.enum(['block', 'ask', 'trust']).default('block'),
  trustedFingerprints: z.array(z.string()).default([]),
});

export const settingsSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  theme: z.enum(['dark', 'light']).default('dark'),
  showFreeProxyTab: z.boolean().default(true),
  showPaidProxyTab: z.boolean().default(true),
  showSupportTab: z.boolean().default(true),
  allowProviderListUpdate: z.boolean().default(false),
  proxyCheckConcurrency: z.number().int().min(1).max(256).default(64),
  /** Ф-4.6 — дата останнього завантаження бази MaxMind GeoLite2, не секрет. */
  geoipLastUpdated: z.string().nullable().default(null),
});

export const configSchema = z.object({
  version: z.number().int(),
  settings: settingsSchema,
  profiles: z.array(profileSchema).max(MAX_PROFILES),
  lastSession: z
    .object({
      profileCount: z.number().int().min(1).max(MAX_PROFILES),
      /** Порядок відповідає позиціям у сітці. */
      order: z.array(z.string()),
      urls: z.record(z.string(), z.string()),
    })
    .nullable()
    .default(null),
});

export type Config = z.infer<typeof configSchema>;
