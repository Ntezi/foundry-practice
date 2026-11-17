// Foundry Practice: setup, session, results, review, progress and about views.
import blueprint from '../data/blueprint.json';
import forms from '../data/forms.json';
import guidance from '../data/guidance.json';
import design from '../data/questions/design.json';
import implementation from '../data/questions/implementation.json';
import ux from '../data/questions/ux.json';
import maintenance from '../data/questions/maintenance.json';
import {
  createSession, finalize, formatClock, isAnswered, isComplete, isExpired, practicePool,
  remainingMs, scoreSession, statusOf, topicProgress, discreteDone,
} from './engine.js';
import { esc, rich, FORMAT_HINT, renderBody, feedbackHtml, figureSvg } from './question.js';
import { store } from './store.js';

const LEARN_URL = 'https://ntezi.github.io/foundry-learn/';
const bank = [...design, ...implementation, ...ux, ...maintenance];
const byId = new Map(bank.map((q) => [q.id, q]));
const data = { bank, forms, blueprint };
const domainOf = (id) => blueprint.domains.find((d) => d.id === id);
const formatLabel = (id) => blueprint.formats.find((f) => f.id === id)?.label || id;

const $ = (sel, el = document) => el.querySelector(sel);
const main = $('#main');
let S = store.active(); // the session in progress, if any

// ---------- small helpers ----------
function setTitle(t) { document.title = t ? `${t} · Foundry Practice` : 'Foundry Practice'; }
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const pct = (c, t) => (t ? Math.round((c / t) * 100) : 0);
function duration(ms) {
  const m = Math.round(ms / 60000);
  return m < 1 ? 'under a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function confirmDialog({ title, body, ok = 'Confirm', cancel = 'Cancel' }) {
  const dlg = $('#confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  $('#confirm-ok').textContent = ok;
  $('#confirm-cancel').textContent = cancel;
  return new Promise((resolve) => {
    // Resolve from the button clicks themselves: the dialog's `close` event is delivered late (or not at all)
    // while the tab is not being rendered, which would leave the exam waiting on a closed dialog.
    const ac = new AbortController();
    const done = (value) => { ac.abort(); if (dlg.open) dlg.close(); resolve(value); };
    $('#confirm-ok').addEventListener('click', () => done(true), { signal: ac.signal });
    $('#confirm-cancel').addEventListener('click', () => done(false), { signal: ac.signal });
    dlg.addEventListener('cancel', () => done(false), { signal: ac.signal }); // Escape
    dlg.addEventListener('close', () => done(false), { signal: ac.signal }); // closed by anything else
    dlg.showModal();
  });
}

// ---------- theme and chrome ----------
$('#theme-btn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.setTheme(next);
});

function renderNav(cur) {
  const items = [['', 'Start'], ...(S ? [['session', 'Resume session']] : []), ['progress', 'Progress'], ['about', 'About & scoring']];
  $('#topnav').innerHTML = items.map(([id, l]) => `<a href="#/${id}" ${cur === id ? 'class="active" aria-current="page"' : ''}>${l}</a>`).join('')
    + `<a class="ext" href="${LEARN_URL}">Foundry Learn ↗</a>`;
}

// ---------- session lifecycle ----------
let lastAnnounced = null;

function finishSession() {
  if (!S) return;
  finalize(S);
  const attempt = { ...S, score: scoreSession(S, byId, blueprint) };
  store.addAttempt(attempt);
  store.clearActive();
  S = null;
  go(`#/results/${attempt.id}`);
}

/** Runs twice a second, and on load and tab focus: updates the clock and closes an expired attempt. */
function tick() {
  if (!S) return;
  if (isExpired(S)) { if ($('#confirm').open) $('#confirm').close(); finishSession(); return; }
  const el = $('#timer-value');
  if (!el || S.deadline === null) return;
  const ms = remainingMs(S);
  el.textContent = formatClock(ms);
  $('#timer').classList.toggle('low', ms <= 10 * 60000);
  const mins = Math.ceil(ms / 60000);
  if ([30, 10, 5, 1].includes(mins) && lastAnnounced !== mins) {
    lastAnnounced = mins;
    $('#timer-live').textContent = `${mins} minute${mins === 1 ? '' : 's'} remaining.`;
  }
}
setInterval(tick, 500);
document.addEventListener('visibilitychange', tick);

const save = () => store.saveActive(S);
const currentQ = () => byId.get(S.qids[S.index]);
const respOf = (qid) => S.responses[qid] || {};
/** In practice with feedback after each answer, a checked response can no longer change. */
const isLocked = (q) => !!respOf(q.id).checked;

function setValue(q, value) {
  if (isLocked(q)) return;
  S.responses[q.id] = { ...respOf(q.id), value, skipped: false };
  save();
}

