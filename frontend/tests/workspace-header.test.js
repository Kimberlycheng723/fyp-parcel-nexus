import assert from 'node:assert/strict';
import test from 'node:test';
import { workspacePageTitle, workspaceSearchConfig } from '../src/utils/workspaceHeader.js';

test('workspace titles are page names without category breadcrumbs', () => {
  for (const [path, title] of [['/dashboard', 'Dashboard'], ['/parcels', 'Parcels'], ['/parcels/new', 'Log New Parcel'], ['/analytics', 'Analytics and Reporting'], ['/accounts', 'Accounts'], ['/profile', 'Profile'], ['/parcel-trace', 'Parcel Trace'], ['/parcel-rooms', 'Parcel Rooms'], ['/audit-logs', 'Audit Trail'], ['/disputes/new', 'Raise a Dispute'], ['/disputes/11111111-1111-4111-8111-111111111111', 'Dispute Details']]) assert.equal(workspacePageTitle(path), title);
});

test('header search routes only to a role-appropriate destination', () => {
  for (const role of ['ADMIN', 'GUARD']) assert.equal(workspaceSearchConfig(role).path, '/parcels');
  assert.equal(workspaceSearchConfig('RESIDENT').path, '/dashboard');
  assert.equal(workspaceSearchConfig('SUPER_ADMIN').path, '/accounts');
  assert.equal(workspaceSearchConfig('UNKNOWN'), null);
});
