import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = resolve(process.env.DATA_FILE || resolve(root, 'data/db.json'));
const initialState = { devices: [], announcements: [], sentEvents: [], scheduleOverrides: {} };

function readState() {
  try {
    if (!existsSync(dbPath)) return structuredClone(initialState);
    return { ...initialState, ...JSON.parse(readFileSync(dbPath, 'utf8')) };
  } catch (error) {
    console.error('[store] failed to read db:', error.message);
    return structuredClone(initialState);
  }
}

function writeState(state) {
  mkdirSync(dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, `${JSON.stringify(state, null, 2)}\n`);
}

export function getState() { return readState(); }

export function updateState(mutator) {
  const state = readState();
  const updated = mutator(state) || state;
  writeState(updated);
  return updated;
}

export function upsertDevice(device) {
  return updateState((state) => {
    state.devices = state.devices.filter((item) => item.token !== device.token);
    state.devices.push({ ...device, updatedAt: new Date().toISOString() });
    return state;
  });
}

export function removeDevices(tokens) {
  const invalid = new Set(tokens);
  return updateState((state) => { state.devices = state.devices.filter((item) => !invalid.has(item.token)); return state; });
}

export function markEventSent(key) {
  return updateState((state) => {
    state.sentEvents = [...new Set([...state.sentEvents, key])].slice(-2000);
    return state;
  });
}

export function wasEventSent(key) { return readState().sentEvents.includes(key); }
