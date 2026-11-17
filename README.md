# Foundry Practice

Mock exams and practice questions for the Palantir Application Developer Associate certification. A companion to [Foundry Learn](https://ntezi.github.io/foundry-learn/).

Live site: <https://ntezi.github.io/foundry-practice/>

> **Independent and unofficial.** This is a personal study project. It is not affiliated with, endorsed by, or reviewed by Palantir Technologies. Every question is original and written from public Palantir documentation. None is taken from, or claims to reproduce, a real exam.

## What it does

- **Mock Exam**: a full exam, one question at a time, sequential and forward-only. Each answer is locked when you advance; you can skip a question, and a skipped question is scored as unanswered. Feedback appears only after you submit. Two blueprints:
  - **Current official Associate guide** (default): 85 multiple-choice questions, 180 minutes, 60 of 85 to pass. Every attempt is a fresh random draw across the eight official domains.
  - **2026 PDF certification guide**: the earlier 60-question, 120-minute exam, as two fixed forms.
- **Practice**: any number of questions, from one to everything that matches the domains and formats you pick. By default you review each answer as you go: "Check answer" shows whether you were right, the correct answer, the explanation and the documentation source before you move on. Feedback at the end is the alternative. A True/False-only drill is one click.
- **Timed or untimed** in either mode. Only a timed, forward-only mock is labelled as following a guide. An untimed mock is labelled "Untimed Mock Exam".
- **Where to focus**: after every session the results list the topics where you scored below 70%, weakest first, with the documentation pages behind the questions you missed and a button that starts a practice session on exactly those topics. The Progress page does the same across all practice sessions.
- **Review answers** after every session: the question, your answer or its unanswered status, the correct answer, the explanation, why each option is right or falls short, and the source. Filter by all, correct, missed or unanswered.
- Timed sessions count down to a saved deadline, so a refresh or a closed tab does not stop the clock. An attempt whose deadline has passed is submitted automatically, including when you come back later.
- Everything is stored in the browser's local storage. There is no backend, account or analytics.

## How the simulator follows the official guide

The default mock follows the current [Application Developer Associate Certification Exam Guide](https://learn.palantir.com/page/palantir-application-developer-associate-certification-exam-guide), published when Palantir refreshed its Associate exams on 3 August 2026 ([announcement](https://community.palantir.com/t/palantir-certifications-are-getting-a-refresh-with-a-brand-new-ai-engineer-exam-launching-3-august/7022)). Checked on 17 November 2026.

Taken from the official guide:

| Topic | Official guide | Simulator |
| --- | --- | --- |
| Questions | 85 | 85 |
| Duration | 3 hours | 180 minutes |
| Passing score | 70% | 70%, which is 60 of 85 |
| Question order | "Questions are sequential" | One at a time, no way back |
| Format | Multiple-choice (per the announcement) | Single-select and multi-select only |
| Content | Eight domains | The same eight domains, with results reported per domain |

The eight domains: Ontology Schema Design and Workflow Assembly; Action Types and Write-Back Patterns; Ontology Functions; Workshop Application Development; OSDK, APIs, and External Applications; Automate and Operational Workflows; AIP Logic and AI-Powered Applications; Application Security, Governance, and Operations.

Where the guide is silent, the simulator assumes:

- **Domain weights** are not published, so the 85 questions are spread as evenly as possible: 11 for each of the first five domains and 10 for each of the last three (`blueprint.exams[associate].quotas`).
- **Scoring**: one point per question, no partial credit for multi-select.
- **Skipping** is allowed and scored as unanswered.
- **Open book**: the live exam is open-book; the simulator neither prevents nor assists look-ups.
- **Other formats**: True/False, hotspot, matching and discrete options are not mentioned in the official material, so they are offered in Practice and in the 2026 PDF guide mock only.

The same lists are shown in the app under **About & scoring** and live in [`data/guidance.json`](data/guidance.json); update that file when the guidance changes. A pass here shows topic knowledge. It does not predict a result on the live exam.

### The earlier 2026 PDF guide

The site was first built on a 2026 Application Developer Certification Guide PDF that describes an earlier exam: 60 questions, 120 minutes, 70% to pass, and four weighted sections (Application Design 30%, Application Implementation 30%, UX and Cross-Application Workflows 20%, Application Maintenance 20%), with hotspot, matching and discrete-options questions. It is kept as a second mock blueprint. That PDF is marked proprietary, so it is **not** in this repository (`*.pdf` is git-ignored); only its structure is encoded in `blueprint.guide2026`. Its Quiver, Scenarios, Foundry Rules, Object Views and Carbon topics are not in the current outline and appear in Practice as "Earlier-guide topics".

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

- A mock passes at 70% with equal weights. For the Associate mock that is **60 of 85 (59 does not pass)**; for the 2026 PDF guide mock, **42 of 60 (41 does not pass)**. The check is `correct * 100 >= 70 * total`, in integers, so there is no rounding.
- Skipped and unanswered questions score zero and are reported as unanswered.
- Results show the overall score and correct/total per domain. Practice sessions have no pass or fail; their scores feed the progress-by-topic table.
- A topic counts as a weakness when its share correct is below 70% (`blueprint.practice.weakBelowPercent`). Unanswered questions count as missed. On the Progress page a topic needs at least three practice questions behind it.
- A timed session that reaches its deadline is scored on the answers saved by then.

The rules are implemented in [`src/engine.js`](src/engine.js) and tested in [`test/engine.test.mjs`](test/engine.test.mjs).

## Source provenance

- **Questions** are original, scenario-based and written for this project. Each one cites a public page under `https://www.palantir.com/docs/foundry/` that supports the keyed answer.
- **Blueprints** (question count, time limit, pass mark, domains, formats) come from the two guides described above.
- **Diagrams** in hotspot questions are original and drawn by the site from data in the question file. No Palantir screenshots or artwork are used.
- **True/False** is a practice format inspired by the Foundry Aware exam experience. It is not listed in the official Associate material, so it is never part of the Associate mock, and the optional True/False mix in a 2026-guide form is labelled a practice variation.
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
data/blueprint.json      the two exam blueprints, the eight official domains and their objectives, formats
data/questions/*.json    the question bank (every file in the folder is loaded)
data/forms.json          the fixed 2026-guide forms (lists of question ids) and their True/False swaps
data/guidance.json       what is taken from the official guide and what is assumed
data/SCHEMA.md           the question data shape
data/AUTHORING.md        the quality bar and sourcing rules for new questions
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

1. Add an object to any file in `data/questions/`, or add a new `.json` file there; every file in the folder is loaded. [`data/SCHEMA.md`](data/SCHEMA.md) describes every field and format, and [`data/AUTHORING.md`](data/AUTHORING.md) the quality bar. Minimal single-select example:

   ```json
   {
     "id": "osdk-027",
     "domain": "osdk",
     "objective": "authentication",
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
4. Run `npm run validate`. It checks ids, domains and objectives, answer keys, per-option explanations, hotspot geometry, True/False balance, the forms, and that every official domain has enough multiple-choice questions to fill the Associate mock.
5. A new question is available to Practice straight away. A single-select or multi-select question in one of the eight official domains also joins the pool the Associate mock draws from; nothing else needs editing. The fixed 2026-guide forms in `data/forms.json` only take questions that carry a `guide` placement.

## Accessibility

Every control is reachable by keyboard. Options are native radio buttons and checkboxes, matching uses native selects, hotspot regions are focusable (Tab or arrow keys, then Enter or Space) and labelled for screen readers, and discrete options use buttons. Focus moves to the question heading on navigation and to the feedback after checking an answer. The layout is responsive and supports light and dark themes.
