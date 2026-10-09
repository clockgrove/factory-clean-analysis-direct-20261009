import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, transition, isOverviewCurrent} from '../../public/state.js';
import {createTriage, triageKey} from '../../public/triage.js';

test('overview ownership follows filters and ignores pagination/sorting, including obsolete failure and cleanup', () => {
  let state = transition(createState(), {type: 'overview:start'});
  const old = state.overviewOp.token;
  state = transition(state, {type: 'overview:success', token: old, data: {services: []}});
  const snapshot = state.overview;
  state = transition(state, {type: 'intent', patch: {pageSize: 50, sort: 'severity'}});
  assert.equal(isOverviewCurrent(state), true);
  assert.equal(state.overview, snapshot);
  state = transition(state, {type: 'overview:start'});
  const superseded = state.overviewOp.token;
  state = transition(state, {type: 'intent', patch: {q: 'Search'}});
  state = transition(state, {type: 'overview:start'});
  for (const type of ['overview:success', 'overview:failure', 'overview:finish']) assert.equal(transition(state, {type, token: superseded, data: {}, error: 'old error'}), state);
  assert.equal(isOverviewCurrent(state), false);
  assert.equal(state.overview, snapshot);
  state = transition(state, {type: 'overview:failure', token: state.overviewOp.token, error: 'Current error'});
  assert.equal(state.overviewOp.error, 'Current error');
  state = transition(state, {type: 'overview:start'});
  state = transition(state, {type: 'overview:success', token: state.overviewOp.token, data: {services: []}});
  assert.equal(isOverviewCurrent(state), true);
});

const incident = {id: 'INC-000001', title: 'Example', service: 'Search', severity: 'high', status: 'open'};
test('triage order, duplicate addition, plain text notes and removal persist separately', () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  let triage = createTriage(storage);
  triage.add(incident); triage.note(incident.id, '<b> & "literal"\nline'); triage.add(incident);
  triage.add({...incident, id: 'INC-000002'});
  assert.equal(triage.entries.length, 2);
  triage = createTriage(storage);
  assert.deepEqual(triage.entries.map(x => x.id), ['INC-000001', 'INC-000002']);
  assert.equal(triage.entries[0].note, '<b> & "literal"\nline');
  assert.deepEqual([...values.keys()], [triageKey]);
  triage.remove(incident.id); triage.add(incident);
  assert.deepEqual(triage.entries.map(x => x.id), ['INC-000002', 'INC-000001']);
  assert.equal(triage.entries[1].note, '');
});

test('malformed or denied storage reports limits while keeping visit state after every mutation', () => {
  for (const raw of ['invalid JSON', '{}', '[null]', JSON.stringify([{...incident, note: 42}]), JSON.stringify([{...incident, note: ''}, {...incident, note: ''}])]) {
    const triage = createTriage({getItem: () => raw, setItem: () => {throw new Error('denied');}});
    assert.match(triage.message, /could not be read/);
    triage.add(incident); triage.note(incident.id, 'still here');
    assert.equal(triage.entries[0].note, 'still here'); assert.match(triage.message, /remain usable for this visit/);
    triage.remove(incident.id); assert.equal(triage.entries.length, 0);
  }
  const triage = createTriage({getItem: () => {throw new Error('denied');}, setItem: () => {throw new Error('denied');}});
  triage.add(incident); assert.equal(triage.has(incident.id), true);
});
