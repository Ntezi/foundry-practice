# Writing questions for Foundry Practice

Foundry Practice is an independent, unofficial practice site for the Palantir Application Developer Associate certification. Questions are original and grounded in public Palantir documentation.

Read `data/SCHEMA.md` (exact data shape) and `data/blueprint.json` (domain and objective ids) first.

## Quality bar

- **Scenario-based.** A short realistic situation (a team, an application, a constraint or a symptom), then the question. Two to five sentences. Invent fictional organisations; never use real company names.
- **Judgement, not trivia.** The official guide says the best design is "the smallest design that satisfies correctness, security, user experience, auditability, and operational needs", and warns against fixing failures by over-permissioning or removing validation. Prefer questions that test that kind of choice and diagnosis. Avoid exact numeric limits, menu paths and UI pixel details.
- **Plausible distractors.** Each wrong option is a real Foundry feature or a tempting shortcut that falls short for this constraint. Options are similar in length and the keyed one is not systematically the longest.
- **Every option has `why`.** For the keyed option, why it satisfies the scenario. For each distractor, specifically why it falls short here.
- **`explanation`** states the underlying Foundry behaviour or design principle in two to four sentences.
- **`single`**: four options, one keyed. **`multi`**: five options, two or three keyed, and the stem ends with "Select TWO." or "Select THREE.".
- **`truefalse`**: one precise, unambiguous statement about Foundry behaviour. A false statement needs `correction`. Keep True and False keys balanced.
- **`matching`**: four left items, four or five right items.
- Options are shuffled per attempt: never refer to an option by letter or position, and never write "all of the above" or "none of the above".
- Backticks render as inline code. Keep code to one line.

## Sources

- Only test behaviour you confirmed in the public documentation under `https://www.palantir.com/docs/foundry/`. If you are unsure of a detail, do not test it.
- `source.url` is one specific page that supports the keyed answer. Do not invent URLs.
- **The docs site answers HTTP 200 for pages that do not exist.** Check the page title, not the status code: a missing page has a "404" or "Page Not Found" title. `npm run check:links` does this for the whole bank.
- Write everything in your own words. Do not copy from any exam, dump site or third-party question bank, and do not search for such material.

## Finish

Run `node scripts/validate.mjs --bank-only` and fix every problem reported for your ids.
