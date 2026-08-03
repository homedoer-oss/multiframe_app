import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from 'electron';
import { log } from '../logging/logger';

/**
 * Ф-2.6 — завантаження зберігаються в окрему теку профілю.
 * Спільна тека послабила б ізоляцію: за іменами файлів можна було б
 * зіставити активність різних профілів між собою.
 */
export function installDownloadHandler(session: Session, profileId: string, dir: () => string): void {
  session.on('will-download', (_event, item) => {
    const target = dir();
    try {
      mkdirSync(target, { recursive: true });
      item.setSavePath(join(target, item.getFilename()));
    } catch (err) {
      log.error({ code: 'download.path_failed', profileId, error: String(err) });
    }

    item.once('done', (_e, state) => {
      log.info({
        code: 'download.finished',
        profileId,
        state,
        filename: item.getFilename(),
        bytes: item.getTotalBytes(),
      });
    });
  });
}
