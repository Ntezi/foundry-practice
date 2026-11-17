// Scoring, pass threshold, session construction and deadline handling. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createSession, finalize, isAnswered, isComplete, isCorrect, isExpired, mockQuestionIds,
  passes, remainingMs, scoreSession, statusOf, topicProgress, formatClock,
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

function fakeBank() {
  const bank = [];
  for (const d of blueprint.domains) {
    for (let i = 0; i < d.questions * 2; i++) bank.push({ ...Q.single, id: `${d.id}-${i}`, domain: d.id, objective: d.objectives[i % d.objectives.length].id });
    for (let i = 0; i < 4; i++) bank.push({ ...Q.truefalse, id: `${d.id}-tf-${i}`, domain: d.id, objective: d.objectives[0].id });
  }
  const pick = (half) => blueprint.domains.flatMap((d) => Array.from({ length: d.questions }, (_, i) => `${d.id}-${i + half * d.questions}`));
  const forms = [
    { id: 'A', title: 'Form A', questions: pick(0), trueFalseMix: blueprint.domains.map((d) => [`${d.id}-0`, `${d.id}-tf-0`]) },
    { id: 'B', title: 'Form B', questions: pick(1) },
  ];
  return { bank, forms, blueprint };
}

function answerFirst(session, n, byId) {
  session.qids.forEach((qid, i) => { session.responses[qid] = { value: i < n ? byId.get(qid).answer[0] : 'a' }; });
}

test('a 60-question mock scores 41 as below the pass mark and 42 as a pass, with section counts', () => {
  const data = fakeBank();
  const byId = new Map(data.bank.map((q) => [q.id, q]));
  for (const [n, expected] of [[41, false], [42, true]]) {
    const s = createSession({ mode: 'mock', timed: true, formId: 'A' }, data, 1_000);
    assert.equal(s.qids.length, 60);
    answerFirst(s, n, byId);
    const score = scoreSession(s, byId, blueprint);
    assert.equal(score.correct, n);
    assert.equal(score.total, 60);
    assert.equal(score.needed, 42);
    assert.equal(score.passed, expected, `${n}/60`);
    assert.equal(Object.values(score.byDomain).reduce((a, d) => a + d.correct, 0), n);
    assert.deepEqual(blueprint.domains.map((d) => score.byDomain[d.id].total), [18, 18, 12, 12]);
  }
});

test('skipped and unanswered questions score zero and are counted as unanswered', () => {
  const data = fakeBank();
  const byId = new Map(data.bank.map((q) => [q.id, q]));
  const s = createSession({ mode: 'mock', timed: false, formId: 'B' }, data, 1_000);
  s.responses[s.qids[0]] = { value: 'b' };
  s.responses[s.qids[1]] = { skipped: true, locked: true };
  const score = scoreSession(s, byId, blueprint);
  assert.equal(score.correct, 1);
  assert.equal(score.unanswered, 59);
  assert.equal(score.passed, false);
});

test('mock settings: timed default deadline, untimed label, guide-based flag, True/False mix', () => {
  const data = fakeBank();
  const timed = createSession({ mode: 'mock', timed: true, formId: 'A', feedback: 'each' }, data, 5_000);
  assert.equal(timed.deadline, 5_000 + 120 * 60000);
  assert.equal(timed.feedback, 'end', 'mock always reveals feedback at the end');
  assert.equal(timed.guideBased, true);
  assert.match(timed.title, /^Mock Exam/);
  const untimed = createSession({ mode: 'mock', timed: false, formId: 'A' }, data, 5_000);
  assert.equal(untimed.deadline, null);
  assert.equal(untimed.guideBased, false);
  assert.match(untimed.title, /^Untimed Mock Exam/);
  const mix = createSession({ mode: 'mock', timed: true, formId: 'A', tfMix: true }, data, 5_000);
  assert.equal(mix.guideBased, false, 'a True/False mix is a practice variation');
  assert.equal(mix.qids.length, 60);
  assert.equal(mix.qids.filter((id) => id.includes('-tf-')).length, 4);
  assert.deepEqual(mockQuestionIds(data.forms[0], false), data.forms[0].questions);
});

