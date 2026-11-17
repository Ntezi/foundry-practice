// Pure session logic: building sessions, judging responses, scoring, deadlines.
// No DOM and no storage in here, so it runs unchanged under `node --test`.

export const CHOICE_FORMATS = ['single', 'multi', 'discrete'];

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A discrete-options item ends when the learner accepts any option, or rejects the keyed one. */
export function discreteDone(q, value) {
  const d = value?.decisions || [];
  if (!d.length) return false;
  const last = d[d.length - 1];
  return last.yes || q.answer.includes(last.id);
}

/** True when the response is complete enough to be submitted (mock "Lock answer" needs this). */
export function isComplete(q, value) {
  if (value === undefined || value === null) return false;
  switch (q.format) {
    case 'single': case 'hotspot': return typeof value === 'string' && value !== '';
    case 'multi': return Array.isArray(value) && value.length > 0;
    case 'truefalse': return typeof value === 'boolean';
    case 'matching': return q.left.every((l) => value[l.id]);
    case 'discrete': return discreteDone(q, value);
    default: return false;
  }
}

/** True when the learner gave any response at all. Incomplete discrete items count as unanswered. */
export function isAnswered(q, value) {
  if (value === undefined || value === null) return false;
  if (q.format === 'matching') return Object.values(value).some(Boolean);
  return isComplete(q, value);
}

/**
 * All-or-nothing judging, one point per question:
 * - single / hotspot / truefalse: the one keyed choice.
 * - multi: exactly the keyed set, no more and no fewer.
 * - matching: every left item matched to its keyed right item.
 * - discrete: the learner accepted the keyed option (accepting a distractor, or rejecting the key, ends the item as incorrect).
 */
export function isCorrect(q, value) {
  if (!isAnswered(q, value)) return false;
  switch (q.format) {
    case 'single': case 'hotspot': return value === q.answer[0];
    case 'truefalse': return value === q.answer;
    case 'multi': return value.length === q.answer.length && q.answer.every((a) => value.includes(a));
    case 'matching': return q.left.every((l) => value[l.id] === q.answer[l.id]);
    case 'discrete': {
      const last = value.decisions[value.decisions.length - 1];
      return last.yes && q.answer.includes(last.id);
    }
    default: return false;
  }
}

export function statusOf(q, value) {
  if (!isAnswered(q, value)) return 'unanswered';
  return isCorrect(q, value) ? 'correct' : 'missed';
}

/** Integer comparison so 42/60 (exactly 70%) passes and 41/60 does not, with no rounding. */
export function passes(correct, total, passPercent) {
  return total > 0 && correct * 100 >= passPercent * total;
}

/** Which outline a session reports against: the fixed 2026-guide forms use that guide's four sections. */
export const outlineOf = (session) => (session.examId === 'guide2026' ? 'guide2026' : 'associate');

/** Where a question sits in an outline. Returns null when a question has no place in the 2026 guide. */
export function placeOf(q, outline) {
  if (outline === 'guide2026') return q.guide ? { domain: q.guide.section, objective: q.guide.objective } : null;
  return { domain: q.domain, objective: q.objective };
}

/** The domains (or guide sections) of an outline as [{ id, title, objectives: [{ id, title }] }]. */
export function outlineDomains(blueprint, outline) {
  if (outline !== 'guide2026') return blueprint.domains;
  return blueprint.guide2026.sections.map((s) => ({ id: s.id, title: s.title, objectives: s.objectives.map((o) => ({ id: o, title: o.replace(/-/g, ' ') })) }));
}

export function scoreSession(session, byId, blueprint) {
  const outline = outlineOf(session);
  const byDomain = {}, byObjective = {};
  let correct = 0, answered = 0;
  for (const qid of session.qids) {
    const q = byId.get(qid);
    if (!q) continue;
    const place = placeOf(q, outline) || { domain: 'other', objective: 'other' };
    const st = statusOf(q, session.responses[qid]?.value);
    const key = `${place.domain}/${place.objective}`;
    byDomain[place.domain] ||= { correct: 0, total: 0 };
    byObjective[key] ||= { correct: 0, total: 0 };
    byDomain[place.domain].total++; byObjective[key].total++;
    if (st !== 'unanswered') answered++;
    if (st === 'correct') { correct++; byDomain[place.domain].correct++; byObjective[key].correct++; }
  }
  const total = session.qids.length;
  const exam = session.mode === 'mock' ? blueprint.exams.find((e) => e.id === session.examId) : null;
  const isFullMock = !!exam && total === exam.questions;
  return {
    correct, total, answered, unanswered: total - answered,
    percent: total ? Math.round((correct / total) * 1000) / 10 : 0,
    passed: isFullMock ? passes(correct, total, exam.passPercent) : null,
    needed: isFullMock ? Math.ceil((exam.passPercent * total) / 100) : null,
    passPercent: isFullMock ? exam.passPercent : null,
    byDomain, byObjective,
  };
}

/**
 * The topics to work on after an attempt: objectives scored below the threshold, weakest first.
 * Ties go to the topic with more questions behind it, since that is stronger evidence.
 */
export function weaknesses(score, blueprint, outline = 'associate', limit = 5) {
  const threshold = blueprint.practice.weakBelowPercent;
  const rows = [];
  for (const d of outlineDomains(blueprint, outline)) {
    for (const o of d.objectives) {
      const s = score.byObjective[`${d.id}/${o.id}`];
      if (!s || !s.total) continue;
      const pct = (s.correct / s.total) * 100;
      if (pct < threshold) rows.push({ domain: d.id, domainTitle: d.title, objective: o.id, title: o.title, key: `${d.id}/${o.id}`, correct: s.correct, total: s.total, missed: s.total - s.correct, percent: Math.round(pct) });
    }
  }
  rows.sort((a, b) => a.percent - b.percent || b.missed - a.missed || b.total - a.total);
  return rows.slice(0, limit);
}

