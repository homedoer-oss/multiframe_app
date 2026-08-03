# MultiFrame Browser — User Guide

**Language:** English · [Українська](USER-GUIDE.uk.md)

MultiFrame Browser is a Windows desktop application that runs 1 to 9 independent web sessions side by side in a grid. Each session ("profile") has its own storage, its own proxy, and its own device-identity fingerprint — so from the outside, nine profiles in one window look like nine different people on nine different computers.

This guide covers how to use the application. For what data it stores and sends, see the [Privacy Policy](PRIVACY-POLICY.en.md). For the terms of use, see the [EULA](EULA.en.md).

---

## 1. Installing

Two build types are available:

- **Installer (`MultiFrame Browser-<version>-setup.exe`)** — a standard NSIS installer. Lets you choose the install location and creates Start Menu shortcuts.
- **Portable (`MultiFrame Browser-<version>-portable.exe`)** — a single file that runs directly with no installation. All its data stays next to the executable (or wherever Windows keeps portable-app data on this machine) rather than in your regular user profile — useful for running the app from a USB drive or keeping it fully separate from the rest of your system.

Neither build is currently signed with a code-signing certificate. Windows SmartScreen may show an "unrecognized app" warning on first run — this is expected until a certificate is obtained (tracked internally, not a sign of tampering). Click **More info → Run anyway** if you trust the source you downloaded it from.

## 2. First launch

On first launch you'll see the **Launcher** screen:

1. Pick how many profiles you want (1–9). This decides the grid shape (e.g., 4 profiles = 2×2, 9 profiles = 3×3).
2. If you have a previously saved session, a **"Restore previous session"** checkbox becomes available — check it to reopen the same addresses and profiles you had last time.
3. Click **Open workspace**.

Cold start to a working grid normally takes a few seconds.

## 3. The workspace grid

Each cell in the grid is one profile. Every cell has its own toolbar:

| Control | Purpose |
|---|---|
| Profile name | Shown on the left; color-coded per profile |
| ← / → | Back / forward in that profile's history |
| ⟳ / ✕ | Reload, or stop loading while a page is loading |
| Address bar | Type a URL and press Enter |
| ⌕ | Find on page (disabled until a page is open) |
| ⚙ | Open Developer Tools for that tab (disabled until a page is open) |
| − / 100% / + | Zoom this profile's viewport in or out |
| Proxy mode label | Shows the connection mode currently in effect (Direct / HTTPS / SOCKS5) |
| ▢ / ▣ | Maximize this cell to fill the window, or restore the grid |

**A cell with no address entered yet is intentionally empty** ("Enter an address to start") — the underlying browser session for that profile isn't created until you actually navigate somewhere. This keeps startup fast and memory low when you don't need all profiles at once.

**Idle profiles fall asleep.** A profile you haven't touched in about 10 minutes (and that isn't focused or maximized) automatically releases its browser session to free memory. Clicking back into it, or entering an address, reopens it at the same URL — you won't notice anything except a brief reload.

## 4. Keyboard shortcuts

These work even while your keyboard focus is inside a website in one of the frames:

| Shortcut | Action |
|---|---|
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Switch to the next / previous frame |
| `Ctrl+M` | Maximize / restore the focused frame |
| `Alt+←` / `Alt+→` | Back / forward |
| `Ctrl+R` or `F5` | Reload |
| `Ctrl+F` | Find on page |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `Ctrl+,` | Open Settings |

## 5. Settings

Open Settings from the button in the bottom-right corner of the window, or with `Ctrl+,`.

### Profiles

Every profile can be:
- **Renamed** — click its name.
- **Recolored** — click one of the color dots.
- **Duplicated** — creates a new profile with a *fresh* device identity (never a copy of the fingerprint; two profiles sharing one fingerprint would defeat the point of isolation). If the source profile has a proxy assigned, the duplicate keeps the same exit-country match for its timezone/locale.
- **Reset** — erases all stored data (cookies, logins, everything) for that profile. This cannot be undone.
- Checked for **disk usage**, or have just their cache cleared without touching cookies/logins.

