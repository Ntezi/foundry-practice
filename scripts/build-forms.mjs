// One-off helper that (re)creates data/forms.json from the bank. It OVERWRITES hand edits to forms.json.
// Convention: within each section file, non-True/False questions numbered up to the section's per-form
// count (e.g. des-001..des-018) go to Form A and the next block to Form B. The order inside a form is a
// fixed shuffle (seeded), so sections are mixed and the form reads the same for everyone.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const blueprint = read('data/blueprint.json');
const bank = readdirSync(join(root, 'data/questions')).filter((f) => f.endsWith('.json')).sort().flatMap((f) => read(`data/questions/${f}`));
const TF_SWAPS = { design: 4, implementation: 4, ux: 2, maintenance: 2 }; // per form, when the True/False mix is on

function seeded(seed) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(list, rng) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const forms = ['A', 'B'].map((id, f) => {
  const picked = [], mix = [];
  for (const d of blueprint.domains) {
    const regular = bank.filter((q) => q.domain === d.id && q.format !== 'truefalse').sort((a, b) => a.id.localeCompare(b.id));
    const block = regular.slice(f * d.questions, (f + 1) * d.questions);
    picked.push(...block);
    // Swap out single-select questions for True/False ones, alternating True and False keys.
    const n = TF_SWAPS[d.id];
    const tf = bank.filter((q) => q.domain === d.id && q.format === 'truefalse').sort((a, b) => a.id.localeCompare(b.id));
    const trues = tf.filter((q) => q.answer === true), falses = tf.filter((q) => q.answer === false);
    const mine = Array.from({ length: n }, (_, i) => (i % 2 ? falses : trues)[f * Math.ceil(n / 2) + Math.floor(i / 2)]);
    const singles = block.filter((q) => q.format === 'single').slice(-n);
    singles.forEach((q, i) => mix.push([q.id, mine[i].id]));
  }
  return { id, title: `Form ${id}`, questions: shuffle(picked, seeded(f + 2026)).map((q) => q.id), trueFalseMix: mix };
});
writeFileSync(join(root, 'data/forms.json'), JSON.stringify(forms, null, 2) + '\n');
console.log(forms.map((f) => `${f.title}: ${f.questions.length} questions, ${f.trueFalseMix.length} True/False swaps`).join('\n'));
