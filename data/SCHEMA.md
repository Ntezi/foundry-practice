# Question bank schema

Every file in `data/questions/` is a JSON array of question objects. `npm run validate` checks all of this.

## Fields every question has

| Field | Meaning |
| --- | --- |
| `id` | Stable, lower-case kebab id, never reused or renumbered (`osdk-014`, `aip-tf-03`). Saved attempts refer to it. |
| `domain` | One of the official Associate guide's eight domains (`ontology`, `actions`, `functions`, `workshop`, `osdk`, `automate`, `aip`, `security`), or `extended` for topics that only the earlier 2026 PDF guide lists. See `blueprint.json`. |
| `objective` | An objective id of that domain in `blueprint.json` (e.g. `sdk-usage`). |
| `guide` | Optional. `{ "section": "design", "objective": "tool-selection" }` places the question in the 2026 PDF guide's four-section outline (`blueprint.guide2026`). Only questions with `guide` can be used in the fixed 60-question forms. |
| `associateMock` | Optional. `false` keeps a question out of the 85-question Associate mock while leaving it in Practice. Used for questions on an API generation the current official guide no longer lists (TypeScript v1 functions). |
| `difficulty` | `easy`, `medium` or `hard`. |
| `format` | `single`, `multi`, `discrete`, `hotspot`, `matching` or `truefalse`. |
| `stem` | The scenario and the question. Backticks render as code. For `truefalse` it is the single statement being judged. |
| `answer` | The key. Shape depends on the format (below). |
| `explanation` | The Foundry behaviour or design principle that decides the answer, and why the keyed answer satisfies the scenario. |
| `source` | `{ "title": "...", "url": "https://www.palantir.com/docs/foundry/..." }`: the public Palantir documentation page that supports the answer. |

## Per format

**`single`, `multi`, `discrete`**: `options` is 4-6 of `{ "id": "a", "text": "...", "why": "..." }`. `why` says why that option is right, or why it falls short in this scenario. `answer` is an array of option ids: exactly one for `single` and `discrete`, two or more for `multi` (the stem must say how many: "Select TWO."). Options are shuffled per attempt, so never write "all of the above" or refer to an option by letter or position.

`discrete` uses the same data as `single`; the simulator shows the options one at a time and asks "is this a correct answer?" for each.

**`truefalse`**: `answer` is `true` or `false`. One precise statement per question. A false statement needs `correction`: the statement rewritten so it is true. Keep True and False keys balanced.

**`matching`**: `left` is 3-5 of `{ "id", "text", "why" }` (`why` explains that item's correct match); `right` is at least as many `{ "id", "text" }` (extra right items act as distractors). `answer` maps each left id to one right id; a right item is used at most once.

**`hotspot`**: `figure` describes an original box-and-arrow diagram drawn by the site (no image files):

```json
"figure": {
  "width": 640, "height": 360,
  "alt": "One sentence describing the diagram for screen readers.",
  "groups":  [{ "x": 10, "y": 10, "w": 300, "h": 340, "label": "Pipeline" }],
  "regions": [{ "id": "r1", "label": "Raw orders dataset", "x": 30, "y": 60, "w": 130, "h": 54, "why": "..." }],
  "edges":   [{ "from": "r1", "to": "r2", "label": "optional" }]
}
```

`regions` (4-8) are the clickable areas: non-overlapping, inside the canvas, at least 90x40, with labels of a few words. `why` explains why that region is or is not the answer. `groups` are optional unclickable background panels with a title (leave ~26px at the top of a group for its label). `edges` are optional arrows between regions. `answer` is an array with the one correct region id.

## Mock exams

The **Associate mock** (85 questions) has no fixed form. Each attempt draws the per-domain quota in `blueprint.exams[associate].quotas` at random from the `single` and `multi` questions of that domain (except those marked `associateMock: false`), so every new multiple-choice question in an official domain joins the pool automatically.

The **2026 PDF guide mock** uses the fixed forms in `data/forms.json`: `{ "id", "title", "questions": [60 ids], "trueFalseMix": [["des-005", "des-tf-01"], ...] }`. Each form must hold 18 / 18 / 12 / 12 questions per guide section (`guide.section`), share no question with another form, and contain every one of that guide's formats. `trueFalseMix` pairs a form question with a True/False question of the same section that replaces it when the learner switches on the optional True/False mix.
