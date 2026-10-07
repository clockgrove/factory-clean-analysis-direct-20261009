import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const services = ['Accounts', 'Billing', 'Search', 'Uploads', 'Notifications', 'Integrations'];
const severities = ['critical', 'high', 'medium', 'low'];
const statuses = ['open', 'in_progress', 'resolved'];
const teams = ['Cobalt', 'Juniper', 'Orchid', 'Maple'];
const regions = ['AMER', 'EMEA', 'APAC'];
const topics = ['Slow response', 'Intermittent timeout', 'Delayed update', 'Unexpected retry', 'Missing result', 'Configuration question', 'Stale display', 'Batch processing delay'];
const tags = ['latency', 'retry', 'batch', 'configuration', 'display', 'availability'];
const dayMs = 86_400_000;
const epoch = Date.UTC(2026, 3, 1);
let state = 0x51f15e77;
function next() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}
function pick(values) { return values[next() % values.length]; }
const records = [];
for (let i = 0; i < 2400; i++) {
  const service = pick(services);
  const severity = pick(severities);
  const status = pick(statuses);
  const topic = pick(topics);
  const opened = epoch + (next() % 90) * dayMs + (next() % 96) * 900_000;
  const openedAt = new Date(opened).toISOString();
  const resolvedAt = status === 'resolved' ? new Date(opened + (1 + next() % 72) * 3_600_000).toISOString() : null;
  const punctuation = i % 41 === 0
    ? ' Note: "retry, then continue".\nSecond line: <sample> is literal text.'
    : i % 17 === 0 ? ' Note: customer-visible, intermittent behavior.' : '';
  records.push({
    id: `INC-${String(i + 1).padStart(6, '0')}`,
    title: `${topic} in ${service}`,
    description: `Fictional ${service} incident concerning ${topic.toLowerCase()}. Scenario ${i % 113}.${punctuation}`,
    service,
    severity,
    status,
    openedAt,
    resolvedAt,
    team: pick(teams),
    region: pick(regions),
    tags: [...new Set([pick(tags), pick(tags)])],
  });
}
// A pair with identical business sort keys makes stable tie handling observable.
records[1].openedAt = records[0].openedAt;
records[1].severity = records[0].severity;
if (records[1].status === 'resolved') {
  records[1].resolvedAt = new Date(Date.parse(records[1].openedAt) + dayMs).toISOString();
}
const directory = fileURLToPath(new URL('../.runtime/', import.meta.url));
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('../.runtime/incidents.json', import.meta.url), JSON.stringify(records) + '\n');