/** The per-attempt display order of options (and of right-hand items for matching). */
function buildOrder(q, rng) {
  if (CHOICE_FORMATS.includes(q.format)) return shuffle(q.options.map((o) => o.id), rng);
  if (q.format === 'matching') return shuffle(q.right.map((r) => r.id), rng);
  return null;
}

export function mockQuestionIds(form, tfMix) {
  if (!tfMix) return [...form.questions];
  const swap = new Map(form.trueFalseMix || []);
  return form.questions.map((id) => swap.get(id) || id);
}

/** Draws the Associate mock: a random quota per official domain from the exam's formats, then mixed. */
export function assembleExam(exam, bank, rng = Math.random) {
  const picked = [];
  for (const [domain, n] of Object.entries(exam.quotas)) {
    const pool = shuffle(bank.filter((q) => q.domain === domain && exam.formats.includes(q.format)), rng);
    picked.push(...pool.slice(0, n));
  }
  return shuffle(picked, rng).map((q) => q.id);
}

/** opts.objectives (optional) narrows the pool to "domain/objective" keys, used for focused practice. */
export function practicePool(bank, { domains, formats, objectives }) {
  if (objectives?.length) return bank.filter((q) => objectives.includes(`${q.domain}/${q.objective}`) && formats.includes(q.format));
  return bank.filter((q) => domains.includes(q.domain) && formats.includes(q.format));
}

/**
 * opts: { mode: 'mock'|'practice', timed, feedback: 'each'|'end', examId, formId, tfMix, domains, formats, objectives, length }
 */
export function createSession(opts, { bank, forms, blueprint }, now = Date.now(), rng = Math.random) {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const mock = opts.mode === 'mock';
  const exam = mock ? blueprint.exams.find((e) => e.id === opts.examId) || blueprint.exams[0] : null;
  const form = exam?.assembly === 'forms' ? forms.find((f) => f.id === opts.formId) || forms[0] : null;
  const tfMix = !!form && !!opts.tfMix;
  let qids, title;
  if (mock) {
    qids = form ? mockQuestionIds(form, tfMix) : assembleExam(exam, bank, rng);
    title = `${opts.timed ? 'Mock Exam' : 'Untimed Mock Exam'} · ${exam.short}${form ? ` · ${form.title}` : ''}${tfMix ? ' · True/False mix' : ''}`;
  } else {
    const pool = shuffle(practicePool(bank, opts), rng);
    const want = Math.floor(Number(opts.length)) || pool.length;
    qids = pool.slice(0, Math.max(1, Math.min(want, pool.length))).map((q) => q.id);
    const tfOnly = opts.formats.length === 1 && opts.formats[0] === 'truefalse';
    title = `${opts.objectives?.length ? 'Focused practice' : tfOnly ? 'True/False drill' : 'Practice'} · ${qids.length} question${qids.length === 1 ? '' : 's'}`;
  }
  const minutes = mock ? exam.minutes : Math.ceil((qids.length * blueprint.practice.secondsPerQuestion) / 60);
  const order = {};
  for (const id of qids) { const o = buildOrder(byId.get(id), rng); if (o) order[id] = o; }
  return {
    v: 2,
    id: `${now.toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`,
    mode: opts.mode,
    timed: !!opts.timed,
    feedback: mock ? 'end' : opts.feedback,
    examId: exam ? exam.id : null,
    formId: form ? form.id : null,
    tfMix,
    // Only a timed, forward-only mock in the guide's own formats is presented as a simulation of that guide.
    guideBased: mock && !!opts.timed && !tfMix,
    focus: !mock && opts.objectives?.length ? [...opts.objectives] : null,
    title, qids, order,
    minutes: opts.timed ? minutes : null,
    startedAt: now,
    deadline: opts.timed ? now + minutes * 60000 : null,
    index: 0,
    responses: {},
    finalizedAt: null,
    expired: false,
  };
}

export function remainingMs(session, now = Date.now()) {
  return session.deadline === null ? null : Math.max(0, session.deadline - now);
}

export function isExpired(session, now = Date.now()) {
  return !session.finalizedAt && session.deadline !== null && now >= session.deadline;
}

/** Closes the attempt. An expired attempt is stamped with its deadline, not the time the learner came back. */
export function finalize(session, now = Date.now()) {
  if (session.finalizedAt) return session;
  const expired = session.deadline !== null && now >= session.deadline;
  session.expired = expired;
  session.finalizedAt = expired ? session.deadline : now;
  return session;
}

export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Cumulative practice results per objective, oldest attempt first. */
export function topicProgress(attempts, blueprint) {
  const rows = [];
  const practice = attempts.filter((a) => a.mode === 'practice').sort((a, b) => a.finalizedAt - b.finalizedAt);
  for (const d of blueprint.domains) {
    for (const o of d.objectives) {
      const key = `${d.id}/${o.id}`;
      let correct = 0, total = 0, last = null;
      for (const a of practice) {
        const s = a.score.byObjective[key];
        if (!s || !s.total) continue;
        correct += s.correct; total += s.total; last = s;
      }
      rows.push({ domain: d.id, objective: o.id, title: o.title, correct, total, last });
    }
  }
  return rows;
}
