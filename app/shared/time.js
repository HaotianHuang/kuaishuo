// Every wait in the app goes through here, so tests can run a two-minute scene in seconds (KS_FAST).
export const fast = () => !!globalThis.KS_FAST;
export const ms = (x) => (fast() ? Math.max(5, x * 0.04) : x);
export const wait = (x, signal) => new Promise((r) => { const t = setTimeout(r, ms(x)); signal?.addEventListener('abort', () => { clearTimeout(t); r(); }); });
// The calendar the app keeps (spaced review, days played, the visit's start): the real clock, moved on in tests by
// KS_NOW milliseconds so a test can jump a day or a week ahead. Timers inside a card (the call's clock, typing grace)
// stay on the real one.
export const now = () => Date.now() + (+globalThis.KS_NOW || 0);

