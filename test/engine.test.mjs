// Scoring, pass threshold, session construction and deadline handling. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createSession, finalize, isAnswered, isComplete, isCorrect, isExpired, mockQuestionIds,
  passes, remainingMs, scoreSession, statusOf, topicProgress, formatClock, assembleExam, weaknesses, practicePool,
} from '../src/engine.js';

const root = resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const blueprint = read('data/blueprint.json');

const Q = {
  single: { id: 's', format: 'single', options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], answer: ['b'] },
  multi: { id: 'm', format: 'multi', options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }], answer: ['a', 'c'] },
  discrete: { id: 'd', format: 'discrete', options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], answer: ['c'] },
  truefalse: { id: 't', format: 'truefalse', answer: false },
  hotspot: { id: 'h', format: 'hotspot', figure: { regions: [{ id: 'r1' }, { id: 'r2' }] }, answer: ['r2'] },
  matching: { id: 'x', format: 'matching', left: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }], right: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }], answer: { l1: 'r2', l2: 'r1', l3: 'r4' } },
};

test('single, hotspot and true/false score on the one keyed choice', () => {
  assert.equal(isCorrect(Q.single, 'b'), true);
  assert.equal(isCorrect(Q.single, 'a'), false);
  assert.equal(isCorrect(Q.hotspot, 'r2'), true);
  assert.equal(isCorrect(Q.hotspot, 'r1'), false);
  assert.equal(isCorrect(Q.truefalse, false), true);
  assert.equal(isCorrect(Q.truefalse, true), false);
  assert.equal(statusOf(Q.truefalse, undefined), 'unanswered');
  assert.equal(isAnswered(Q.truefalse, false), true, 'answering False is an answer');
});

test('multi-select is all-or-nothing on the exact keyed set', () => {
  assert.equal(isCorrect(Q.multi, ['c', 'a']), true);
  assert.equal(isCorrect(Q.multi, ['a']), false, 'a missing selection scores zero');
  assert.equal(isCorrect(Q.multi, ['a', 'c', 'd']), false, 'an extra selection scores zero');
  assert.equal(statusOf(Q.multi, []), 'unanswered');
});

test('matching needs every pair right; a partial response is answered but incorrect', () => {
  assert.equal(isCorrect(Q.matching, { l1: 'r2', l2: 'r1', l3: 'r4' }), true);
  assert.equal(isCorrect(Q.matching, { l1: 'r2', l2: 'r1', l3: 'r3' }), false);
  assert.equal(isComplete(Q.matching, { l1: 'r2' }), false);
  assert.equal(statusOf(Q.matching, { l1: 'r2' }), 'missed');
  assert.equal(statusOf(Q.matching, {}), 'unanswered');
});

test('discrete options: accept the key to score; other endings are incorrect; unfinished is unanswered', () => {
  const d = (...pairs) => ({ decisions: pairs.map(([id, yes]) => ({ id, yes })) });
  assert.equal(statusOf(Q.discrete, d(['a', false], ['c', true])), 'correct');
  assert.equal(statusOf(Q.discrete, d(['a', true])), 'missed', 'accepted a distractor');
  assert.equal(statusOf(Q.discrete, d(['a', false], ['c', false])), 'missed', 'rejected the key');
  assert.equal(statusOf(Q.discrete, d(['a', false], ['b', false])), 'unanswered', 'item not finished');
  assert.equal(isComplete(Q.discrete, d(['a', false])), false);
});

test('the pass threshold is 70% with equal weights: 42/60 passes, 41/60 does not', () => {
  assert.equal(passes(42, 60, 70), true);
  assert.equal(passes(41, 60, 70), false);
  assert.equal(passes(60, 60, 70), true);
  assert.equal(passes(0, 0, 70), false);
});

const A = blueprint.exams.find((e) => e.id === 'associate');
const sections = blueprint.guide2026.sections;

