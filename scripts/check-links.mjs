// Checks that every documentation link in the question bank still resolves to a real page. Needs network access.
// Usage: npm run check:links
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = join(root, 'data/questions');
const uses = new Map();
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  for (const q of JSON.parse(readFileSync(join(dir, f), 'utf8'))) {
    const url = q.source?.url; if (!url) continue;
    uses.set(url, [...(uses.get(url) || []), q.id]);
  }
}
const urls = [...uses.keys()].sort();
let bad = 0;
const queue = [...urls];
async function worker() {
  for (let url; (url = queue.shift());) {
    let status;
    try {
      const res = await fetch(url.split('#')[0], { redirect: 'follow', headers: { 'user-agent': 'foundry-practice-link-check' } });
      status = res.status;
      // The docs site answers 200 for pages that do not exist, so the page title has to be read too.
      const title = ((await res.text()).match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
      if (status === 200 && (!title.trim() || /404|not found/i.test(title))) status = `soft 404 (title: "${title.trim()}")`;
    } catch (e) { status = e.message; }
    if (status !== 200) { bad++; console.log(`${status}  ${url}\n      used by ${uses.get(url).join(', ')}`); }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`${urls.length} distinct documentation links checked, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
