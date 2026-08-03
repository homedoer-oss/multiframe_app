#!/usr/bin/env node --experimental-transform-types
/**
 * НФ-3.2 — автооновлення через GitHub Releases (рішення користувача
 * 2026-08-03: github.com/homedoer-oss/multiframe_app). Ніщо в коді не
 * перевіряє це під час компіляції — лише `electron-builder.yml`, який
 * легко випадково відкотити чи скопіювати з іншого проєкту. Ця перевірка
 * ловить саме таку регресію, не поведінку самого electron-updater
 * (для цього потрібен реальний упакований застосунок і реальний реліз).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = yaml.load(readFileSync(join(root, 'electron-builder.yml'), 'utf8')) as Record<string, unknown>;

const t = (n: string, ok: boolean, extra = ''): number => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${extra ? '  (' + extra + ')' : ''}`);
  return ok ? 0 : 1;
};
let bad = 0;

console.log('\nКанал автооновлення (electron-builder.yml, publish):');
{
  const publish = config.publish as Record<string, unknown> | undefined;
  bad += t('publish задано', Boolean(publish));
  bad += t('provider: github', publish?.provider === 'github', String(publish?.provider));
  bad += t('owner: homedoer-oss', publish?.owner === 'homedoer-oss', String(publish?.owner));
  bad += t('repo: multiframe_app', publish?.repo === 'multiframe_app', String(publish?.repo));
}

console.log('\nПідпис коду ще немає (розділ 10 STATE.md) — перевірка оновлення вимкнена свідомо:');
{
  const win = config.win as Record<string, unknown> | undefined;
  bad += t('win.verifyUpdateCodeSignature: false', win?.verifyUpdateCodeSignature === false);
}

console.log(`\nПроблем: ${bad}`);
console.log('НЕ перевірено (потребує реального релізу на GitHub і упакованого застосунку): фактична перевірка/завантаження/встановлення оновлення.');
process.exit(bad === 0 ? 0 : 1);
