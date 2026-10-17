import assert from 'node:assert/strict';
import test from 'node:test';
import { readWorkspaceTheme, saveWorkspaceTheme, workspaceThemeKey } from '../src/utils/workspaceTheme.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('light mode is the default and invalid preferences are ignored', () => {
  const storage = memoryStorage();
  assert.equal(readWorkspaceTheme('admin', storage), 'light');
  storage.setItem(workspaceThemeKey('admin'), 'invalid');
  assert.equal(readWorkspaceTheme('admin', storage), 'light');
});

test('preferences survive another read and can be switched back to light', () => {
  const storage = memoryStorage();
  saveWorkspaceTheme('admin', 'dark', storage);
  assert.equal(readWorkspaceTheme('admin', storage), 'dark');
  saveWorkspaceTheme('admin', 'light', storage);
  assert.equal(readWorkspaceTheme('admin', storage), 'light');
});

test('accounts do not share preferences on the same browser', () => {
  const storage = memoryStorage();
  saveWorkspaceTheme('resident', 'dark', storage);
  assert.equal(readWorkspaceTheme('guard', storage), 'light');
  assert.equal(readWorkspaceTheme('resident', storage), 'dark');
});

test('unsupported choices do not overwrite a saved preference', () => {
  const storage = memoryStorage();
  saveWorkspaceTheme('admin', 'dark', storage);
  saveWorkspaceTheme('admin', 'unsupported', storage);
  assert.equal(readWorkspaceTheme('admin', storage), 'dark');
});

test('blocked storage does not break switching or reading defaults', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readWorkspaceTheme('admin', storage), 'light');
  assert.doesNotThrow(() => saveWorkspaceTheme('admin', 'dark', storage));
});
