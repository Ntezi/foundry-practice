// Renders questions (interactive and read-only) and the feedback shown after checking or in review.
import { CHOICE_FORMATS, discreteDone, isAnswered, isCorrect, statusOf } from './engine.js';

const LETTERS = 'ABCDEFGHIJ';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Escapes text and turns `backticks` into inline code. */
export const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

export const FORMAT_HINT = {
  single: 'Choose one answer.',
  multi: 'Choose every answer that applies. All must be right to score.',
  discrete: 'Options appear one at a time. Decide for each whether it is a correct answer.',
  hotspot: 'Select one region of the diagram.',
  matching: 'Match every item on the left. All must be right to score.',
  truefalse: 'Decide whether the statement is true or false.',
};

/** Options in this attempt's display order, each with its display letter. */
export function shownOptions(q, session) {
  const order = session.order?.[q.id] || q.options.map((o) => o.id);
  return order.map((id, i) => ({ ...q.options.find((o) => o.id === id), letter: LETTERS[i] }));
}
function shownRight(q, session) {
  const order = session.order?.[q.id] || q.right.map((r) => r.id);
  return order.map((id, i) => ({ ...q.right.find((r) => r.id === id), letter: LETTERS[i] }));
}
const regionLetter = (q, id) => LETTERS[q.figure.regions.findIndex((r) => r.id === id)];

// ---------- hotspot figure ----------
function edgePoints(a, b) {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const horizontal = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
  if (horizontal) {
    const right = cb.x > ca.x;
    return [right ? a.x + a.w : a.x, ca.y, right ? b.x - 4 : b.x + b.w + 4, cb.y];
  }
  const down = cb.y > ca.y;
  return [ca.x, down ? a.y + a.h : a.y, cb.x, down ? b.y - 4 : b.y + b.h + 4];
}

/** opts: { selected, interactive, reveal } — reveal colours the keyed region and a wrong pick. */
export function figureSvg(q, { selected = null, interactive = false, reveal = false } = {}) {
  const f = q.figure, W = f.width || 640, H = f.height || 360;
  const byId = new Map(f.regions.map((r) => [r.id, r]));
  const groups = (f.groups || []).map((g) => `<rect class="fig-group" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="10"/><text class="fig-group-label" x="${g.x + 10}" y="${g.y + 18}">${esc(g.label)}</text>`).join('');
  const edges = (f.edges || []).map((e) => {
    const [x1, y1, x2, y2] = edgePoints(byId.get(e.from), byId.get(e.to));
    const label = e.label ? `<text class="fig-edge-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 5}" text-anchor="middle">${esc(e.label)}</text>` : '';
    return `<line class="fig-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#fp-arrow)"/>${label}`;
  }).join('');
  const regions = f.regions.map((r, i) => {
    const isKey = q.answer.includes(r.id), isSel = selected === r.id;
    const cls = ['fig-region', isSel ? 'sel' : '', reveal && isKey ? 'key' : '', reveal && isSel && !isKey ? 'wrong' : ''].filter(Boolean).join(' ');
    const state = reveal ? (isKey ? ', correct region' : isSel ? ', your selection' : '') : '';
    const a11y = interactive
      ? `tabindex="0" role="radio" aria-checked="${isSel}" data-region="${esc(r.id)}"`
      : 'role="listitem"';
    return `<g class="${cls}" ${a11y} aria-label="Region ${LETTERS[i]}: ${esc(r.label)}${state}">
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8"/>
      <circle class="fig-badge" cx="${r.x + 14}" cy="${r.y + 14}" r="9"/><text class="fig-badge-text" x="${r.x + 14}" y="${r.y + 18}" text-anchor="middle">${LETTERS[i]}</text>
      <foreignObject x="${r.x + 4}" y="${r.y + 4}" width="${r.w - 8}" height="${r.h - 8}"><div xmlns="http://www.w3.org/1999/xhtml" class="fig-label">${esc(r.label)}</div></foreignObject>
    </g>`;
  }).join('');
  return `<div class="fig-wrap"><svg class="fig" viewBox="0 0 ${W} ${H}" role="${interactive ? 'radiogroup' : 'list'}" aria-label="${esc(f.alt)}">
    <defs><marker id="fp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="fig-arrow" d="M0 0L10 5L0 10z"/></marker></defs>
    ${groups}${edges}${regions}</svg></div>`;
}

