import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {once} from 'node:events';
import {createAppServer} from '../../server/app.mjs';
import {expected} from './oracle.js';

const alias = dirname(execFileSync('bash', ['-c', 'command -v qualification-chromium'], {encoding: 'utf8'}).trim());
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(alias, '../browsers');
await mkdir('.runtime/browser-tmp', {recursive: true});
for (const key of ['TMPDIR', 'TMP', 'TEMP']) process.env[key] = '.runtime/browser-tmp';
const {chromium} = await import('playwright');
const triageKey = 'incident-explorer.triage.v1';

async function waitFor(read, wanted) {
  const deadline = Date.now() + 10000;
  let actual;
  do {
    actual = await read();
    if (JSON.stringify(actual) === JSON.stringify(wanted)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  assert.deepEqual(actual, wanted);
}
function measures(options = {}) {
  const matches = expected(options).items;
  return [...new Set(matches.map(x => x.service))].map(service => {
    const items = matches.filter(x => x.service === service), resolved = items.filter(x => x.status === 'resolved');
    const unresolved = items.filter(x => x.status !== 'resolved').length;
    return {service, unresolved, values: [String(items.length), String(unresolved), String(items.filter(x => ['critical', 'high'].includes(x.severity)).length), resolved.length ? `${(resolved.reduce((sum, x) => sum + (Date.parse(x.resolvedAt) - Date.parse(x.openedAt)) / 3600000, 0) / resolved.length).toFixed(1)} h` : 'Unavailable']};
  }).sort((a, b) => b.unresolved - a.unresolved || a.service.localeCompare(b.service));
}

test('real Chromium service overview and personal triage journeys', {timeout: 120000}, async t => {
  const before = await readFile('.runtime/incidents.json');
  let server, browser, context, page, port;
  const start = async () => {
    server = await createAppServer(); server.listen(port || 0, '127.0.0.1'); await once(server, 'listening'); port = server.address().port;
  };
  const stop = async () => {
    if (!server?.listening) return;
    await new Promise((resolve, reject) => {server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();});
  };
  try {
    await start();
    browser = await chromium.launch({channel: 'chromium', headless: true, chromiumSandbox: true, env: {
      PATH: process.env.PATH, HOME: process.env.HOME,
      LD_LIBRARY_PATH: resolve(alias, '../host-libs/usr/lib/x86_64-linux-gnu'),
      ALSA_CONFIG_PATH: resolve(alias, '../host-libs/usr/share/alsa/alsa.conf'),
      TMPDIR: '.runtime/browser-tmp', TMP: '.runtime/browser-tmp', TEMP: '.runtime/browser-tmp'
    }});
    context = await browser.newContext(); page = await context.newPage(); page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${port}`;
    const cdp = await context.newCDPSession(page); await cdp.send('Network.enable');
    const throttle = latency => cdp.send('Network.emulateNetworkConditions', {offline: false, latency, downloadThroughput: -1, uploadThroughput: -1});
    const search = async value => {await page.locator('#search').fill(value); await page.locator('#search').press('Enter');};
    const ready = async () => {
      await waitFor(() => page.locator('#freshness').textContent(), 'Current selections');
      await waitFor(() => page.locator('#results').getAttribute('aria-busy'), 'false');
    };
    const checkOverview = async (options = {}) => {
      await waitFor(() => page.locator('#overview-freshness').textContent(), 'Service attention reflects current selections.');
      await waitFor(() => page.locator('.service-card').evaluateAll(cards => cards.map(card => ({service: card.dataset.service, values: [...card.querySelectorAll('dd')].map(x => x.textContent)}))), measures(options).map(({service, values}) => ({service, values})));
    };
    const detailReady = () => waitFor(() => page.locator('#detail-content dd').count(), 11);

    await t.test('overview uses whole filtered results, survives page/size changes and explains unavailable/empty', async () => {
      await page.goto(base); await ready(); await checkOverview();
      const options = {q: 'incident', service: ['Billing', 'Notifications'], severity: ['critical', 'high'], from: '2026-04-15', to: '2026-06-13'};
      await search(options.q);
      for (const [facet, values] of [['service', options.service], ['severity', options.severity]]) for (const value of values) await page.locator(`#${facet} input[value="${value}"]`).check();
      await page.locator('#from').fill(options.from); await page.locator('#to').fill(options.to);
      await ready(); await checkOverview(options); assert.ok(expected(options).items.length > 50);
      let overviewRequests = 0;
      const count = request => {if (new URL(request.url()).pathname === '/api/overview') overviewRequests++;};
      page.on('request', count);
      try {
        const snapshot = await page.locator('#service-cards').textContent();
        await page.locator('#next').click(); await ready(); await checkOverview(options);
        await page.locator('#page-size').selectOption('50'); await ready(); await checkOverview(options);
        assert.equal(await page.locator('#service-cards').textContent(), snapshot); assert.equal(overviewRequests, 0);
      } finally {page.off('request', count);}
      await page.locator('#status input[value="open"]').check(); await ready(); await checkOverview({...options, status: ['open']});
      assert.ok((await page.locator('.service-card dd').allTextContents()).includes('Unavailable'));
      await search('no matching incident phrase'); await ready(); await checkOverview({...options, status: ['open'], q: 'no matching incident phrase'});
      assert.match(await page.locator('#overview-message').textContent(), /No services match/);
      await page.locator('#clear').click(); await ready(); await checkOverview();
    });

    await t.test('loading labels old selection; superseded HTTP cannot replace current measures; real outage retries current selection', async () => {
      await throttle(800);
      const pending = page.waitForRequest(r => new URL(r.url()).pathname === '/api/overview' && new URL(r.url()).searchParams.get('q') === 'Billing');
      await search('Billing'); await pending;
      assert.equal(await page.locator('#service-overview').getAttribute('aria-busy'), 'true');
      assert.match(await page.locator('#overview-freshness').textContent(), /Previous measures shown for: All incidents/);
      assert.match(await page.locator('#overview-selection').textContent(), /Search: Billing/);
      await search('Uploads'); await ready(); await checkOverview({q: 'Uploads'});
      const old = page.waitForRequest(r => new URL(r.url()).pathname === '/api/overview' && new URL(r.url()).searchParams.get('q') === 'Billing');
      await search('Billing'); await old; await stop(); await search('Search');
      await waitFor(() => page.locator('#overview-message button').count(), 1);
      assert.match(await page.locator('#overview-message').textContent(), /Service overview failed/);
      assert.match(await page.locator('#overview-freshness').textContent(), /Previous measures shown for: Search: Uploads/);
      assert.match(await page.locator('#overview-selection').textContent(), /Search: Search/);
      await start(); await throttle(0);
      await page.locator('#overview-message button').click(); await checkOverview({q: 'Search'});
      await page.locator('#result-message button').click(); await ready();
      await page.locator('#clear').click(); await ready(); await checkOverview();
    });

    await t.test('keyboard triage additions, literal note editing, reload, reopen, order and removal preserve search on a phone', async () => {
      await page.setViewportSize({width: 375, height: 812});
      await search('inc-000001'); await ready(); await checkOverview({q: 'inc-000001'});
      const first = page.locator('#rows button').first(); await first.focus(); await first.press('Enter'); await detailReady();
      const add = page.getByRole('button', {name: 'Add to triage', exact: true}); await add.focus(); await add.press('Enter');
      await waitFor(() => page.getByRole('button', {name: 'Remove from triage', exact: true}).count(), 1);
      await page.keyboard.press('Escape'); await waitFor(() => first.evaluate(x => x === document.activeElement), true);
      const note = page.getByLabel('Personal note for INC-000001 (up to 1000 characters)');
      await note.fill('draft'); const literal = '<b>retry & "quotes"</b>\n<script>literal text</script>';
      await note.fill(literal);
      await page.reload(); await ready(); await checkOverview({q: 'inc-000001'});
      assert.equal(await note.inputValue(), literal); assert.equal(await page.locator('#triage-list script, #triage-list b').count(), 0);
      const snapshot = await page.locator('#rows').textContent(), address = page.url();
      const reopen = page.getByRole('button', {name: 'Open triage incident INC-000001', exact: true});
      await reopen.focus(); await reopen.press('Enter'); await detailReady();
      assert.equal(await page.getByRole('button', {name: 'Add to triage', exact: true}).count(), 0);
      await page.keyboard.press('Escape'); await waitFor(() => reopen.evaluate(x => x === document.activeElement), true);
      assert.notEqual(await reopen.evaluate(x => getComputedStyle(x).outlineStyle), 'none');
      assert.equal(await page.locator('#rows').textContent(), snapshot); assert.equal(page.url(), address);
      await search('inc-000002'); await ready(); await page.locator('#rows button').first().click(); await detailReady();
      await page.getByRole('button', {name: 'Add to triage', exact: true}).click(); await page.keyboard.press('Escape');
      assert.deepEqual(await page.locator('#triage-list li').evaluateAll(items => items.map(x => x.dataset.incident)), ['INC-000001', 'INC-000002']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      for (const locator of [page.locator('.service-card').first(), note, page.getByRole('button', {name: 'Remove triage incident INC-000001', exact: true})]) {
        const box = await locator.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 375);
      }
      const remove = page.getByRole('button', {name: 'Remove triage incident INC-000001', exact: true}); await remove.focus(); await remove.press('Enter');
      assert.equal(await page.locator('#note-INC-000001').count(), 0);
      await page.reload(); await ready();
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).map(x => x.id), triageKey), ['INC-000002']);
      await page.getByRole('button', {name: 'Open triage incident INC-000002', exact: true}).click(); await detailReady();
      await page.getByRole('button', {name: 'Remove from triage', exact: true}).click(); await page.keyboard.press('Escape');
      await page.reload(); await ready(); assert.match(await page.locator('#triage-list').textContent(), /No incidents in triage/);
    });

    await t.test('malformed and unavailable browser storage keep exploration and visit notes usable', async () => {
      for (const mode of ['malformed', 'unavailable']) {
        const isolated = await browser.newContext();
        try {
          await isolated.addInitScript(({mode, key}) => {
            if (mode === 'malformed') localStorage.setItem(key, '{broken');
            else {
              Storage.prototype.getItem = () => {throw new Error('storage denied');};
              Storage.prototype.setItem = () => {throw new Error('storage denied');};
            }
          }, {mode, key: triageKey});
          const tab = await isolated.newPage(); tab.setDefaultTimeout(10000); await tab.goto(`${base}/?q=inc-000001`);
          await waitFor(() => tab.locator('#freshness').textContent(), 'Current selections');
          assert.match(await tab.locator('#triage-message').textContent(), /could not be read/);
          await tab.locator('#rows button').first().click(); await waitFor(() => tab.locator('#detail-content dd').count(), 11);
          await tab.getByRole('button', {name: 'Add to triage', exact: true}).click(); await tab.keyboard.press('Escape');
          await tab.locator('#note-INC-000001').fill('<text>still usable');
          assert.equal(await tab.locator('#note-INC-000001').inputValue(), '<text>still usable');
          if (mode === 'unavailable') assert.match(await tab.locator('#triage-message').textContent(), /remain usable for this visit/);
          await tab.getByRole('button', {name: 'Open triage incident INC-000001', exact: true}).click(); await waitFor(() => tab.locator('#detail-content dd').count(), 11);
          await tab.keyboard.press('Escape'); assert.equal(await tab.locator('#note-INC-000001').inputValue(), '<text>still usable');
          await tab.getByRole('button', {name: 'Remove triage incident INC-000001', exact: true}).click();
          assert.match(await tab.locator('#triage-list').textContent(), /No incidents in triage/);
        } finally {await isolated.close();}
      }
    });
    assert.deepEqual(errors, []);
  } finally {
    try {await context?.close();} finally {try {await browser?.close();} finally {await stop();}}
    assert.deepEqual(await readFile('.runtime/incidents.json'), before);
  }
});
