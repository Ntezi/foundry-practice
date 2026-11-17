// Browser persistence. Everything lives in localStorage under the "fp:" prefix; nothing leaves the device.
const KEY = { active: 'fp:active', attempts: 'fp:attempts', setup: 'fp:setup', theme: 'fp:theme' };
const MAX_ATTEMPTS = 40;

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const store = {
  active: () => read(KEY.active, null),
  saveActive: (s) => write(KEY.active, s),
  clearActive: () => { try { localStorage.removeItem(KEY.active); } catch { /* ignore */ } },
  attempts: () => read(KEY.attempts, []),
  attempt: (id) => read(KEY.attempts, []).find((a) => a.id === id) || null,
  addAttempt(a) {
    const list = [a, ...read(KEY.attempts, []).filter((x) => x.id !== a.id)].slice(0, MAX_ATTEMPTS);
    write(KEY.attempts, list);
  },
  clearAttempts: () => write(KEY.attempts, []),
  setup: () => read(KEY.setup, null),
  saveSetup: (s) => write(KEY.setup, s),
  theme: () => { try { return localStorage.getItem(KEY.theme); } catch { return null; } },
  setTheme: (t) => { try { localStorage.setItem(KEY.theme, t); } catch { /* ignore */ } },
};
