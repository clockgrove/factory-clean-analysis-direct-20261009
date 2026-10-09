import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createAppServer} from '../../server/app.mjs';

const dataset = new URL('../../.runtime/incidents.json', import.meta.url);
const parameters = options => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  }
  return params;
};

// Independent reduction over canonical records, without importing production helpers.
function overviewOracle(rows, options) {
  const matching = rows.filter(row => {
    if (options.q && ![row.id, row.title, row.description].some(value => value.toUpperCase().includes(options.q.toUpperCase()))) return false;
    for (const facet of ['service', 'status', 'severity']) {
      if (options[facet]?.length && !options[facet].includes(row[facet])) return false;
    }
    const opened = Date.parse(row.openedAt);
    return (!options.from || opened >= Date.parse(`${options.from}T00:00:00Z`)) &&
      (!options.to || opened < Date.parse(`${options.to}T00:00:00Z`) + 86400000);
  });
  const services = [...new Set(matching.map(row => row.service))].map(service => {
    const group = matching.filter(row => row.service === service);
    const resolved = group.filter(row => row.status === 'resolved');
    return {
      service,
      incidentCount: group.length,
      unresolvedCount: group.filter(row => row.status === 'open' || row.status === 'in_progress').length,
      highSeverityCount: group.filter(row => row.severity === 'critical' || row.severity === 'high').length,
      averageResolutionHours: resolved.length ? resolved.reduce((hours, row) => hours + (Date.parse(row.resolvedAt) - Date.parse(row.openedAt)) / 3600000, 0) / resolved.length : null,
    };
  });
  services.sort((a, b) => b.unresolvedCount - a.unresolvedCount || a.service.localeCompare(b.service));
  return {matching, services};
}

test('overview measures use every filtered canonical record through real loopback HTTP', {timeout: 30000}, async t => {
  const before = await readFile(dataset);
  const rows = JSON.parse(before);
  const server = await createAppServer();
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = path => fetch(base + path, {signal: AbortSignal.timeout(5000)});
    const check = async (options = {}) => {
      const response = await request(`/api/overview?${parameters(options)}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /application\/json/);
      const body = await response.json();
      const oracle = overviewOracle(rows, options);
      assert.deepEqual(body, {services: oracle.services});
      return {body, oracle};
    };

    await t.test('unfiltered counts and resolved-only averages cover all 2400 incidents', async () => {
      const {body} = await check();
      assert.equal(body.services.length, 6);
      assert.equal(body.services.reduce((sum, service) => sum + service.incidentCount, 0), 2400);
      assert.ok(body.services.every(service => service.averageResolutionHours > 0));
      // The highest attention count determines order, independently of dataset order.
      for (let index = 1; index < body.services.length; index++) {
        assert.ok(body.services[index - 1].unresolvedCount >= body.services[index].unresolvedCount);
      }
    });

    await t.test('combined search, OR facets and inclusive UTC range span several pages', async () => {
      const options = {q: 'InCiDeNt', service: ['Accounts', 'Billing'], status: ['open', 'in_progress', 'resolved'], severity: ['critical', 'high'], from: '2026-04-15', to: '2026-06-13'};
      const {body, oracle} = await check(options);
      assert.ok(oracle.matching.length > 50);
      const first = await (await request(`/api/incidents?${parameters({...options, page: 1, pageSize: 25})}`)).json();
      const second = await (await request(`/api/incidents?${parameters({...options, page: 2, pageSize: 25})}`)).json();
      assert.equal(first.total, oracle.matching.length);
      assert.equal(second.items.length, 25);
      assert.notDeepEqual(first.items, second.items);
      assert.equal(body.services.reduce((sum, service) => sum + service.incidentCount, 0), first.total);
      for (const paging of [{page: 2, pageSize: 25}, {page: 5, pageSize: 50}, {page: 'ignored', pageSize: 'ignored'}]) {
        assert.deepEqual((await check({...options, ...paging})).body, body);
      }
      assert.deepEqual((await check({...options, sort: 'severity', direction: 'asc'})).body, body);
    });

    await t.test('literal search and each UTC boundary match incident-list meanings', async () => {
      for (const options of [
        {q: 'inc-000001'}, {q: 'sEcOnD LiNe: <SAMPLE>'}, {q: 'retry, then continue'},
        {from: '2026-04-01', to: '2026-04-01'},
        {from: '2026-06-29', to: '2026-06-29'},
        {from: '2026-06-13'}, {to: '2026-04-15'},
        {service: ['Search', 'Search', 'Uploads'], status: ['resolved'], severity: ['low', 'medium']},
      ]) {
        const {oracle} = await check(options);
        const list = await (await request(`/api/incidents?${parameters(options)}`)).json();
        assert.equal(list.total, oracle.matching.length);
      }
    });

    await t.test('no resolved incidents have unavailable averages; resolved ties use service name', async () => {
      const unresolved = await check({service: ['Billing'], status: ['open', 'in_progress']});
      assert.equal(unresolved.body.services.length, 1);
      assert.ok(unresolved.body.services[0].incidentCount > 25);
      assert.equal(unresolved.body.services[0].averageResolutionHours, null);
      assert.equal(unresolved.body.services[0].unresolvedCount, unresolved.body.services[0].incidentCount);
      const resolved = await check({status: ['resolved']});
      assert.deepEqual(resolved.body.services.map(service => service.service), ['Accounts', 'Billing', 'Integrations', 'Notifications', 'Search', 'Uploads']);
      assert.ok(resolved.body.services.every(service => service.unresolvedCount === 0 && service.averageResolutionHours > 0));
    });

    await t.test('empty result contains no fabricated services or zero averages', async () => {
      for (const options of [{q: '.*'}, {q: 'nothing matches this phrase'}, {from: '2027-01-01'}]) {
        assert.deepEqual((await check(options)).body, {services: []});
      }
    });

    await t.test('overview shares useful filter validation and remains read only', async () => {
      for (const params of ['service=billing', 'status=closed', 'severity=urgent', 'from=2026-02-30', 'from=2026-06-01&to=2026-04-01', 'q=a&q=b', 'unknown=yes', 'sort=id', 'direction=down']) {
        const response = await request(`/api/overview?${params}`);
        assert.equal(response.status, 400, params);
        const body = await response.json();
        assert.equal(body.error.code, 'INVALID_QUERY');
        assert.ok(body.error.message.length);
      }
      const mutation = await fetch(`${base}/api/overview`, {method: 'POST', signal: AbortSignal.timeout(5000)});
      assert.equal(mutation.status, 405);
      assert.equal(mutation.headers.get('allow'), 'GET');
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    assert.deepEqual(await readFile(dataset), before);
  }
});
