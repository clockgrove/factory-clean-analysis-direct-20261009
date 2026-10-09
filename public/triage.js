// Personal metadata only. Storage failures never roll back the current visit.
export const triageKey = 'incident-explorer.triage.v1';
export const noteLimit = 1000;
const fields = ['id', 'title', 'service', 'status', 'severity'];
function validEntry(entry) {
  return entry && fields.every(key => typeof entry[key] === 'string') && /^INC-\d{6}$/.test(entry.id) &&
    ['Accounts', 'Billing', 'Search', 'Uploads', 'Notifications', 'Integrations'].includes(entry.service) &&
    ['open', 'in_progress', 'resolved'].includes(entry.status) && ['critical', 'high', 'medium', 'low'].includes(entry.severity) &&
    typeof entry.note === 'string' && entry.note.length <= noteLimit;
}
export function createTriage(storage) {
  let entries = [], message = 'Triage and notes stay in this browser. Notes save as you type.';
  try {
    const raw = storage.getItem(triageKey);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every(validEntry) || new Set(parsed.map(x => x.id)).size !== parsed.length) throw new Error('Malformed triage');
      entries = parsed.map(entry => Object.fromEntries([...fields, 'note'].map(key => [key, entry[key]])));
    }
  } catch {
    message = 'Saved triage could not be read. This visit starts with an empty list; browser persistence may be unavailable.';
  }
  const persist = () => {
    try { storage.setItem(triageKey, JSON.stringify(entries)); message = 'Triage and notes saved in this browser.'; }
    catch { message = 'Browser storage is unavailable. Your triage and notes remain usable for this visit, but may be lost on reload.'; }
  };
  return {
    get entries() { return entries; },
    get message() { return message; },
    has: id => entries.some(entry => entry.id === id),
    add(incident) {
      if (entries.some(entry => entry.id === incident.id)) return;
      entries.push({...Object.fromEntries(fields.map(key => [key, incident[key]])), note: ''}); persist();
    },
    remove(id) { entries = entries.filter(entry => entry.id !== id); persist(); },
    note(id, text) { const entry = entries.find(entry => entry.id === id); if (!entry) return; entry.note = text.slice(0, noteLimit); persist(); }
  };
}