test('practice sessions honour section, format and length choices, timed or untimed', () => {
  const data = fakeBank();
  const tf = createSession({ mode: 'practice', timed: false, feedback: 'each', domains: ['design', 'ux'], formats: ['truefalse'], length: 5 }, data, 0);
  assert.equal(tf.qids.length, 5);
  assert.ok(tf.qids.every((id) => /^(design|ux)-tf-/.test(id)));
  assert.equal(tf.deadline, null);
  assert.match(tf.title, /True\/False drill/);
  const timed = createSession({ mode: 'practice', timed: true, feedback: 'end', domains: ['maintenance'], formats: ['single'], length: 10 }, data, 0);
  assert.equal(timed.qids.length, 10);
  assert.equal(timed.deadline, 20 * 60000);
  assert.equal(timed.feedback, 'end');
  assert.equal(scoreSession(timed, new Map(data.bank.map((q) => [q.id, q])), blueprint).passed, null, 'practice has no pass or fail');
});

test('deadline: remaining time comes from the saved deadline; expiry finalizes at the deadline', () => {
  const data = fakeBank();
  const s = createSession({ mode: 'mock', timed: true, formId: 'A' }, data, 0);
  assert.equal(remainingMs(s, 60_000), 119 * 60000);
  assert.equal(isExpired(s, s.deadline - 1), false);
  assert.equal(isExpired(s, s.deadline), true);
  const restored = JSON.parse(JSON.stringify(s)); // as if reloaded from storage days later
  finalize(restored, s.deadline + 86_400_000);
  assert.equal(restored.expired, true);
  assert.equal(restored.finalizedAt, s.deadline);
  assert.equal(isExpired(restored, s.deadline + 86_400_000), false, 'a finalized attempt is not finalized twice');
  const early = createSession({ mode: 'mock', timed: true, formId: 'A' }, data, 0);
  finalize(early, 30_000);
  assert.equal(early.expired, false);
  assert.equal(early.finalizedAt, 30_000);
  const untimed = createSession({ mode: 'mock', timed: false, formId: 'A' }, data, 0);
  assert.equal(isExpired(untimed, 1e15), false);
  assert.equal(formatClock(119 * 60000), '1:59:00');
  assert.equal(formatClock(61_000), '01:01');
});

test('topic progress adds up practice attempts only', () => {
  const key = 'design/tool-selection';
  const rows = topicProgress([
    { mode: 'practice', finalizedAt: 1, score: { byObjective: { [key]: { correct: 1, total: 4 } } } },
    { mode: 'practice', finalizedAt: 2, score: { byObjective: { [key]: { correct: 3, total: 4 } } } },
    { mode: 'mock', finalizedAt: 3, score: { byObjective: { [key]: { correct: 9, total: 9 } } } },
  ], blueprint);
  const row = rows.find((r) => r.domain === 'design' && r.objective === 'tool-selection');
  assert.deepEqual([row.correct, row.total, row.last.correct], [4, 8, 3]);
});

test('the real forms follow the blueprint and every keyed answer scores as correct', { skip: !existsSync(join(root, 'data/forms.json')) }, () => {
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
      const s = createSession({ mode: 'mock', timed: true, formId: form.id, tfMix }, { bank, forms, blueprint }, 0);
      for (const qid of s.qids) s.responses[qid] = { value: keyOf(byId.get(qid)) };
      const score = scoreSession(s, byId, blueprint);
      assert.equal(score.correct, 60, `${form.id} tfMix=${tfMix}`);
      assert.deepEqual(blueprint.domains.map((d) => score.byDomain[d.id].total), [18, 18, 12, 12]);
    }
  }
});