// ---------- interactive body ----------
export function renderBody(q, value, session, locked) {
  const dis = locked ? 'disabled' : '';
  if (q.format === 'single' || q.format === 'multi') {
    const type = q.format === 'single' ? 'radio' : 'checkbox';
    const picked = q.format === 'single' ? [value] : value || [];
    return `<fieldset class="opts" ${dis}><legend class="sr">${q.format === 'single' ? 'Choose one answer' : `Choose ${q.answer.length} answers`}</legend>
      ${shownOptions(q, session).map((o) => `<label class="opt"><input type="${type}" name="ans" value="${esc(o.id)}" ${picked.includes(o.id) ? 'checked' : ''}><span class="letter">${o.letter}</span><span class="opt-text">${rich(o.text)}</span></label>`).join('')}
    </fieldset>`;
  }
  if (q.format === 'truefalse') {
    return `<fieldset class="opts tf" ${dis}><legend class="sr">Is the statement true or false?</legend>
      ${[true, false].map((v) => `<label class="opt"><input type="radio" name="ans" value="${v}" ${value === v ? 'checked' : ''}><span class="opt-text">${v ? 'True' : 'False'}</span></label>`).join('')}
    </fieldset>`;
  }
  if (q.format === 'matching') {
    const right = shownRight(q, session);
    return `<fieldset class="match" ${dis}><legend class="sr">Match each item to one answer</legend>
      <div class="match-key"><span class="eyebrow">Answers</span><ol type="A">${right.map((r) => `<li>${rich(r.text)}</li>`).join('')}</ol></div>
      ${q.left.map((l, i) => `<div class="match-row"><label for="m-${i}">${rich(l.text)}</label>
        <select id="m-${i}" data-left="${esc(l.id)}"><option value="">Choose a match…</option>${right.map((r) => `<option value="${esc(r.id)}" ${value?.[l.id] === r.id ? 'selected' : ''}>${r.letter}. ${esc(r.text)}</option>`).join('')}</select></div>`).join('')}
    </fieldset>`;
  }
  if (q.format === 'hotspot') {
    const sel = value ? q.figure.regions.find((r) => r.id === value) : null;
    return `${figureSvg(q, { selected: value, interactive: !locked, reveal: locked })}
      <p class="hint" aria-live="polite">${sel ? `Selected: region ${regionLetter(q, value)} (${esc(sel.label)})` : 'No region selected. Click a region, or tab to it and press Enter or Space.'}</p>`;
  }
  if (q.format === 'discrete') {
    const opts = shownOptions(q, session);
    const decisions = value?.decisions || [];
    const done = discreteDone(q, value);
    const past = decisions.map((d, i) => `<li><span class="letter">${i + 1}</span><span class="opt-text">${rich(q.options.find((o) => o.id === d.id).text)}</span><span class="chip">${d.yes ? 'You said Yes' : 'You said No'}</span></li>`).join('');
    const current = opts[decisions.length];
    return `<div class="discrete">
      ${past ? `<ol class="discrete-past" aria-label="Options you have already judged">${past}</ol>` : ''}
      ${done || !current
        ? `<p class="hint" role="status">Response recorded. This item ends once you accept an option or reject the correct one.</p>${locked ? '' : '<button class="btn sm" data-act="discrete-reset">Start this question again</button>'}`
        : `<div class="discrete-card" role="group" aria-label="Option ${decisions.length + 1} of up to ${opts.length}">
            <div class="eyebrow">Option ${decisions.length + 1} of up to ${opts.length}</div>
            <p class="discrete-text" id="discrete-text" tabindex="-1">${rich(current.text)}</p>
            <p class="hint">Is this a correct answer to the question?</p>
            <div class="row"><button class="btn" data-act="discrete-yes" ${dis}>Yes, correct</button><button class="btn" data-act="discrete-no" ${dis}>No, not correct</button></div>
          </div>`}
    </div>`;
  }
  return '';
}

