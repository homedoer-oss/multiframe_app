# MultiFrame Browser — Privacy Policy

**Language:** English · [Українська](PRIVACY-POLICY.uk.md)
**Last updated:** 2026-08-03

> **This is a draft prepared alongside the application's development, not a document reviewed by a lawyer.** Donation handling, tax/reporting obligations, and jurisdiction-specific requirements are called out in the project's technical specification as needing legal review before a public release. Treat this page as an accurate technical description of what the software does, and get it checked before relying on it as your only privacy disclosure.

## The short version

MultiFrame Browser does not have a backend. There is no server operated by this project that your data is sent to. Everything the application stores, it stores on your own computer. The only network requests it makes are the ones described below, all of which exist to make the application itself work — none of them report your usage back to the project.

## What is stored on your device

- **Per-profile browsing data** — cookies, local storage, IndexedDB, and cached files for each profile, in a storage partition isolated from every other profile. This is deleted immediately when a profile without "save session" enabled is closed, or when you reset a profile's data.
- **Proxy credentials** (username/password, if you set one) — encrypted using Windows' own secure storage (DPAPI, via `safeStorage`), tied to your Windows user account and this specific machine. Never written in plain text to any configuration file.
- **A MaxMind license key**, if you choose to use the GeoIP feature — encrypted the same way as proxy credentials.
- **Application settings and profile metadata** (names, colors, which locale/theme you picked, proxy host/port, which device-identity profile was assigned) — in a local, unencrypted configuration file, since none of this is a secret.
- **Backups you create explicitly** — a profile's data, encrypted with a password you choose, saved wherever you tell the export dialog to save it (by default, your Downloads folder). This password is chosen by you and is not stored by the application; if you lose it, the backup cannot be recovered.

## What leaves your device, and why

| Traffic | Destination | When | Purpose |
|---|---|---|---|
| Whatever the websites you configure a profile to visit require | Wherever you navigate, through your profile's configured proxy | Whenever you use a profile | Normal browsing — the entire point of the application |
| A single request to an IP-echo service | `httpbin.org`, over your **direct** (unproxied) connection | Once at application startup, and during proxy checks | Determines your real IP address, used only locally to detect proxies that leak it (a "transparent" proxy) — the result never leaves your device |
| GeoLite2 database download | `download.maxmind.com`, using **your own** MaxMind license key | Only when you click "Download / update database" in the GeoIP settings tab, and only if you've entered a key | Populates the local country/ASN lookup database; nothing about your profiles, proxies, or usage is sent — the request contains only your license key and the requested database edition |
| Update check | `github.com` (this project's Releases) | Only in a packaged, installed build; never in development builds | Checks whether a newer version is available |
| A single click on a partner proxy-provider or donation-report link | The provider's website, or the project's own site, opened in your **system's default browser** | Only if you explicitly click one | These never open inside the application, so no cookie from that site is ever set in any profile |

Nothing else calls out. In particular:

- **No analytics, telemetry, or crash reporting are built in.** This was a deliberate choice, not an oversight — the project's design principle throughout is that observing your own usage is not this application's business.
- **Crypto donation addresses are hardcoded** in the application itself and are never fetched from a server, so they can't be swapped by compromising a website.
- **Free/public proxy discovery** (the "Free proxies" tab) runs entirely over your direct connection to check the proxies you paste in — it does not phone home to the project in any way.

## Data shared with third parties

The application itself shares nothing with anyone. If you choose to use a third-party proxy provider, a MaxMind account, or a paid VPN/proxy service, **that provider's own privacy policy governs what they see** — typically, at minimum, the traffic that passes through their network. This is unavoidable for any proxy or VPN product and isn't specific to this application.

## Your responsibility

Because MultiFrame Browser is a general-purpose isolation tool, what you do with a given profile (which accounts you log into, which proxy you route it through) is entirely up to you, and this policy can't describe data handling for services outside the application itself.

## Changes to this policy

Meaningful changes will be reflected in this file's "Last updated" date and in the project's release notes.