// ---------- view: setup ----------
const DEFAULT_SETUP = {
  mode: 'mock', timed: true, feedback: 'each', formId: forms[0].id, tfMix: false,
  domains: blueprint.domains.map((d) => d.id), formats: blueprint.formats.map((f) => f.id), length: 10,
};
let setup = { ...DEFAULT_SETUP, ...(store.setup() || {}) };
if (!forms.some((f) => f.id === setup.formId)) setup.formId = forms[0].id;

function setupSummary() {
  const b = blueprint.baseline;
  if (setup.mode === 'mock') {
    const guide = setup.timed && !setup.tfMix;
    return {
      ok: true,
      title: `${setup.timed ? 'Mock Exam' : 'Untimed Mock Exam'}${setup.tfMix ? ' with True/False mix' : ''}`,
      chip: guide ? '<span class="chip accent">Guide-based simulation</span>' : '<span class="chip warn">Practice variation, not the guide-based simulation</span>',
      lines: [
        `${b.questions} questions from ${forms.find((f) => f.id === setup.formId).title}: ${blueprint.domains.map((d) => `${d.questions} ${d.title}`).join(', ')}.`,
        setup.timed ? `Timed: ${b.minutes} minutes. The clock starts when you press Start, keeps running if you close the tab, and the attempt is submitted automatically when it reaches zero.` : 'Untimed: no clock. A progress indicator shows how far you are.',
        'Forward-only: each answer is locked when you advance and you cannot return to an earlier question. You may skip a question; skipped questions are scored as unanswered.',
        `Feedback at the end: correctness, answer keys and explanations appear after you submit. You need ${Math.ceil((b.passPercent * b.questions) / 100)} of ${b.questions} (${b.passPercent}%) to pass.`,
        ...(setup.tfMix ? ['True/False mix: some questions are replaced by True/False items from the same section. This format is not confirmed by official guidance.'] : []),
      ],
    };
  }
  const pool = practicePool(bank, setup).length;
  const n = Math.min(setup.length || pool, pool);
  const minutes = Math.ceil((n * blueprint.practice.secondsPerQuestion) / 60);
  return {
    ok: pool > 0,
    title: `Practice: ${n} question${n === 1 ? '' : 's'}`,
    chip: '<span class="chip">Practice</span>',
    lines: pool === 0 ? ['No questions match this selection. Choose at least one section and one format that have questions.'] : [
      `${n} of ${pool} matching questions, in random order.`,
      setup.timed ? `Timed: ${minutes} minutes (${blueprint.practice.secondsPerQuestion / 60} minutes per question). The session is submitted automatically when the clock reaches zero.` : 'Untimed: no clock. A progress indicator shows how far you are.',
      'You can move backwards and forwards between questions.',
      setup.feedback === 'each'
        ? 'Feedback after each answer: press “Check answer” to lock your response and see the explanation straight away.'
        : 'Feedback at the end: answers are saved as you go and you can revise them until you finish the session.',
    ],
  };
}