/** A synthetic bank: enough multiple-choice questions per official domain for three mocks, plus 2026-guide forms. */
function fakeBank() {
  const bank = [];
  for (const d of blueprint.domains) {
    for (let i = 0; i < 33; i++) bank.push({ ...Q.single, id: `${d.id}-${i}`, domain: d.id, objective: d.objectives[i % d.objectives.length].id });
    for (let i = 0; i < 4; i++) bank.push({ ...Q.truefalse, id: `${d.id}-tf-${i}`, domain: d.id, objective: d.objectives[0].id });
  }
  for (const sec of sections) {
    for (let i = 0; i < sec.questions * 2; i++) bank.push({ ...Q.single, id: `g-${sec.id}-${i}`, domain: 'extended', objective: 'tool-selection', guide: { section: sec.id, objective: sec.objectives[i % sec.objectives.length] } });
    bank.push({ ...Q.truefalse, id: `g-${sec.id}-tf-0`, domain: 'extended', objective: 'quiver', guide: { section: sec.id, objective: sec.objectives[0] } });
  }
  const pick = (half) => sections.flatMap((sec) => Array.from({ length: sec.questions }, (_, i) => `g-${sec.id}-${i + half * sec.questions}`));
  const forms = [
    { id: 'A', title: 'Form A', questions: pick(0), trueFalseMix: sections.map((sec) => [`g-${sec.id}-0`, `g-${sec.id}-tf-0`]) },
    { id: 'B', title: 'Form B', questions: pick(1) },
  ];
  return { bank, forms, blueprint };
}

function answerFirst(session, n, byId) {
  session.qids.forEach((qid, i) => { session.responses[qid] = { value: i < n ? byId.get(qid).answer[0] : 'a' }; });
}

test('the Associate mock follows the official guide: 85 questions, 180 minutes, 60 of 85 passes and 59 does not', () => {
  const data = fakeBank();
  const byId = new Map(data.bank.map((q) => [q.id, q]));
  assert.deepEqual([A.questions, A.minutes, A.passPercent], [85, 180, 70]);
  for (const [n, expected] of [[59, false], [60, true]]) {
    const s = createSession({ mode: 'mock', timed: true, examId: 'associate' }, data, 1_000);
    assert.equal(s.qids.length, 85);
    assert.equal(s.deadline, 1_000 + 180 * 60000);
    assert.equal(s.guideBased, true);
    assert.equal(new Set(s.qids).size, 85, 'no question is drawn twice');
    assert.ok(s.qids.every((id) => ['single', 'multi'].includes(byId.get(id).format)), 'multiple choice only');
    assert.ok(s.qids.every((id) => byId.get(id).domain !== 'extended'), 'only the eight official domains');
    answerFirst(s, n, byId);
    const score = scoreSession(s, byId, blueprint);
    assert.deepEqual([score.correct, score.total, score.needed, score.passed], [n, 85, 60, expected]);
    for (const [d, quota] of Object.entries(A.quotas)) assert.equal(score.byDomain[d].total, quota, d);
  }
});

test('each Associate mock is a fresh draw from the bank', () => {
  const { bank } = fakeBank();
  const held = bank.filter((q) => q.domain === 'functions' && q.format === 'single').slice(0, 20).map((q) => (q.associateMock = false, q.id));
  for (let i = 0; i < 5; i++) assert.ok(assembleExam(A, bank).every((id) => !held.includes(id)), 'questions marked associateMock: false are never drawn');
  const a = assembleExam(A, bank), b = assembleExam(A, bank);
  assert.equal(a.length, 85);
  assert.notDeepEqual(a, b);
  assert.ok(a.filter((id) => !b.includes(id)).length > 10, 'a second sitting sees many different questions');
});

test('the 2026-guide mock scores 41/60 as below the pass mark and 42/60 as a pass, by guide section', () => {
  const data = fakeBank();
  const byId = new Map(data.bank.map((q) => [q.id, q]));
  for (const [n, expected] of [[41, false], [42, true]]) {
    const s = createSession({ mode: 'mock', timed: true, examId: 'guide2026', formId: 'A' }, data, 1_000);
    assert.equal(s.qids.length, 60);
    assert.equal(s.deadline, 1_000 + 120 * 60000);
    answerFirst(s, n, byId);
    const score = scoreSession(s, byId, blueprint);
    assert.deepEqual([score.correct, score.total, score.needed, score.passed], [n, 60, 42, expected]);
    assert.deepEqual(sections.map((sec) => score.byDomain[sec.id].total), [18, 18, 12, 12]);
  }
});

