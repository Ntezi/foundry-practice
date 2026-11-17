# Foundry Practice

Mock exams and practice questions for the Palantir Foundry Application Developer certification. A companion to [Foundry Learn](https://ntezi.github.io/foundry-learn/).

Live site: <https://ntezi.github.io/foundry-practice/>

> **Independent and unofficial.** This is a personal study project. It is not affiliated with, endorsed by, or reviewed by Palantir Technologies. Every question is original and written from public Palantir documentation. None is taken from, or claims to reproduce, a real exam.

## What it does

- **Mock Exam**: a complete 60-question form, one question at a time, forward-only. Each answer is locked when you advance; you can skip a question, and a skipped question is scored as unanswered. Feedback appears only after you submit.
- **Practice**: pick sections, question formats and session length, move backwards and forwards, and choose feedback after each answer ("Check answer") or at the end. A True/False-only drill is one click.
- **Timed or untimed** in either mode. Only the timed, forward-only mock with the guide's formats is labelled the guide-based simulation. An untimed mock is labelled "Untimed Mock Exam".
- **Review answers** after every session: the question, your answer or its unanswered status, the correct answer, the explanation, why each option is right or falls short, and the documentation source. Filter by all, correct, missed or unanswered.
- **Progress** by section for every attempt, and by topic across practice sessions.
- Timed sessions count down to a saved deadline, so a refresh or a closed tab does not stop the clock. An attempt whose deadline has passed is submitted automatically, including when you come back later.
- Everything is stored in the browser's local storage. There is no backend, account or analytics.

## Exam blueprint and how it differs from the live exam

The simulator baseline is the 2026 Application Developer Certification Guide the author studied from: 60 questions, 120 minutes, a 70% passing score, and questions presented in sequence with no way back. That PDF is marked proprietary, so it is **not** in this repository (`*.pdf` is git-ignored); only its structure is encoded in [`data/blueprint.json`](data/blueprint.json).

| Section | Weight | Questions per form |
| --- | --- | --- |
| Application Design | 30% | 18 |
| Application Implementation | 30% | 18 |
| UX and Cross-Application Workflows | 20% | 12 |
| Application Maintenance | 20% | 12 |

Palantir refreshed its Associate exams on 3 August 2026. The current official guidance, checked on 17 November 2026, describes a different exam:

| Topic | This simulator (baseline guide) | Current official Associate guidance |
| --- | --- | --- |
| Questions | 60 | 85 |
| Duration | 120 minutes | 3 hours |
| Passing score | 70% (42 of 60) | 70% |
| Navigation | Forward-only | "Questions are sequential" |
| Formats | Single-select, multi-select, discrete options, hotspot, matching | The launch announcement says "multiple-choice"; no other format is mentioned |
| True/False | Practice only, plus an optional, labelled mix in mock forms | Not mentioned |
| Content outline | Four weighted sections (above) | Eight domains without published weights: Ontology Schema Design and Workflow Assembly; Action Types and Write-Back Patterns; Ontology Functions; Workshop Application Development; OSDK, APIs, and External Applications; Automate and Operational Workflows; AIP Logic and AI-Powered Applications; Application Security, Governance, and Operations |
| Coverage gaps | Covers Quiver, Scenarios, Foundry Rules, Object Views and Carbon, as the baseline guide lists them | OSDK and external applications, Automate, AIP Logic, Python functions, and security and governance are exam domains that this bank covers only in passing or not at all |
| Conditions | In the browser, unproctored | Timed and open-book, valid for two years |

Sources: [Application Developer Associate Certification Exam Guide](https://learn.palantir.com/page/palantir-application-developer-associate-certification-exam-guide) and the [certification refresh announcement](https://community.palantir.com/t/palantir-certifications-are-getting-a-refresh-with-a-brand-new-ai-engineer-exam-launching-3-august/7022). The same comparison is shown in the app under **About & scoring** and lives in [`data/guidance.json`](data/guidance.json); update that file when the guidance changes. A pass here shows topic knowledge. It does not predict a result on the live exam.

## Scoring rules

Every question is worth one point, with no partial credit and no penalty for a wrong answer.

| Format | Scored as correct when |
| --- | --- |
| Single-select | You choose the one keyed option. |
| Multi-select | You select exactly the keyed set. One missing or one extra selection scores zero. |
| Discrete options | Options appear one at a time in random order and you answer Yes or No for each. The item ends as correct when you accept the keyed option, and as incorrect when you accept another option or reject the keyed one. An item you did not finish is unanswered. |
| Hotspot | You select the one keyed region of the diagram. |
| Matching | Every item on the left is matched to its keyed answer. |
| True/False | You choose the keyed value. |

- A 60-question mock passes at 70% with equal weights: **42 of 60 passes, 41 of 60 does not**. The check is `correct * 100 >= 70 * total`, in integers, so there is no rounding.
- Skipped and unanswered questions score zero and are reported as unanswered.
- Results show the overall score and correct/total per section. Practice sessions have no pass or fail; their scores feed the progress-by-topic table.
- A timed session that reaches its deadline is scored on the answers saved by then.

The rules are implemented in [`src/engine.js`](src/engine.js) and tested in [`test/engine.test.mjs`](test/engine.test.mjs).

## Source provenance

- **Questions** are original, scenario-based and written for this project. Each one cites a public page under `https://www.palantir.com/docs/foundry/` that supports the keyed answer.
- **Blueprint** (question count, time limit, pass mark, sections and weights, formats) comes from the baseline guide described above.
- **Diagrams** in hotspot questions are original and drawn by the site from data in the question file. No Palantir screenshots or artwork are used.
- **True/False** is a practice format inspired by the Foundry Aware exam experience. It is not listed in the official Associate material, so the optional True/False mix in a mock form is labelled a practice variation.
- No exam dumps, recalled exam questions, or third-party question banks were used.

Documentation changes. Run `npm run check:links` to confirm every cited page still resolves, and re-read a page before trusting an old explanation.

## Setup

Requires Node 22 or newer.

```bash
npm install
npm run dev        # validate data, build, then serve http://localhost:4322/foundry-practice/
```

Other scripts:

```bash
npm test             # scoring, pass threshold, session and deadline tests
npm run validate     # check the blueprint, question bank and forms
npm run build        # validate + bundle into dist/
npm run serve        # serve the existing dist/ under /foundry-practice/
npm run check:links  # check every documentation link (needs network)
```

## How it fits together

```
data/blueprint.json      sections, objectives, formats, baseline numbers
data/questions/*.json    the question bank, one file per section
data/forms.json          the mock forms (lists of question ids) and their True/False swaps
data/guidance.json       the comparison with current official guidance
src/engine.js            sessions, scoring, deadlines (no DOM, unit-tested)
src/question.js          question and feedback rendering for every format
src/app.js               setup, session, results, review, progress and about views
src/store.js             localStorage persistence
site/                    page shell and styles
scripts/                 validate, bundle, serve, link check
```

The app is plain JavaScript bundled with esbuild, like Foundry Learn. The question bank is compiled into the bundle, so the published site is three static files.

## GitHub Pages deployment

The site is a project page, so it is served from `/foundry-practice/`. Asset URLs are relative and routes are hash-based (`#/session`, `#/review/<id>`), so the build needs no path rewriting; the base path is recorded in [`scripts/config.mjs`](scripts/config.mjs) and the local server serves `dist/` under it so local behaviour matches production.

1. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
2. Push to `main`. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the tests, validates the data, builds, and publishes `dist/`.

If the repository is renamed, change `BASE_PATH` in `scripts/config.mjs`, the canonical link in `site/index.html`, and the links in this README.

## How to add questions

1. Open the section file in `data/questions/` and add an object. [`data/SCHEMA.md`](data/SCHEMA.md) describes every field and format. Minimal single-select example:

   ```json
   {
     "id": "des-037",
     "domain": "design",
     "objective": "tool-selection",
     "difficulty": "medium",
     "format": "single",
     "stem": "A scenario with a realistic constraint, then the question.",
     "options": [
       { "id": "a", "text": "…", "why": "Why this falls short in the scenario." },
       { "id": "b", "text": "…", "why": "Why this satisfies the scenario." },
       { "id": "c", "text": "…", "why": "…" },
       { "id": "d", "text": "…", "why": "…" }
     ],
     "answer": ["b"],
     "explanation": "The Foundry behaviour or design principle that decides the answer.",
     "source": { "title": "Page title", "url": "https://www.palantir.com/docs/foundry/…" }
   }
   ```

2. Give it a new id and never reuse or renumber an existing one: saved attempts refer to questions by id.
3. Write original scenarios, cite one public documentation page, and explain every option. Options are shuffled per attempt, so do not refer to an option by letter and do not use "all of the above". Keep True and False keys balanced.
4. Run `npm run validate`. It checks ids, objectives, answer keys, per-option explanations, hotspot geometry, True/False balance and the forms.
5. A new question is available to Practice straight away. To use it in a mock, edit `data/forms.json`; each form must keep 18 / 18 / 12 / 12 questions per section, share no question with another form, and include every guide format. `scripts/build-forms.mjs` regenerates both forms from the id convention, and overwrites manual edits to `forms.json`.

## Accessibility

Every control is reachable by keyboard. Options are native radio buttons and checkboxes, matching uses native selects, hotspot regions are focusable (Tab or arrow keys, then Enter or Space) and labelled for screen readers, and discrete options use buttons. Focus moves to the question heading on navigation and to the feedback after checking an answer. The layout is responsive and supports light and dark themes.