function viewSetup() {
  setTitle('');
  const sum = setupSummary();
  const radio = (name, value, label, checked, extra = '') => `<label class="choice"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} ${extra}><span>${label}</span></label>`;
  const check = (name, value, label, checked, note = '') => `<label class="choice"><input type="checkbox" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}${note ? ` <span class="muted">${note}</span>` : ''}</span></label>`;
  const pool = practicePool(bank, setup).length;
  const lengths = [...blueprint.practice.lengths.filter((n) => n < pool), pool].filter((n) => n > 0);
  if (!lengths.includes(setup.length)) setup.length = lengths.find((n) => n >= 10) || lengths[0] || 0;
  const countIn = (pred) => bank.filter(pred).length;

  main.innerHTML = `<div class="page narrow">
    <h1>Foundry Practice</h1>
    <p class="lede">Mock exams and practice questions for the Palantir Foundry Application Developer certification, written to complement <a href="${LEARN_URL}">Foundry Learn</a>.</p>
    <p class="notice"><strong>Independent and unofficial.</strong> Not affiliated with or endorsed by Palantir. All questions are original and are not taken from any exam. The live Associate exam differs from this simulator: <a href="#/about">see what is different</a>.</p>
    ${S ? `<div class="card resume" role="status"><div><strong>Session in progress:</strong> ${esc(S.title)}. Question ${S.index + 1} of ${S.qids.length}${S.deadline ? `, ${formatClock(remainingMs(S))} remaining` : ''}.</div>
      <div class="row"><a class="btn primary" href="#/session">Resume</a><button class="btn" data-act="abandon">Discard it</button></div></div>` : ''}
    <form id="setup" class="setup">
      <fieldset><legend>1. Mode</legend><div class="choices">
        ${radio('mode', 'mock', '<strong>Mock Exam</strong><small>A complete 60-question form, forward-only</small>', setup.mode === 'mock')}
        ${radio('mode', 'practice', '<strong>Practice</strong><small>Choose sections, formats and length</small>', setup.mode === 'practice')}
      </div></fieldset>
      <fieldset><legend>2. Timing</legend><div class="choices">
        ${radio('timed', 'yes', `<strong>Timed</strong><small>${setup.mode === 'mock' ? `${blueprint.baseline.minutes}-minute limit` : `${blueprint.practice.secondsPerQuestion / 60} minutes per question`}</small>`, setup.timed)}
        ${radio('timed', 'no', `<strong>Untimed</strong><small>${setup.mode === 'mock' ? 'Shown as “Untimed Mock Exam”' : 'Work at your own pace'}</small>`, !setup.timed)}
      </div></fieldset>
      <fieldset><legend>3. Feedback</legend><div class="choices">
        ${setup.mode === 'mock'
          ? radio('feedback', 'end', '<strong>At the end</strong><small>Mock exams always reveal feedback after you submit</small>', true, 'disabled')
          : radio('feedback', 'each', '<strong>After each answer</strong><small>Check each answer and read why</small>', setup.feedback === 'each') + radio('feedback', 'end', '<strong>At the end</strong><small>Save and revise, then see everything</small>', setup.feedback === 'end')}
      </div></fieldset>
      ${setup.mode === 'mock' ? `<fieldset><legend>Mock exam options</legend>
        <div class="field"><label for="form-id">Form</label><select id="form-id" name="formId">${forms.map((f) => `<option value="${esc(f.id)}" ${f.id === setup.formId ? 'selected' : ''}>${esc(f.title)}</option>`).join('')}</select><span class="muted">The forms share no questions.</span></div>
        ${check('tfMix', 'yes', 'Include a True/False mix', setup.tfMix, '(practice variation: official guidance does not confirm this format)')}
      </fieldset>` : `<fieldset><legend>Practice options</legend>
        <div class="subhead"><span>Sections</span></div>
        <div class="checks">${blueprint.domains.map((d) => check('domains', d.id, esc(d.title), setup.domains.includes(d.id), `(${countIn((q) => q.domain === d.id)})`)).join('')}</div>
        <div class="subhead"><span>Question formats</span><span class="row"><button type="button" class="btn sm" data-act="tf-drill">True/False drill</button><button type="button" class="btn sm" data-act="all-formats">All formats</button></span></div>
        <div class="checks">${blueprint.formats.map((f) => check('formats', f.id, esc(f.label), setup.formats.includes(f.id), `(${countIn((q) => q.format === f.id)})`)).join('')}</div>
        <div class="field"><label for="length">Session length</label><select id="length" name="length" ${pool ? '' : 'disabled'}>${lengths.map((n) => `<option value="${n}" ${n === setup.length ? 'selected' : ''}>${n === pool ? `All ${n} matching questions` : `${n} questions`}</option>`).join('')}</select></div>
      </fieldset>`}
      <div class="card summary" aria-live="polite">
        <h2>${esc(sum.title)} ${sum.chip}</h2>
        <ul>${sum.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <button type="submit" class="btn primary big" ${sum.ok ? '' : 'disabled'}>Start</button>
      </div>
    </form>
  </div>`;
}

function onSetupChange(e) {
  const t = e.target;
  if (t.name === 'mode') { setup.mode = t.value; setup.timed = t.value === 'mock'; } // Mock defaults to Timed, Practice to Untimed
  else if (t.name === 'timed') setup.timed = t.value === 'yes';
  else if (t.name === 'feedback') setup.feedback = t.value;
  else if (t.name === 'formId') setup.formId = t.value;
  else if (t.name === 'tfMix') setup.tfMix = t.checked;
  else if (t.name === 'length') setup.length = Number(t.value);
  else if (t.name === 'domains' || t.name === 'formats') {
    setup[t.name] = [...main.querySelectorAll(`input[name="${t.name}"]:checked`)].map((i) => i.value);
  } else return;
  store.saveSetup(setup);
  rerenderKeepingFocus(viewSetup);
}

/** Re-renders a form view and puts focus back on the control the learner was using. */
function rerenderKeepingFocus(view) {
  const a = document.activeElement;
  const key = a && main.contains(a) ? (a.id ? `#${a.id}` : a.name ? `[name="${a.name}"][value="${a.value}"]` : a.dataset.act ? `[data-act="${a.dataset.act}"]` : null) : null;
  const y = scrollY;
  view();
  if (key) $(key, main)?.focus({ preventScroll: true });
  scrollTo(0, y);
}

async function startSession() {
  if (S && !(await confirmDialog({ title: 'Discard the session in progress?', body: 'Starting a new session discards the one in progress. It will not be scored or saved.', ok: 'Discard and start' }))) return;
  S = createSession(setup, data);
  lastAnnounced = null;
  save();
  go('#/session');
}