test('skipped and unanswered questions score zero and are counted as unanswered', () => {
  const data = fakeBank();
  const byId = new Map(data.bank.map((q) => [q.id, q]));
  const s = createSession({ mode: 'mock', timed: false, examId: 'associate' }, data, 1_000);
  s.responses[s.qids[0]] = { value: 'b' };
  s.responses[s.qids[1]] = { skipped: true, locked: true };
  const score = scoreSession(s, byId, blueprint);
  assert.deepEqual([score.correct, score.unanswered, score.passed], [1, 84, false]);
});

test('mock settings: untimed label, feedback at the end, True/False mix only on the 2026-guide forms', () => {
  const data = fakeBank();
  const timed = createSession({ mode: 'mock', timed: true, examId: 'associate', feedback: 'each', tfMix: true }, data, 5_000);
  assert.equal(timed.feedback, 'end', 'mock always reveals feedback at the end');
  assert.equal(timed.tfMix, false, 'the Associate mock has no True/False mix');
  assert.match(timed.title, /^Mock Exam · Associate/);
  const untimed = createSession({ mode: 'mock', timed: false, examId: 'associate' }, data, 5_000);
  assert.deepEqual([untimed.deadline, untimed.guideBased], [null, false]);
  assert.match(untimed.title, /^Untimed Mock Exam/);
  const mix = createSession({ mode: 'mock', timed: true, examId: 'guide2026', formId: 'A', tfMix: true }, data, 5_000);
  assert.equal(mix.guideBased, false, 'a True/False mix is a practice variation');
  assert.equal(mix.qids.length, 60);
  assert.equal(mix.qids.filter((id) => id.includes('-tf-')).length, 4);
  assert.deepEqual(mockQuestionIds(data.forms[0], false), data.forms[0].questions);
});

test('practice takes any number of questions and honours domain, format and timing choices', () => {
  const data = fakeBank();
  const base = { mode: 'practice', timed: false, feedback: 'each', domains: ['osdk', 'aip'], formats: ['single'] };
  for (const n of [1, 7, 23, 66]) assert.equal(createSession({ ...base, length: n }, data, 0).qids.length, n);
  assert.equal(createSession({ ...base, length: 500 }, data, 0).qids.length, 66, 'capped at the questions that match');
  assert.equal(createSession({ ...base, length: 0 }, data, 0).qids.length, 66, 'no number means all of them');
  const tf = createSession({ ...base, formats: ['truefalse'], length: 5 }, data, 0);
  assert.ok(tf.qids.every((id) => /^(osdk|aip)-tf-/.test(id)));
  assert.deepEqual([tf.deadline, tf.feedback], [null, 'each']);
  assert.match(tf.title, /True\/False drill/);
  const timed = createSession({ ...base, timed: true, feedback: 'end', length: 10 }, data, 0);
  assert.equal(timed.deadline, Math.ceil((10 * blueprint.practice.secondsPerQuestion) / 60) * 60000);
  assert.equal(scoreSession(timed, new Map(data.bank.map((q) => [q.id, q])), blueprint).passed, null, 'practice has no pass or fail');
});

test('weaknesses lists topics below the threshold, weakest first, and focused practice draws only from them', () => {
  const data = fakeBank();
  const score = { byObjective: {
    'osdk/authentication': { correct: 0, total: 3 },
    'osdk/sdk-usage': { correct: 2, total: 3 },
    'aip/logic-building': { correct: 1, total: 4 },
    'actions/rules-design': { correct: 7, total: 10 },
    'workshop/layout-widgets': { correct: 4, total: 4 },
  } };
  const weak = weaknesses(score, blueprint);
  assert.deepEqual(weak.map((w) => w.key), ['osdk/authentication', 'aip/logic-building', 'osdk/sdk-usage'], '70% and above is not a weakness');
  assert.deepEqual([weak[0].correct, weak[0].total, weak[0].percent], [0, 3, 0]);
  assert.deepEqual(weaknesses({ byObjective: {} }, blueprint), []);
  const keys = weak.map((w) => w.key);
  const pool = practicePool(data.bank, { objectives: keys, formats: ['single', 'truefalse'], domains: [] });
  assert.ok(pool.length > 0 && pool.every((q) => keys.includes(`${q.domain}/${q.objective}`)));
  const s = createSession({ mode: 'practice', timed: false, feedback: 'each', objectives: keys, formats: ['single'], domains: [], length: 15 }, data, 0);
  assert.equal(s.qids.length, 15);
  assert.deepEqual(s.focus, keys);
  assert.match(s.title, /^Focused practice/);
});

