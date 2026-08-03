import iconUrl from '../../../assets/multiframe-icon.svg';

/**
 * Логотип на старті: з'являється й поступово зникає (рішення користувача
 * 2026-08-03). `multiframe-icon.svg`, не `multiframe-logo.svg` — квадратна
 * позначка самодостатня (власний темний фон незалежно від теми), тоді як
 * текст у `multiframe-logo.svg` залитий тим самим темно-синім, що й типовий
 * `--bg` темної теми, і був би невидимим саме там, де ця сплеш-панель його
 * показує. Назва рендериться звичайним DOM-текстом кольорами теми — адаптується
 * до світлої/темної теми, а не заморожена в SVG.
 *
 * Час анімації живе виключно в CSS (`.splash-overlay`, theme.css) —
 * `onAnimationEnd` знімає компонент рівно тоді, коли анімація фактично
 * закінчилась, без окремого JS-таймера, який міг би розійтися з CSS-тривалістю.
 */
export function Splash({ onDone }: { onDone: () => void }): JSX.Element {
  return (
    <div className="splash-overlay" onAnimationEnd={onDone}>
      <div className="splash-mark">
        <img src={iconUrl} alt="" width={96} height={96} />
        <div className="splash-wordmark">
          <span className="splash-title">MultiFrame</span>
          <span className="splash-subtitle">BROWSER</span>
        </div>
      </div>
    </div>
  );
}