// ---------- answer text ----------
function optText(q, session, id) {
  const o = shownOptions(q, session).find((x) => x.id === id);
  return o ? `${o.letter}. ${rich(o.text)}` : '';
}

export function correctAnswerHtml(q, session) {
  switch (q.format) {
    case 'single': case 'discrete': return optText(q, session, q.answer[0]);
    case 'multi': return `<ul>${shownOptions(q, session).filter((o) => q.answer.includes(o.id)).map((o) => `<li>${o.letter}. ${rich(o.text)}</li>`).join('')}</ul>`;
    case 'truefalse': return q.answer ? 'True' : 'False';
    case 'hotspot': { const r = q.figure.regions.find((x) => x.id === q.answer[0]); return `Region ${regionLetter(q, r.id)}: ${esc(r.label)}`; }
    case 'matching': return `<ul>${q.left.map((l) => `<li>${rich(l.text)} → ${rich(q.right.find((r) => r.id === q.answer[l.id]).text)}</li>`).join('')}</ul>`;
    default: return '';
  }
}

export function yourAnswerHtml(q, resp, session) {
  const value = resp?.value;
  if (!isAnswered(q, value)) return `<span class="muted">${resp?.skipped ? 'Skipped (unanswered)' : 'Unanswered'}</span>`;
  switch (q.format) {
    case 'single': return optText(q, session, value);
    case 'multi': return `<ul>${shownOptions(q, session).filter((o) => value.includes(o.id)).map((o) => `<li>${o.letter}. ${rich(o.text)}</li>`).join('')}</ul>`;
    case 'truefalse': return value ? 'True' : 'False';
    case 'hotspot': { const r = q.figure.regions.find((x) => x.id === value); return `Region ${regionLetter(q, r.id)}: ${esc(r.label)}`; }
    case 'matching': return `<ul>${q.left.map((l) => `<li>${rich(l.text)} → ${value[l.id] ? rich(q.right.find((r) => r.id === value[l.id]).text) : '<span class="muted">no match chosen</span>'}</li>`).join('')}</ul>`;
    case 'discrete': {
      const last = value.decisions[value.decisions.length - 1];
      return `${last.yes ? 'Accepted' : 'Rejected'}: ${optText(q, session, last.id)}`;
    }
    default: return '';
  }
}

/** Why the learner's response falls short. Empty when correct or unanswered. */
function wrongNotes(q, value, session) {
  if (!isAnswered(q, value) || isCorrect(q, value)) return [];
  const opt = (id) => q.options.find((o) => o.id === id);
  switch (q.format) {
    case 'single': return [rich(opt(value).why)];
    case 'multi': return [
      ...value.filter((id) => !q.answer.includes(id)).map((id) => `You selected “${rich(opt(id).text)}”. ${rich(opt(id).why)}`),
      ...q.answer.filter((id) => !value.includes(id)).map((id) => `You did not select “${rich(opt(id).text)}”. ${rich(opt(id).why)}`),
    ];
    case 'discrete': {
      const last = value.decisions[value.decisions.length - 1];
      return [last.yes ? `You accepted “${rich(opt(last.id).text)}”. ${rich(opt(last.id).why)}` : `You rejected the correct option. ${rich(opt(last.id).why)}`];
    }
    case 'truefalse': return [q.answer ? 'You answered False, but the statement is true as written.' : 'You answered True, but the statement is false.'];
    case 'hotspot': return [rich(q.figure.regions.find((r) => r.id === value).why)];
    case 'matching': return q.left.filter((l) => value[l.id] !== q.answer[l.id]).map((l) => {
      const mine = q.right.find((r) => r.id === value[l.id]);
      return `“${rich(l.text)}”: you chose ${mine ? `“${rich(mine.text)}”` : 'no match'}. ${rich(l.why)}`;
    });
    default: return [];
  }
}

