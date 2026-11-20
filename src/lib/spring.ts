// Пружины для анимаций, которые ведёт палец (таб-бар и т. п.).
// Порт крошечного движка из Rubber Dock (designbookmark.com/motion):
// пружина = «жёсткость затухание», шаг полунеявным Эйлером, 4 подшага на кадр.

export interface Spring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
}

const reduce =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Новая пружина в точке x. */
export const spring = (x: number, k = 400, c = 30): Spring => ({ x, v: 0, t: x, k, c });

/** Поменять жёсткость/затухание. При «уменьшить движение» — без перелёта. */
export function tune(s: Spring, [k, c]: readonly [number, number]) {
  s.k = k;
  s.c = reduce ? 2 * Math.sqrt(k) : c;
}

export function step(s: Spring, dt: number) {
  const a = -s.k * (s.x - s.t) - s.c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

export const settled = (s: Spring) => Math.abs(s.x - s.t) < 0.01 && Math.abs(s.v) < 0.01;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Цикл requestAnimationFrame, который сам засыпает, когда все пружины
 * успокоились (в Mini App не крутим кадры впустую). `kick()` будит его.
 */
export function springLoop(springs: () => Spring[], render: () => void) {
  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const all = springs();
    for (let i = 0; i < 4; i++) for (const s of all) step(s, dt / 4);
    render();
    if (all.every(settled)) {
      for (const s of all) {
        s.x = s.t;
        s.v = 0;
      }
      render();
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  return {
    kick() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/** Пружины таб-бара — те же значения, что в tokens.css Rubber Dock. */
export const DOCK = {
  lead: [640, 38], // край пилюли, который ведёт движение
  trail: [150, 16], // отстающий край: из-за него пилюля тянется как резина
  dragLead: [1100, 56],
  dragTrail: [320, 26],
  still: [600, 44],
  pop: [520, 16], // «пружинка» иконки при выборе
} as const;
