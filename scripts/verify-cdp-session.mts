#!/usr/bin/env node --experimental-transform-types
/**
 * Регресія: CDP-команда до першої навігації WebContentsView підвішує
 * рендерер безстроково, без помилки й без відхилення проміса
 * (spikes/viewport-scaling/README.md, знайдено на спайку Ф-4.5 і
 * незалежно повторено як живий баг у Frame.ts.openTab).
 *
 * CdpSession.send() тепер кидає одразу, доки WebContents не завершив
 * (успішно чи ні) хоча б одну навігацію — щоб регресія ламала виклик
 * негайно, а не висіла мовчки в проді.
 *
 * CdpSession.ts має реальну (не type-only) залежність від logging/logger,
 * яка своєю чергою залежить від electron. Під звичайним node пакет
 * electron резолвиться в рядок-шлях до бінарника, і статичний іменований
 * імпорт `import { app } from 'electron'` падає синтаксичною помилкою на
 * етапі імпорту, а не рантайму. Тому копіюємо CdpSession.ts в тимчасову
 * теку поруч із заглушкою logger.ts — той самий трюк, що й verify-backup.mts.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(tmpdir(), `mf-cdp-verify-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'cdp'), { recursive: true });
mkdirSync(join(work, 'logging'), { recursive: true });

writeFileSync(
  join(work, 'logging', 'logger.ts'),
  'export const log = { debug(){}, info(){}, warn(){}, error(){} };\n',
);

const cdpSrc = readFileSync(join(root, 'src', 'main', 'cdp', 'CdpSession.ts'), 'utf8')
  .replace(/from '\.\.\/logging\/logger'/, "from '../logging/logger.ts'");
writeFileSync(join(work, 'cdp', 'CdpSession.ts'), cdpSrc);

const { CdpSession, CdpDomainError } = await import(pathToFileURL(join(work, 'cdp', 'CdpSession.ts')).href);

type Handler = () => void;

/** Мінімальний фейк webContents.debugger, достатній для CdpSession. */
function makeFakeWebContents() {
  const listeners = new Map<string, Handler[]>();
  let sendCalls = 0;
  return {
    isDestroyed: () => false,
    once(event: string, cb: Handler) {
      const arr = listeners.get(event) ?? [];
      arr.push(cb);
      listeners.set(event, arr);
    },
    emit(event: string) {
      for (const cb of listeners.get(event) ?? []) cb();
    },
    debugger: {
      attach() {},
      detach() {},
      async sendCommand(_method: string, _params?: unknown) {
        sendCalls++;
        return {};
      },
    },
    get sendCalls() { return sendCalls; },
  };
}

const t = (n: string, ok: boolean, extra = ''): number => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${extra ? '  (' + extra + ')' : ''}`);
  return ok ? 0 : 1;
};
let bad = 0;

console.log('\nКоманда до першої навігації:');
{
  const wc: any = makeFakeWebContents();
  const cdp = new CdpSession(wc);
  cdp.attach();
  let threw = false;
  try {
    await cdp.send('Page.enable');
  } catch (e) {
    threw = e instanceof CdpDomainError;
  }
  bad += t('CdpSession.send() кидає CdpDomainError, а не висить', threw);
  bad += t('debugger.sendCommand НЕ викликано (запобігли до того, як він міг зависнути)', wc.sendCalls === 0, `${wc.sendCalls} викликів`);
}

console.log('\nКоманда після did-finish-load:');
{
  const wc: any = makeFakeWebContents();
  const cdp = new CdpSession(wc);
  cdp.attach();
  wc.emit('did-finish-load');
  let threw = false;
  try {
    await cdp.send('Page.enable');
  } catch {
    threw = true;
  }
  bad += t('CDP після did-finish-load проходить', !threw);
  bad += t('debugger.sendCommand викликано рівно раз', wc.sendCalls === 1, `${wc.sendCalls} викликів`);
}

console.log('\nКоманда після невдалої навігації (did-fail-load):');
{
  const wc: any = makeFakeWebContents();
  const cdp = new CdpSession(wc);
  cdp.attach();
  wc.emit('did-fail-load');
  let threw = false;
  try {
    await cdp.send('Page.enable');
  } catch {
    threw = true;
  }
  bad += t('CDP після did-fail-load теж проходить (навігація відбулась, хай і невдало)', !threw);
}

console.log('\nІнші захисти CdpSession лишаються чинними після навігації:');
{
  const wc: any = makeFakeWebContents();
  const cdp = new CdpSession(wc);
  cdp.attach();
  wc.emit('did-finish-load');
  let threwRuntime = false;
  try {
    await cdp.send('Runtime.enable');
  } catch (e) {
    threwRuntime = e instanceof CdpDomainError;
  }
  bad += t('Runtime.* лишається забороненим (RECOMMENDATIONS §2)', threwRuntime);

  const cdpUnattached = new CdpSession(makeFakeWebContents() as any);
  const result = await cdpUnattached.send('Page.enable');
  bad += t('команда без attach() повертає null, а не кидає', result === null);
}

rmSync(work, { recursive: true, force: true });
console.log(`\nПроблем: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
