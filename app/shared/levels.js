// Levels, L0 (a first chunk) to L5 (register), roughly HSK 2.0 / CEFR (docs/v2/README.md §3). A line's default answer
// clock comes from its level; L0 has none: nobody is rushed into their first words. english: the least English a card
// at the level shows, whatever its rung (assist.js): a first story's other lines are all in English too.
export const LEVELS = [
  { name: 'First words', cefr: 'pre-A1', clock: 0, patience: 25, english: 'show' }, // no clock, but a caller still waits only so long
  { name: 'Survival', cefr: 'A1', clock: 18 },
  { name: 'Everyday', cefr: 'A2', clock: 15 },
  { name: 'Social nuance', cefr: 'B1', clock: 12 },
  { name: 'Persuasive', cefr: 'B2', clock: 10 },
  { name: 'Register', cefr: 'C1', clock: 8 },
];
export const MAX = LEVELS.length - 1;

// A level from content or a caller: 0 to 5, else the everyday default. Never `level || 2`: 0 is a level.
export const of = (l) => { const n = typeof l === 'string' && /^[0-5]$/.test(l) ? +l : l; return Number.isInteger(n) && n >= 0 && n <= MAX ? n : 2; }; // override keys are strings ('0')
// the answer clock a line at this level gets when it names no time of its own, in seconds (0: none)
export const clock = (l) => LEVELS[of(l)].clock;
// how long a caller waits for a reply at this level when the beat names no time (calls run on patience, not a clock)
export const patience = (l) => LEVELS[of(l)].patience ?? clock(l);
