// Validates the blueprint, the question bank and the forms. Run by `npm run build` and CI.
// Usage: node scripts/validate.mjs [--bank-only]   (--bank-only skips the forms checks)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const bankOnly = process.argv.includes('--bank-only');
const errors = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);

const blueprint = read('data/blueprint.json');
const domains = new Map(blueprint.domains.map((d) => [d.id, d]));
const formats = new Set(blueprint.formats.map((f) => f.id));
const DOC_PREFIX = 'https://www.palantir.com/docs/foundry/';

const questions = [];
for (const f of readdirSync(join(root, 'data/questions')).filter((f) => f.endsWith('.json')).sort()) {
  let list;
  try { list = read(`data/questions/${f}`); } catch (e) { err(f, `invalid JSON (${e.message})`); continue; }
  if (!Array.isArray(list)) { err(f, 'must be a JSON array of questions'); continue; }
  for (const q of list) questions.push({ ...q, _file: f });
}

const str = (v, min = 1) => typeof v === 'string' && v.trim().length >= min;
const seen = new Set();
for (const q of questions) {
  const id = q.id || `(no id in ${q._file})`;
  if (!str(q.id) || !/^[a-z]+(-[a-z0-9]+)+$/.test(q.id)) err(id, 'id must be lower-case kebab, e.g. des-001');
  if (seen.has(q.id)) err(id, 'duplicate id');
  seen.add(q.id);
  const d = domains.get(q.domain);
  if (!d) err(id, `unknown domain "${q.domain}"`);
  else if (!d.objectives.some((o) => o.id === q.objective)) err(id, `objective "${q.objective}" is not in domain "${q.domain}"`);
  if (!formats.has(q.format)) err(id, `unknown format "${q.format}"`);
  if (!blueprint.difficulties.includes(q.difficulty)) err(id, `difficulty must be one of ${blueprint.difficulties.join('/')}`);
  if (!str(q.stem, 15)) err(id, 'stem missing or too short');
  if (!str(q.explanation, 40)) err(id, 'explanation missing or too short');
  if (!q.source || !str(q.source.title) || !str(q.source.url) || !q.source.url.startsWith(DOC_PREFIX)) err(id, `source.url must start with ${DOC_PREFIX} and source.title must be set`);

  if (['single', 'multi', 'discrete'].includes(q.format)) {
    if (!Array.isArray(q.options) || q.options.length < 4 || q.options.length > 6) { err(id, 'needs 4-6 options'); continue; }
    const ids = q.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) err(id, 'option ids must be unique');
    for (const o of q.options) if (!str(o.id) || !str(o.text) || !str(o.why, 15)) err(id, `option "${o.id}" needs id, text and why`);
    if (!Array.isArray(q.answer) || !q.answer.length || q.answer.some((a) => !ids.includes(a))) { err(id, 'answer must be an array of option ids'); continue; }
    if (q.format !== 'multi' && q.answer.length !== 1) err(id, `${q.format} needs exactly one keyed option`);
    if (q.format === 'multi' && (q.answer.length < 2 || q.answer.length >= q.options.length)) err(id, 'multi needs 2+ keyed options and at least one distractor');
    if (q.format === 'multi' && !/\b(two|three|four)\b/i.test(q.stem)) err(id, 'multi stem must say how many to select (e.g. "Select TWO")');
    if (q.options.some((o) => /\b(all|none) of the above\b/i.test(o.text))) err(id, 'no "all/none of the above" (options are shuffled)');
  } else if (q.format === 'truefalse') {
    if (typeof q.answer !== 'boolean') err(id, 'truefalse answer must be true or false');
    if (q.answer === false && !str(q.correction, 15)) err(id, 'a false statement needs a "correction" (the corrected statement)');
  } else if (q.format === 'matching') {
    const L = q.left, R = q.right;
    if (!Array.isArray(L) || L.length < 3 || L.length > 5 || !Array.isArray(R) || R.length < L.length) { err(id, 'matching needs 3-5 left items and at least as many right items'); continue; }
    const rids = new Set(R.map((r) => r.id));
    for (const l of L) {
      if (!str(l.id) || !str(l.text) || !str(l.why, 15)) err(id, `left item "${l.id}" needs id, text and why`);
      if (!q.answer || !rids.has(q.answer[l.id])) err(id, `answer must map left "${l.id}" to a right id`);
    }
    if (q.answer && new Set(Object.values(q.answer)).size !== Object.values(q.answer).length) err(id, 'each right item may be used at most once');
    for (const r of R) if (!str(r.id) || !str(r.text)) err(id, 'right items need id and text');
  } else if (q.format === 'hotspot') {
    const fig = q.figure;
    if (!fig || !str(fig.alt, 20) || !Array.isArray(fig.regions) || fig.regions.length < 4 || fig.regions.length > 8) { err(id, 'hotspot needs figure.alt and 4-8 figure.regions'); continue; }
    const W = fig.width || 640, H = fig.height || 360;
    const rids = fig.regions.map((r) => r.id);
    if (new Set(rids).size !== rids.length) err(id, 'region ids must be unique');
    for (const r of fig.regions) {
      if (!str(r.id) || !str(r.label) || !str(r.why, 15)) err(id, `region "${r.id}" needs id, label and why`);
      if (![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H || r.w < 90 || r.h < 40) err(id, `region "${r.id}" must fit the ${W}x${H} canvas and be at least 90x40`);
    }
    for (let i = 0; i < fig.regions.length; i++) for (let j = i + 1; j < fig.regions.length; j++) {
      const a = fig.regions[i], b = fig.regions[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) err(id, `regions "${a.id}" and "${b.id}" overlap`);
    }
    for (const e of fig.edges || []) if (!rids.includes(e.from) || !rids.includes(e.to)) err(id, `edge ${e.from}->${e.to} references an unknown region`);
    for (const g of fig.groups || []) if (![g.x, g.y, g.w, g.h].every(Number.isFinite) || !str(g.label)) err(id, 'groups need x, y, w, h and label');
    if (!Array.isArray(q.answer) || q.answer.length !== 1 || !rids.includes(q.answer[0])) err(id, 'hotspot answer must be an array with one region id');
  }
}

