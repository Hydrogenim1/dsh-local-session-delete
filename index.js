/**
 * dsh-local-session-delete — Host half.
 *
 * Registers one same-origin route, `POST /dsh-local-session-delete/delete`,
 * which permanently removes a session's local records:
 *
 *   - archives it first, so the sidebar row disappears instead of dangling;
 *   - removes `$DSH_HOME/sessions/<workspace-key>/<sessionId>/`;
 *   - removes its projection cache `$DSH_HOME/storages/session_projcache/sessions/<id>.json`;
 *   - detaches the id from the owning Workspace record.
 *
 * Live sessions (open in this host process) are refused: their log file is
 * still being appended to and deleting it would resurrect an empty session.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODULE = '[dsh-local-session-delete]';
const ROUTE = '/dsh-local-session-delete/delete';
const SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 64 * 1024;

function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  return fromEnv && fromEnv.length > 0 ? fromEnv : path.join(os.homedir(), '.dsh');
}

function sessionsRoot() {
  return path.join(dshHome(), 'sessions');
}

function projectionCacheDir() {
  return path.join(dshHome(), 'storages', 'session_projcache', 'sessions');
}

function log(...args) {
  console.log(MODULE, ...args);
}

function fail(err) {
  console.error(MODULE, err && err.stack ? err.stack : err);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('request body too large');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

/**
 * Find the directory that stores one session. Sessions live under a key
 * derived from their workspace path, so scan instead of re-deriving the key.
 * @returns {Promise<string | undefined>} absolute directory, when exactly one exists.
 */
async function locateSessionDir(sessionId) {
  let entries;
  try {
    entries = await fs.readdir(sessionsRoot(), { withFileTypes: true });
  } catch {
    return undefined;
  }
  const hits = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(sessionsRoot(), entry.name, sessionId);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) hits.push(candidate);
    } catch {
      /* not in this workspace bucket */
    }
  }
  if (hits.length > 1) {
    log('ambiguous session directory for', sessionId, hits);
    throw new Error(`session ${sessionId} exists in ${hits.length} workspace buckets`);
  }
  return hits[0];
}

async function archiveSession(ctx, sessionId) {
  const registry = ctx.get('workspaceRegistry');
  if (registry === undefined || registry === null) return false;
  try {
    // `stopActivity` skips the activity refusal and stops whatever still runs
    // for this session; deletion is exactly the case that wants that.
    await registry.archiveSession(sessionId, { stopActivity: true });
    return true;
  } catch (err) {
    // Already archived, unknown to persistence, or a provider failed: the file
    // removal below is what the user asked for, so keep going.
    log('archive skipped for', sessionId, '-', err && err.message);
    return false;
  }
}

/**
 * Drop an id from the archived set. `unarchiveSession` resolves for an id whose
 * session is already gone, which is exactly the state deletion leaves behind.
 */
async function unarchive(ctx, sessionId) {
  const registry = ctx.get('workspaceRegistry');
  if (registry === undefined || registry === null) return;
  try {
    await registry.unarchiveSession(sessionId);
  } catch (err) {
    log('unarchive skipped for', sessionId, '-', err && err.message);
  }
}

/**
 * One-time repair for profiles written by older builds of this plugin: those
 * archived the session and then deleted it without clearing the archive flag,
 * leaving an archived id with no files and no workspace membership. Such an id
 * renders nothing, but pruning keeps the registry honest.
 */
async function pruneOrphanArchiveEntries(ctx) {
  const registry = ctx.get('workspaceRegistry');
  if (registry === undefined || registry === null) return;
  let archived;
  try {
    archived = [...registry.archivedSessionIds];
  } catch {
    return; // registry not initialized yet
  }
  if (archived.length === 0) return;

  const members = new Set();
  try {
    for (const workspace of registry.list()) {
      for (const id of workspace.sessionIds) members.add(id);
    }
  } catch {
    return;
  }

  for (const id of archived) {
    if (members.has(id)) continue; // a real archived session keeps its slot
    try {
      if ((await locateSessionDir(id)) !== undefined) continue;
      await registry.unarchiveSession(id);
      log('pruned orphan archive entry', id);
    } catch (err) {
      log('prune skipped for', id, '-', err && err.message);
    }
  }
}

async function detachFromWorkspaces(ctx, sessionId) {
  const registry = ctx.get('workspaceRegistry');
  if (registry === undefined || registry === null) return;
  let workspaces;
  try {
    workspaces = registry.list();
  } catch (err) {
    log('workspace list failed', err && err.message);
    return;
  }
  for (const workspace of workspaces) {
    try {
      if (!workspace.sessionIds.includes(sessionId)) continue;
      await workspace.detachSession(sessionId);
    } catch (err) {
      log('detach failed for', sessionId, err && err.message);
    }
  }
}

function isLive(ctx, sessionId) {
  const sessions = ctx.get('sessions');
  if (sessions === undefined || sessions === null) return false;
  try {
    if (typeof sessions.get === 'function') return sessions.get(sessionId) !== undefined;
    if (typeof sessions.has === 'function') return sessions.has(sessionId);
  } catch (err) {
    log('liveness probe failed', err && err.message);
  }
  return false;
}

async function handleDelete(ctx, req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' });
    res.end();
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { ok: false, code: 'bad-body', detail: String(err && err.message) });
    return;
  }

  const sessionId = body && body.sessionId;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
    sendJson(res, 400, { ok: false, code: 'bad-session-id' });
    return;
  }

  if (isLive(ctx, sessionId)) {
    sendJson(res, 409, { ok: false, code: 'live' });
    return;
  }

  let dir;
  try {
    dir = await locateSessionDir(sessionId);
  } catch (err) {
    sendJson(res, 500, { ok: false, code: 'ambiguous', detail: String(err && err.message) });
    return;
  }
  if (dir === undefined) {
    sendJson(res, 404, { ok: false, code: 'missing' });
    return;
  }

  // 1. Archive first: the sidebar row leaves the list even if the filesystem
  //    removal below fails, and the operation stays retryable from the
  //    "show archived" view.
  const archived = await archiveSession(ctx, sessionId);

  // 2. Remove the durable records.
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (err) {
    fail(err);
    sendJson(res, 500, { ok: false, code: 'rm-failed', detail: String(err && err.message) });
    return;
  }
  await fs.rm(path.join(projectionCacheDir(), sessionId + '.json'), { force: true }).catch((err) => {
    log('projection cache removal skipped', err && err.message);
  });

  // 3. Drop the id from the owning workspace's ordered membership and from the
  //    archived set, so nothing points at the removed session any more.
  await detachFromWorkspaces(ctx, sessionId);
  await unarchive(ctx, sessionId);

  log('deleted', sessionId);
  sendJson(res, 200, { ok: true, archived });
}

export default {
  name: 'dsh-local-session-delete',
  inject: ['webServer'],
  apply(ctx) {
    ctx.effect(
      () => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler: (req, res) => handleDelete(ctx, req, res) }),
      'local session delete: route',
    );
    log('host ready:', ROUTE);
    void pruneOrphanArchiveEntries(ctx).catch(fail);
  },
};