// ---------- view: session ----------
function actionsHtml(q) {
  const r = respOf(q.id), n = S.qids.length, last = S.index === n - 1;
  if (S.mode === 'mock') {
    const ready = isComplete(q, r.value);
    return `<div class="row spread">
      <button class="btn" data-act="skip">Skip question<span class="muted"> (scored as unanswered)</span></button>
      <button class="btn primary" data-act="lock" ${ready ? '' : 'disabled'} aria-describedby="lock-note">${last ? 'Lock answer and submit exam' : 'Lock answer and continue'} →</button>
    </div>
    <p class="hint" id="lock-note">${ready ? 'Your answer is locked when you continue. You cannot come back to this question.' : 'Answer the question to continue, or skip it. You cannot come back to this question.'}</p>
    <p><button class="linkish" data-act="end">End exam now</button></p>`;
  }
  const each = S.feedback === 'each';
  return `<div class="row spread">
    <button class="btn" data-act="prev" ${S.index === 0 ? 'disabled' : ''}>← Previous</button>
    <span class="row">
      ${each ? `<button class="btn primary" data-act="check" ${!r.checked && isComplete(q, r.value) ? '' : 'disabled'}>${r.checked ? 'Answer checked' : 'Check answer'}</button>` : ''}
      ${!each && isAnswered(q, r.value) ? '<button class="btn" data-act="clear">Clear answer</button>' : ''}
      ${last ? '' : `<button class="btn ${each && !r.checked ? '' : 'primary'}" data-act="next">Next →</button>`}
      <button class="btn ${last ? 'primary' : ''}" data-act="end">Finish session</button>
    </span>
  </div>
  ${each ? '' : '<p class="hint">Answers are saved as you select them. You can change them until you finish the session.</p>'}`;
}

function navigatorHtml() {
  if (S.mode === 'mock') return '';
  return `<nav class="qnav" aria-label="Questions in this session"><ol>${S.qids.map((id, i) => {
    const q = byId.get(id), r = respOf(id);
    const st = r.checked ? statusOf(q, r.value) : isAnswered(q, r.value) ? 'answered' : 'open';
    const label = { correct: 'checked, correct', missed: 'checked, incorrect', unanswered: 'checked, unanswered', answered: 'answered', open: 'not answered' }[st];
    return `<li><button class="qn ${st} ${i === S.index ? 'cur' : ''}" data-act="goto" data-i="${i}" aria-label="Question ${i + 1}, ${label}" ${i === S.index ? 'aria-current="step"' : ''}>${i + 1}</button></li>`;
  }).join('')}</ol></nav>`;
}

function viewSession({ focus = 'heading' } = {}) {
  if (!S) { go('#/'); return; }
  const q = currentQ(), r = respOf(q.id), n = S.qids.length;
  const answered = S.qids.filter((id) => isAnswered(byId.get(id), respOf(id).value)).length;
  const done = S.mode === 'mock' ? S.index : answered;
  setTitle(`Question ${S.index + 1} of ${n}`);
  main.innerHTML = `<div class="page narrow session">
    <div class="sess-head">
      <div>
        <div class="eyebrow">${esc(S.title)} ${S.guideBased ? '<span class="chip accent">Guide-based simulation</span>' : ''}</div>
        <h1 id="q-heading" tabindex="-1">Question ${S.index + 1} <span class="muted">of ${n}</span></h1>
      </div>
      ${S.deadline !== null ? `<div class="timer" id="timer" role="timer" aria-label="Time remaining"><span class="eyebrow">Time left</span><span id="timer-value">${formatClock(remainingMs(S))}</span></div>` : '<div class="timer untimed"><span class="eyebrow">Untimed</span><span>No clock</span></div>'}
    </div>
    <div class="progress" role="progressbar" aria-label="${S.mode === 'mock' ? 'Questions completed' : 'Questions answered'}" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${done}"><i style="width:${(done / n) * 100}%"></i></div>
    <p class="progress-note">${S.mode === 'mock' ? `${done} of ${n} completed` : `${answered} of ${n} answered`}</p>
    <div class="chips">${S.mode === 'practice' ? `<span class="chip">${esc(domainOf(q.domain).title)}</span>` : ''}<span class="chip accent">${esc(formatLabel(q.format))}</span></div>
    <div class="stem ${q.format === 'truefalse' ? 'statement' : ''}">${rich(q.stem)}</div>
    <p class="hint">${FORMAT_HINT[q.format]}</p>
    <div id="q-body">${renderBody(q, r.value, S, isLocked(q))}</div>
    <div id="q-feedback">${r.checked ? feedbackHtml(q, r, S) : ''}</div>
    <div id="q-actions" class="sess-actions">${actionsHtml(q)}</div>
    ${navigatorHtml()}
    <div class="sr" id="timer-live" aria-live="polite"></div>
  </div>`;
  if (focus === 'heading') { $('#q-heading').focus({ preventScroll: true }); scrollTo(0, 0); }
  tick();
}

/** After an answer changes: refresh the buttons and the navigator without touching the inputs. */
function refreshControls() {
  const q = currentQ();
  $('#q-actions').innerHTML = actionsHtml(q);
  const nav = $('.qnav');
  if (nav) nav.outerHTML = navigatorHtml();
}

function rerenderBody(focusSel) {
  const q = currentQ();
  $('#q-body').innerHTML = renderBody(q, respOf(q.id).value, S, isLocked(q));
  refreshControls();
  if (focusSel) $(focusSel)?.focus({ preventScroll: true });
}