// True/False keys must be balanced overall and within each domain.
for (const d of blueprint.domains) {
  const tf = questions.filter((q) => q.format === 'truefalse' && q.domain === d.id);
  const t = tf.filter((q) => q.answer === true).length;
  if (tf.length && Math.abs(t - (tf.length - t)) > 1) err(`truefalse/${d.id}`, `unbalanced keys: ${t} true vs ${tf.length - t} false`);
}

let forms = [];
if (!bankOnly && existsSync(join(root, 'data/forms.json'))) {
  forms = read('data/forms.json');
  const byId = new Map(questions.map((q) => [q.id, q]));
  const used = new Map();
  if (forms.length < 2) err('forms', 'at least two forms are required');
  for (const f of forms) {
    const fid = `form ${f.id}`;
    if (f.questions.length !== blueprint.baseline.questions) err(fid, `has ${f.questions.length} questions, expected ${blueprint.baseline.questions}`);
    if (new Set(f.questions).size !== f.questions.length) err(fid, 'contains a duplicate question');
    const count = {}, fmt = new Set();
    for (const id of f.questions) {
      const q = byId.get(id);
      if (!q) { err(fid, `unknown question ${id}`); continue; }
      if (q.format === 'truefalse') err(fid, `${id} is True/False; base forms use the guide's formats only`);
      if (used.has(id)) err(fid, `${id} is also in form ${used.get(id)} (forms must be distinct)`);
      used.set(id, f.id);
      count[q.domain] = (count[q.domain] || 0) + 1;
      fmt.add(q.format);
    }
    for (const d of blueprint.domains) if ((count[d.id] || 0) !== d.questions) err(fid, `${d.title}: ${count[d.id] || 0} questions, expected ${d.questions}`);
    for (const x of ['single', 'multi', 'discrete', 'hotspot', 'matching']) if (!fmt.has(x)) err(fid, `has no ${x} question`);
    for (const [from, to] of f.trueFalseMix || []) {
      const a = byId.get(from), b = byId.get(to);
      if (!a || !b || !f.questions.includes(from)) { err(fid, `trueFalseMix ${from} -> ${to}: unknown id or not in form`); continue; }
      if (b.format !== 'truefalse') err(fid, `trueFalseMix target ${to} is not True/False`);
      if (a.domain !== b.domain) err(fid, `trueFalseMix ${from} -> ${to} changes the domain distribution`);
    }
  }
}

const tally = (key) => Object.entries(questions.reduce((m, q) => ((m[q[key]] = (m[q[key]] || 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`questions: ${questions.length} | by domain: ${tally('domain')} | by format: ${tally('format')} | forms: ${forms.length}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n` + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('data OK');