**Save session (persist session)** — when checked, a profile's cookies and storage survive closing the app. When unchecked, everything for that profile disappears the moment you close it or reset it. Toggling this reloads the profile's frame and discards whatever was open in it.

**Backup / restore** — a profile (including its cookies and logins) can be exported to an encrypted `.mfbackup` file protected by a password you choose, and restored later — including on a different computer. This is deliberately different from Windows' own credential storage, which is tied to this specific PC and Windows account and can't be moved.

**Proxy** — expand this section to assign a proxy to the profile:
- Choose **Direct** (no proxy), **HTTPS**, or **SOCKS5**.
- Enter host, port, and optionally a username/password.
- **Test** checks the proxy and shows its exit IP, country, ASN, subnet type, and an anonymity/quality score.
- **Assign** applies it to the profile — this happens even if the proxy is currently unreachable (so you can pre-configure something that isn't up yet); if the test data includes a country, the profile's timezone and locale are automatically matched to it.

### Self-check

Runs a set of checks on a chosen profile from *inside* the actual page it's showing — comparing what the profile claims (user agent, timezone, screen size, GPU, etc.) against what the page can actually observe. **This is a mismatch detector, not an anonymity score** — chasing a "perfect score" elsewhere is itself a detectable pattern.

### Free proxies

For pasting in a list of `host:port` addresses (one per line) and checking them from your direct connection. Read the risk notice before using this tab: a meaningful share of public proxies exist to intercept traffic, so proxies from here can only ever be assigned to a profile that has session-saving turned off and empty storage — this tab is for verifying the app works, not for signing into real accounts. Accepted results can be assigned straight to a profile from this tab.

### Paid proxies

A short list of proxy providers suited to multi-profile use, with an honest note when a provider is mostly datacenter subnets (which are more likely to get blocked). These are affiliate links — clicking one opens your system's default browser, never a profile inside the app, so no tracking cookies from the provider ever touch your profiles.

### GeoIP

MultiFrame Browser can determine a proxy's country/city/ASN using a **local** MaxMind GeoLite2 database rather than any cloud lookup service. To use it:

1. Create a free account at [maxmind.com](https://www.maxmind.com/) and get a GeoLite2 license key.
2. Paste it into the license key field here and click **Save**.
3. Click **Download / update database**.

Nothing is downloaded until you provide your own key, and the only network request this feature ever makes is the database download itself, straight to MaxMind's official server.

### Support

Addresses for optionally donating to the project, in several cryptocurrencies. Opening this window makes no network request; addresses are compiled into the app, never fetched from anywhere. Verify any address in full (not just the first/last characters) before sending — clipboard-hijacking malware exists specifically to swap crypto addresses.

### Language / Theme

Switching the interface language is instant and does not reload any open frame, and — importantly — does not change what any profile reports as its own language to the sites it visits. Dark and light themes are available; this is purely a shell preference and has no effect on any profile.

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| A cell shows a network error page | The page couldn't load — check the address, or the assigned proxy |
| A cell shows a proxy error and no page loads | The assigned proxy is down. The app deliberately does **not** fall back to your real connection in this case — that's the point of a proxy. Fix or reassign the proxy for that profile. |
| A cell shows a certificate error | The site's TLS certificate couldn't be verified. Profiles carrying a "test" (free) proxy can never accept a certificate override — this is intentional, since a free proxy with an accepted bad certificate is a full man-in-the-middle position over your session. |
| DevTools/Find buttons appear greyed out | The cell has no page open yet — enter an address first |
| SmartScreen warning on launch | Expected until the app is code-signed (see above) |

---

*This guide describes the application as of 2026-08-03. Some acceptance criteria from the project's own specification are still unverified in real-world conditions (real proxy infrastructure, long unattended runs); see the project's technical documentation if you need that level of detail.*