/** Every option, match or region with its rationale, marked with the key and the learner's response. */
function explainAll(q, value, session) {
  const badge = (t, cls = '') => `<span class="chip ${cls}">${t}</span>`;
  if (CHOICE_FORMATS.includes(q.format)) {
    const decided = new Map((value?.decisions || []).map((d) => [d.id, d.yes]));
    const picked = q.format === 'single' ? [value] : q.format === 'multi' ? value || [] : [];
    return `<ul class="explain">${shownOptions(q, session).map((o) => {
      const key = q.answer.includes(o.id);
      const mine = q.format === 'discrete'
        ? (decided.has(o.id) ? badge(decided.get(o.id) ? 'You said Yes' : 'You said No', decided.get(o.id) === key ? 'ok' : 'bad') : badge('Not shown to you'))
        : (picked.includes(o.id) ? badge('Your answer', key ? 'ok' : 'bad') : '');
      return `<li class="${key ? 'key' : ''}"><div><span class="letter">${o.letter}</span> <span class="opt-text">${rich(o.text)}</span> ${key ? badge('Correct answer', 'ok') : ''} ${mine}</div><p>${rich(o.why)}</p></li>`;
    }).join('')}</ul>`;
  }
  if (q.format === 'matching') {
    return `<ul class="explain">${q.left.map((l) => {
      const right = q.right.find((r) => r.id === q.answer[l.id]);
      const mine = value?.[l.id];
      return `<li class="key"><div><span class="opt-text">${rich(l.text)} → ${rich(right.text)}</span> ${mine ? badge(mine === right.id ? 'You matched this' : 'You matched it differently', mine === right.id ? 'ok' : 'bad') : ''}</div><p>${rich(l.why)}</p></li>`;
    }).join('')}</ul>`;
  }
  if (q.format === 'hotspot') {
    return `<ul class="explain">${q.figure.regions.map((r) => {
      const key = q.answer.includes(r.id);
      return `<li class="${key ? 'key' : ''}"><div><span class="letter">${regionLetter(q, r.id)}</span> <span class="opt-text">${esc(r.label)}</span> ${key ? badge('Correct region', 'ok') : ''} ${value === r.id ? badge('Your selection', key ? 'ok' : 'bad') : ''}</div><p>${rich(r.why)}</p></li>`;
    }).join('')}</ul>`;
  }
  return '';
}

const VERDICT = { correct: ['Correct', 'ok'], missed: ['Incorrect', 'bad'], unanswered: ['Unanswered', 'warn'] };

/**
 * The feedback block: verdict, correct answer, the deciding principle, why the response falls short,
 * every option explained, and the source. `withYours` adds the learner's answer (used in the final review).
 */
export function feedbackHtml(q, resp, session, { withYours = false } = {}) {
  const value = resp?.value;
  const st = statusOf(q, value);
  const notes = wrongNotes(q, value, session);
  const all = explainAll(q, value, session);
  const allTitle = q.format === 'matching' ? 'Each match explained' : q.format === 'hotspot' ? 'Each region explained' : 'Each option explained';
  return `<section class="feedback ${VERDICT[st][1]}" aria-label="Feedback">
    <p class="verdict"><span class="chip ${VERDICT[st][1]} big">${VERDICT[st][0]}</span></p>
    <dl class="answers">
      ${withYours ? `<div><dt>Your answer</dt><dd>${yourAnswerHtml(q, resp, session)}</dd></div>` : ''}
      <div><dt>Correct answer</dt><dd>${correctAnswerHtml(q, session)}</dd></div>
      ${q.format === 'truefalse' && q.answer === false ? `<div><dt>Corrected statement</dt><dd>${rich(q.correction)}</dd></div>` : ''}
    </dl>
    <h3>Why</h3>
    <p>${rich(q.explanation)}</p>
    ${notes.length ? `<h3>Why your answer falls short</h3>${notes.length === 1 ? `<p>${notes[0]}</p>` : `<ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul>`}` : ''}
    ${all ? `<h3>${allTitle}</h3>${all}` : ''}
    <p class="source">Source: <a href="${esc(q.source.url)}" target="_blank" rel="noopener">${esc(q.source.title)}<span class="sr"> (Palantir documentation, opens in a new tab)</span> ↗</a></p>
  </section>`;
}