async function advanceMock(skip) {
  const q = currentQ(), last = S.index === S.qids.length - 1;
  if (!skip && !isComplete(q, respOf(q.id).value)) return;
  if (last && !(await confirmDialog({ title: 'Submit the exam?', body: 'This is the last question. Submitting ends the attempt and shows your results.', ok: 'Submit exam' }))) return;
  if (!S) return; // the clock ran out while the dialog was open
  S.responses[q.id] = skip ? { skipped: true, locked: true } : { ...respOf(q.id), locked: true };
  if (last) { finishSession(); return; }
  S.index++;
  save();
  viewSession();
}

async function endSession() {
  const open = S.qids.filter((id) => !isAnswered(byId.get(id), respOf(id).value)).length;
  const mock = S.mode === 'mock';
  const body = open
    ? `${open} question${open === 1 ? ' is' : 's are'} unanswered and will be scored as unanswered. ${mock ? 'You cannot return to the exam after ending it.' : 'You cannot change answers after finishing.'}`
    : 'Every question has an answer. You cannot change answers after finishing.';
  if (await confirmDialog({ title: mock ? 'End the exam now?' : 'Finish the session?', body, ok: mock ? 'End exam' : 'Finish and see results' }) && S) finishSession();
}

function sessionAct(act, el) {
  const q = currentQ();
  switch (act) {
    case 'lock': return advanceMock(false);
    case 'skip': return advanceMock(true);
    case 'end': return endSession();
    case 'prev': if (S.index > 0) { S.index--; save(); viewSession(); } return;
    case 'next': if (S.index < S.qids.length - 1) { S.index++; save(); viewSession(); } return;
    case 'goto': S.index = Number(el.dataset.i); save(); viewSession(); return;
    case 'clear': S.responses[q.id] = {}; save(); rerenderBody('#q-body input, #q-body select, #q-body [tabindex]'); return;
    case 'check': {
      if (!isComplete(q, respOf(q.id).value) || isLocked(q)) return;
      S.responses[q.id] = { ...respOf(q.id), checked: true };
      save();
      viewSession({ focus: 'none' });
      const fb = $('.feedback');
      fb.setAttribute('tabindex', '-1'); fb.focus({ preventScroll: true }); fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    case 'discrete-yes': case 'discrete-no': {
      if (isLocked(q)) return;
      const value = respOf(q.id).value || { decisions: [] };
      if (discreteDone(q, value)) return;
      const next = S.order[q.id][value.decisions.length];
      setValue(q, { decisions: [...value.decisions, { id: next, yes: act === 'discrete-yes' }] });
      rerenderBody(discreteDone(q, respOf(q.id).value) ? '#q-actions .btn.primary:not([disabled])' : '#discrete-text');
      return;
    }
    case 'discrete-reset': S.responses[q.id] = {}; save(); rerenderBody('#discrete-text'); return;
    default:
  }
}

function onSessionInput(e) {
  const q = currentQ(), t = e.target;
  if (t.name === 'ans') {
    if (q.format === 'single') setValue(q, t.value);
    else if (q.format === 'truefalse') setValue(q, t.value === 'true');
    else setValue(q, [...main.querySelectorAll('input[name="ans"]:checked')].map((i) => i.value));
  } else if (t.dataset.left) {
    const value = { ...(respOf(q.id).value || {}) };
    if (t.value) value[t.dataset.left] = t.value; else delete value[t.dataset.left];
    setValue(q, value);
  } else return;
  refreshControls();
}

function pickRegion(el) {
  const q = currentQ();
  if (isLocked(q)) return;
  setValue(q, el.dataset.region);
  rerenderBody(`[data-region="${el.dataset.region}"]`);
}

// ---------- view: results ----------
function domainTable(score) {
  return `<table class="table"><caption class="sr">Score by section</caption><thead><tr><th scope="col">Section</th><th scope="col">Correct</th><th scope="col" class="bar-col">Share</th></tr></thead><tbody>
    ${blueprint.domains.filter((d) => score.byDomain[d.id]?.total).map((d) => {
      const s = score.byDomain[d.id];
      return `<tr><th scope="row">${esc(d.title)}</th><td>${s.correct} / ${s.total}</td><td class="bar-col"><div class="progress" aria-hidden="true"><i style="width:${pct(s.correct, s.total)}%"></i></div><span>${pct(s.correct, s.total)}%</span></td></tr>`;
    }).join('')}
    <tr class="total"><th scope="row">Overall</th><td>${score.correct} / ${score.total}</td><td class="bar-col"><div class="progress" aria-hidden="true"><i style="width:${pct(score.correct, score.total)}%"></i></div><span>${score.percent}%</span></td></tr>
  </tbody></table>`;
}

function topicTable(attempts) {
  const rows = topicProgress(attempts, blueprint);
  if (!rows.some((r) => r.total)) return '<p class="muted">Finish a practice session to see progress by topic here.</p>';
  return `<table class="table topics"><caption class="sr">Practice progress by topic, all practice sessions</caption><thead><tr><th scope="col">Topic</th><th scope="col">Latest session</th><th scope="col">All practice</th><th scope="col" class="bar-col">Share correct</th></tr></thead><tbody>
    ${blueprint.domains.map((d) => `<tr class="group"><th scope="rowgroup" colspan="4">${esc(d.title)}</th></tr>` + rows.filter((r) => r.domain === d.id).map((r) => `<tr><th scope="row">${esc(r.title)}</th>
      <td>${r.last ? `${r.last.correct} / ${r.last.total}` : '<span class="muted">not yet</span>'}</td>
      <td>${r.total ? `${r.correct} / ${r.total}` : '<span class="muted">not yet</span>'}</td>
      <td class="bar-col">${r.total ? `<div class="progress" aria-hidden="true"><i style="width:${pct(r.correct, r.total)}%"></i></div><span>${pct(r.correct, r.total)}%</span>` : ''}</td></tr>`).join('')).join('')}
  </tbody></table>`;
}

function describeAttempt(a) {
  const bits = [a.mode === 'mock' ? 'Forward-only' : 'Free navigation', a.timed ? `Timed, ${a.minutes} minutes` : 'Untimed', a.feedback === 'each' ? 'Feedback after each answer' : 'Feedback at the end'];
  return bits.join(' · ');
}

function viewResults(id) {
  const a = store.attempt(id);
  if (!a) { main.innerHTML = notFound('That attempt is no longer saved in this browser.'); return; }
  const s = a.score;
  setTitle('Results');
  const verdict = s.passed === null ? '' : s.passed
    ? `<p class="verdict-line ok"><strong>Pass.</strong> ${s.correct} of ${s.total} is at or above the ${blueprint.baseline.passPercent}% threshold (${s.needed} of ${s.total}).</p>`
    : `<p class="verdict-line bad"><strong>Below the pass mark.</strong> ${s.correct} of ${s.total}; ${s.needed} of ${s.total} (${blueprint.baseline.passPercent}%) is needed.</p>`;
  main.innerHTML = `<div class="page narrow">
    <div class="eyebrow">Results · ${esc(fmtDate(a.finalizedAt))}</div>
    <h1 id="results-heading" tabindex="-1">${esc(a.title)}</h1>
    <p class="muted">${esc(describeAttempt(a))}. Time used: ${duration(a.finalizedAt - a.startedAt)}. ${a.guideBased ? '<span class="chip accent">Guide-based simulation</span>' : a.mode === 'mock' ? '<span class="chip warn">Practice variation</span>' : ''}</p>
    ${a.expired ? '<p class="notice warn" role="status"><strong>Time expired.</strong> The attempt was submitted automatically at the deadline. Questions you had not answered are scored as unanswered.</p>' : ''}
    <div class="score-card card">
      <div class="score"><span class="score-num">${s.percent}%</span><span class="score-sub">${s.correct} of ${s.total} correct${s.unanswered ? ` · ${s.unanswered} unanswered` : ''}</span></div>
      ${verdict}
    </div>
    <div class="row"><a class="btn primary big" href="#/review/${esc(a.id)}">Review answers</a><a class="btn big" href="#/">New session</a></div>
    <h2>Score by section</h2>
    ${domainTable(s)}
    ${a.mode === 'practice' ? `<h2>Progress by topic</h2><p class="muted">Across every practice session saved in this browser, including this one.</p>${topicTable(store.attempts())}` : ''}
    <p class="muted small">Each question is worth one point with no partial credit. <a href="#/about">How scoring works</a>.</p>
  </div>`;
  $('#results-heading').focus({ preventScroll: true });
  scrollTo(0, 0);
}

const notFound = (msg) => `<div class="page narrow"><h1>Not found</h1><p>${esc(msg)}</p><p><a class="btn primary" href="#/">Start a session</a></p></div>`;

// ---------- view: review ----------
const FILTERS = [['all', 'All'], ['correct', 'Correct'], ['missed', 'Missed'], ['unanswered', 'Unanswered']];

function viewReview(id, filter = 'all') {
  const a = store.attempt(id);
  if (!a) { main.innerHTML = notFound('That attempt is no longer saved in this browser.'); return; }
  setTitle('Review answers');
  const items = a.qids.map((qid, i) => ({ q: byId.get(qid), i, r: a.responses[qid] || {} })).filter((x) => x.q)
    .map((x) => ({ ...x, st: statusOf(x.q, x.r.value) }));
  const count = (f) => (f === 'all' ? items.length : items.filter((x) => x.st === f).length);
  const shown = items.filter((x) => filter === 'all' || x.st === filter);
  main.innerHTML = `<div class="page narrow review">
    <div class="eyebrow"><a href="#/results/${esc(a.id)}">← Results</a></div>
    <h1 id="review-heading" tabindex="-1">Review answers</h1>
    <p class="muted">${esc(a.title)} · ${a.score.correct} of ${a.score.total} correct · ${esc(fmtDate(a.finalizedAt))}</p>
    <div class="filters" role="group" aria-label="Filter questions">
      ${FILTERS.map(([f, l]) => `<a class="btn ${f === filter ? 'primary' : ''}" href="#/review/${esc(a.id)}/${f}" ${f === filter ? 'aria-current="true"' : ''}>${l} <span class="count">${count(f)}</span></a>`).join('')}
    </div>
    ${shown.length ? shown.map(({ q, i, r }) => `<article class="rq" aria-labelledby="rq-${i}">
      <h2 id="rq-${i}">Question ${i + 1}</h2>
      <div class="chips"><span class="chip">${esc(domainOf(q.domain).title)}</span><span class="chip">${esc(domainOf(q.domain).objectives.find((o) => o.id === q.objective)?.title || q.objective)}</span><span class="chip accent">${esc(formatLabel(q.format))}</span><span class="chip">${esc(q.difficulty)}</span></div>
      <div class="stem ${q.format === 'truefalse' ? 'statement' : ''}">${rich(q.stem)}</div>
      ${q.format === 'hotspot' ? figureSvg(q, { selected: r.value || null, reveal: true }) : ''}
      ${feedbackHtml(q, r, a, { withYours: true })}
    </article>`).join('') : `<p class="card">No questions in this filter.</p>`}
    <div class="row"><a class="btn" href="#/results/${esc(a.id)}">Back to results</a><a class="btn primary" href="#/">New session</a></div>
  </div>`;
}

// ---------- view: progress ----------
function viewProgress() {
  setTitle('Progress');
  const attempts = store.attempts();
  main.innerHTML = `<div class="page narrow">
    <h1>Progress</h1>
    <h2>Practice progress by topic</h2>
    ${topicTable(attempts)}
    <h2>Saved attempts</h2>
    ${attempts.length ? `<table class="table"><caption class="sr">Saved attempts, newest first</caption><thead><tr><th scope="col">Session</th><th scope="col">Finished</th><th scope="col">Score</th><th scope="col"><span class="sr">Links</span></th></tr></thead><tbody>
      ${attempts.map((a) => `<tr><th scope="row">${esc(a.title)}<div class="muted small">${esc(describeAttempt(a))}${a.expired ? ' · time expired' : ''}</div></th><td>${esc(fmtDate(a.finalizedAt))}</td>
        <td>${a.score.correct} / ${a.score.total} (${a.score.percent}%) ${a.score.passed === null ? '' : a.score.passed ? '<span class="chip ok">Pass</span>' : '<span class="chip bad">Below pass mark</span>'}</td>
        <td><a href="#/results/${esc(a.id)}">Results</a> · <a href="#/review/${esc(a.id)}">Review</a></td></tr>`).join('')}
    </tbody></table>
    <p><button class="btn" data-act="clear-history">Delete saved attempts</button></p>` : '<p class="muted">No finished attempts yet.</p>'}
    <p class="muted small">Attempts are saved only in this browser (the newest 40 are kept). Clearing site data removes them.</p>
  </div>`;
}

// ---------- view: about ----------
function viewAbout() {
  setTitle('About & scoring');
  const b = blueprint.baseline;
  const fmtCounts = blueprint.formats.map((f) => `${bank.filter((q) => q.format === f.id).length} ${f.label}`).join(', ');
  main.innerHTML = `<div class="page narrow prose">
    <h1>About & scoring</h1>
    <p class="notice"><strong>Independent and unofficial.</strong> Foundry Practice is a personal study project. It is not affiliated with, endorsed by, or reviewed by Palantir Technologies. Every question is original, written from public Palantir documentation; none is taken from, or claims to reproduce, a real exam.</p>
    <h2>What the simulator is based on</h2>
    <p>The mock exam follows the ${esc(b.label)}: ${b.questions} questions, ${b.minutes} minutes, a ${b.passPercent}% passing score and questions presented in sequence with no way back. The guide itself is not redistributed here.</p>
    <table class="table"><caption class="sr">Mock exam blueprint</caption><thead><tr><th scope="col">Section</th><th scope="col">Weight</th><th scope="col">Questions per form</th></tr></thead><tbody>
      ${blueprint.domains.map((d) => `<tr><th scope="row">${esc(d.title)}<div class="muted small">${d.objectives.map((o) => esc(o.title)).join(' · ')}</div></th><td>${d.weightPercent}%</td><td>${d.questions}</td></tr>`).join('')}
    </tbody></table>
    <p>The bank holds ${bank.length} questions (${fmtCounts}) and ${forms.length} mock forms that share no questions.</p>
    <h2>How this differs from the current official Associate guidance</h2>
    <p>${esc(guidance.summary)}</p>
    <div class="table-scroll"><table class="table"><caption class="sr">Simulator compared with the current official guide</caption><thead><tr><th scope="col">Topic</th><th scope="col">This simulator</th><th scope="col">Current official guidance</th></tr></thead><tbody>
      ${guidance.rows.map((r) => `<tr><th scope="row">${esc(r.topic)}</th><td>${esc(r.simulator)}</td><td>${esc(r.official)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">Checked on ${esc(guidance.checkedOn)} against <a href="${esc(guidance.officialGuide.url)}" target="_blank" rel="noopener">${esc(guidance.officialGuide.title)} ↗</a> and <a href="${esc(guidance.announcement.url)}" target="_blank" rel="noopener">${esc(guidance.announcement.title)} ↗</a>. Official guidance changes; check it before you book.</p>
    <h2>Scoring</h2>
    <ul>
      <li>Every question is worth one point. There is no partial credit and no penalty for a wrong answer.</li>
      <li>A 60-question mock passes at ${b.passPercent}%: ${Math.ceil((b.passPercent * b.questions) / 100)} of ${b.questions} passes, ${Math.ceil((b.passPercent * b.questions) / 100) - 1} of ${b.questions} does not. Practice sessions show a score but no pass or fail.</li>
      <li><strong>Single-select, hotspot, True/False:</strong> correct when you choose the one keyed answer or region.</li>
      <li><strong>Multi-select:</strong> correct only when you select exactly the keyed set. One missing or one extra selection scores zero.</li>
      <li><strong>Matching:</strong> correct only when every item on the left is matched to its keyed answer.</li>
      <li><strong>Discrete options:</strong> options appear one at a time in random order and you answer Yes or No for each. The item ends as correct when you accept the keyed option, and as incorrect when you accept another option or reject the keyed one.</li>
      <li>Skipped and unanswered questions score zero and are listed as unanswered. A discrete-options item you did not finish is unanswered.</li>
      <li>When a timed session reaches its deadline it is submitted automatically, even if the tab was closed, and is scored on the answers saved by then.</li>
    </ul>
    <h2>True/False</h2>
    <p>True/False questions are a practice format here. The official material does not list True/False for the Associate exam, so the optional True/False mix in a mock form is labelled as a practice variation and is never called the guide-based simulation.</p>
    <h2>Your data</h2>
    <p>Sessions, answers and results are stored in this browser's local storage only. Nothing is sent anywhere, and there are no accounts or analytics.</p>
    <p>Study notes: <a href="${LEARN_URL}">Foundry Learn</a>. Documentation: <a href="https://www.palantir.com/docs/foundry/" target="_blank" rel="noopener">palantir.com/docs/foundry ↗</a>.</p>
  </div>`;
}

// ---------- router and events ----------
function render() {
  const [, name = '', a, b] = location.hash.replace(/^#/, '').split('/');
  if (S && isExpired(S)) { finishSession(); return; }
  renderNav(name);
  document.body.classList.toggle('in-session', name === 'session');
  if (name === 'session') viewSession();
  else if (name === 'results') viewResults(a);
  else if (name === 'review') { viewReview(a, FILTERS.some(([f]) => f === b) ? b : 'all'); $('#review-heading')?.focus({ preventScroll: true }); scrollTo(0, 0); }
  else if (name === 'progress') viewProgress();
  else if (name === 'about') viewAbout();
  else viewSetup();
}

const inSession = () => S && location.hash.startsWith('#/session');

main.addEventListener('change', (e) => {
  if (e.target.closest('#setup')) onSetupChange(e);
  else if (inSession()) onSessionInput(e);
});
main.addEventListener('submit', (e) => { if (e.target.id === 'setup') { e.preventDefault(); startSession(); } });
main.addEventListener('click', async (e) => {
  const region = e.target.closest('[data-region]');
  if (region && inSession()) { pickRegion(region); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  if (act === 'tf-drill') { setup.formats = ['truefalse']; store.saveSetup(setup); rerenderKeepingFocus(viewSetup); }
  else if (act === 'all-formats') { setup.formats = blueprint.formats.map((f) => f.id); store.saveSetup(setup); rerenderKeepingFocus(viewSetup); }
  else if (act === 'abandon') {
    if (await confirmDialog({ title: 'Discard the session in progress?', body: 'It will not be scored or saved.', ok: 'Discard' })) { store.clearActive(); S = null; render(); }
  } else if (act === 'clear-history') {
    if (await confirmDialog({ title: 'Delete saved attempts?', body: 'This removes every finished attempt and the progress by topic from this browser.', ok: 'Delete' })) { store.clearAttempts(); render(); }
  } else if (inSession()) sessionAct(act, el);
});
main.addEventListener('keydown', (e) => {
  const region = e.target.closest?.('[data-region]');
  if (!region || !inSession()) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickRegion(region); return; }
  const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!dir) return;
  e.preventDefault();
  const all = [...main.querySelectorAll('[data-region]')];
  all[(all.indexOf(region) + dir + all.length) % all.length].focus();
});

addEventListener('hashchange', render);
// Another tab may finish or replace the session; follow it rather than overwrite it.
addEventListener('storage', (e) => { if (e.key === 'fp:active') { S = store.active(); render(); } });
render();