test('deadline: remaining time comes from the saved deadline; expiry finalizes at the deadline', () => {
  const data = fakeBank();
  const s = createSession({ mode: 'mock', timed: true, examId: 'guide2026', formId: 'A' }, data, 0);
  assert.equal(remainingMs(s, 60_000), 119 * 60000);
  assert.equal(isExpired(s, s.deadline - 1), false);
  assert.equal(isExpired(s, s.deadline), true);
  const restored = JSON.parse(JSON.stringify(s)); // as if reloaded from storage days later
  finalize(restored, s.deadline + 86_400_000);
  assert.equal(restored.expired, true);
  assert.equal(restored.finalizedAt, s.deadline);
  assert.equal(isExpired(restored, s.deadline + 86_400_000), false, 'a finalized attempt is not finalized twice');
  const early = createSession({ mode: 'mock', timed: true, examId: 'associate' }, data, 0);
  finalize(early, 30_000);
  assert.equal(early.expired, false);
  assert.equal(early.finalizedAt, 30_000);
  const untimed = createSession({ mode: 'mock', timed: false, examId: 'associate' }, data, 0);
  assert.equal(isExpired(untimed, 1e15), false);
  assert.equal(formatClock(119 * 60000), '1:59:00');
  assert.equal(formatClock(61_000), '01:01');
});

test('topic progress adds up practice attempts only', () => {
  const key = 'extended/tool-selection';
  const rows = topicProgress([
    { mode: 'practice', finalizedAt: 1, score: { byObjective: { [key]: { correct: 1, total: 4 } } } },
    { mode: 'practice', finalizedAt: 2, score: { byObjective: { [key]: { correct: 3, total: 4 } } } },
    { mode: 'mock', finalizedAt: 3, score: { byObjective: { [key]: { correct: 9, total: 9 } } } },
  ], blueprint);
  const row = rows.find((r) => r.domain === 'extended' && r.objective === 'tool-selection');
  assert.deepEqual([row.correct, row.total, row.last.correct], [4, 8, 3]);
});

test('the real bank: every keyed answer scores as correct, the forms follow the 2026 guide, and the Associate mock can be drawn', { skip: !existsSync(join(root, 'data/forms.json')) }, () => {
  const bank = readdirSync(join(root, 'data/questions')).filter((f) => f.endsWith('.json')).flatMap((f) => read(`data/questions/${f}`));
  const forms = read('data/forms.json');
  const byId = new Map(bank.map((q) => [q.id, q]));
  const keyOf = (q) => {
    if (q.format === 'multi' || q.format === 'matching' || q.format === 'truefalse') return q.answer;
    if (q.format === 'discrete') return { decisions: [{ id: q.answer[0], yes: true }] };
    return q.answer[0];
  };
  for (const q of bank) assert.equal(isCorrect(q, keyOf(q)), true, q.id);
  for (const form of forms) {
    for (const tfMix of [false, true]) {
      const s = createSession({ mode: 'mock', timed: true, examId: 'guide2026', formId: form.id, tfMix }, { bank, forms, blueprint }, 0);
      for (const qid of s.qids) s.responses[qid] = { value: keyOf(byId.get(qid)) };
      const score = scoreSession(s, byId, blueprint);
      assert.equal(score.correct, 60, `${form.id} tfMix=${tfMix}`);
      assert.deepEqual(sections.map((sec) => score.byDomain[sec.id].total), [18, 18, 12, 12]);
    }
  }
  const mock = createSession({ mode: 'mock', timed: true, examId: 'associate' }, { bank, forms, blueprint }, 0);
  assert.equal(new Set(mock.qids).size, 85);
  for (const qid of mock.qids) mock.responses[qid] = { value: keyOf(byId.get(qid)) };
  assert.equal(scoreSession(mock, byId, blueprint).correct, 85);
});
