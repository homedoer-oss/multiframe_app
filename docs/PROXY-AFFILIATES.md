# Партнерські програми проксі-провайдерів

**Дата збору:** 2026-08-01
**Призначення:** вихідні дані для вкладки «Платні проксі» (ТЗ.md, розділ 7.6)

---

## ⚠️ Перед використанням

**Наведені умови взяті з відкритих джерел і партнерських агрегаторів. Їх обов'язково треба підтвердити безпосередньо у провайдера перед публікацією в застосунку.**

Причини:

- агрегатори суперечать один одному. Для Oxylabs одні джерела вказують «50% доходу, до $2000 за клієнта», інші — «74%». Щонайменше одна з цифр хибна або описує інший показник;
- умови змінюються без анонсів, а частина агрегаторів не оновлює дані роками;
- деякі провайдери розділяють **referral** (разова винагорода за реферала) і **affiliate** (частка доходу) — це різні програми з різними умовами. Bright Data, наприклад, має обидві.

**Критично для вашого випадку:** партнерські умови багатьох провайдерів містять обмеження щодо контексту просування. Продукт категорії anti-detect / multi-accounting може вимагати окремого погодження або взагалі не підпадати під програму. **Отримайте письмове підтвердження до того, як вкладку буде реалізовано** — інакше є ризик побудувати функцію, посилання в якій заблокують після модерації.

---

## Провайдери

Відсортовано за релевантністю для anti-detect-сценарію (наявність residential і mobile), а не за розміром комісії.

| Провайдер | Партнерське посилання | Типи проксі | Умови за відкритими даними | Офіційна сторінка програми |
|---|---|---|---|---|
| **IPRoyal** | https://iproyal.com/?r=mfbrowser | residential, mobile, datacenter | 10% довічно з кожного клієнта, до $2 000, cookie 60 днів | `iproyal.com/affiliate-program/` |
| **Infatica** | https://dashboard.infatica.io/aff.php?aff=853 | residential, mobile | 10–30% рекурентно, cookie 90 днів, без мінімальної виплати | `infatica.io/affiliate/` |
| **Webshare** | https://www.webshare.io/?referral_code=km2coitau7oj | datacenter, residential | 50% з першого продажу + 10% рекурентно (є альтернативна схема 25%), виплати щотижня через PayPal, мінімум $10 | `webshare.io/affiliate-program` |

---

## Що з цього має значення для продукту

**1. Комісія — найменш важливий критерій відбору.**

`RECOMMENDATIONS.md` §1: якість проксі визначає результат більше, ніж увесь fingerprint-шар. Провайдер із 50% комісією, чиї підмережі не проходять у ваших користувачів, обійдеться дорожче за втрачену довіру, ніж принесе комісією. IPRoyal з 10% може бути кращим вибором для вкладки, ніж Proxy-Seller з 50%.

**2. Datacenter-провайдери в переліку доречні лише з чіткою позначкою.**

Webshare і подібні дешеві datacenter-пропозиції приваблюють ціною, але саме тип підмережі має найбільшу вагу у вашому ж движку оцінки (Ф-10.17). Розміщувати їх без позначки «datacenter — висока ймовірність блокувань» означає суперечити власному інтерфейсу.

**3. Модель тарифікації варто показувати одразу.**

Residential зазвичай тарифікується за трафік ($/GB), datacenter — за IP або порт. Для сценарію з дев'ятьма фреймами це принципово різна економіка, і користувач має бачити її до переходу за посиланням.

**4. Зворотна можливість.**

Провайдери й суміжні продукти самі ведуть партнерські каталоги — наприклад, у Octo Browser є розділ партнерів. Ваш застосунок може потрапляти в такі переліки, а не лише посилатися назовні. Це другий канал, дешевший за вкладку.

---

## Що уточнити у кожного провайдера

1. Чи допускається просування в контексті anti-detect / multi-accounting продукту (**отримати письмово**).
2. Referral чи affiliate — і які умови саме тієї програми, яка вам потрібна.
3. Строк дії cookie і чи діє атрибуція при переході з десктопного застосунку.
4. Чи дозволений статичний sub-id у посиланні для розрізнення розміщень.
5. Мінімальна виплата, періодичність, доступні способи виведення для вашої юрисдикції.
6. Чи є обмеження щодо країн, з яких приходить трафік.
7. Політика щодо самореферала і щодо повернень (чи знімається комісія при refund).

---

## Джерела

- [Bright Data's Affiliate Program](https://brightdata.com/affiliate)
- [Bright Data Referral Program — Docs](https://docs.brightdata.com/general/account/referral-program)
- [Oxylabs Affiliate Program](https://oxylabs.io/affiliates)
- [SOAX affiliate program](https://soax.com/affiliates)
- [IPRoyal Affiliate Program](https://iproyal.com/affiliate-program/)
- [Infatica Affiliate Program](https://infatica.io/affiliate/)
- [Webshare Affiliate Program](https://www.webshare.io/affiliate-program)
- [Proxy-Seller Affiliate Program](https://proxy-seller.com/affiliate-program-main/)
- [Top 15 Proxy Affiliate Programs (affmaven)](https://affmaven.com/proxy-affiliate-programs/)
- [8 Best Proxy Affiliate Programs (affiliatebay)](https://affiliatebay.net/best-proxy-affiliate-programs/)
- [Best Proxy Affiliate Programs (AffTank)](https://afftank.com/blog/proxy-affiliate-programs)
- [Oxylabs Affiliate Program — Affiliate.Watch](https://affiliate.watch/affiliate/oxylabs)
- [360Proxy Affiliate Program — Affiliate.Watch](https://affiliate.watch/affiliate/360proxy)
- [Octo Browser — партнери](https://octobrowser.net/partners/)
