// Local-only Admin QA tool: Original | Generated SVG | Overlay -> Approve/Reject.
// No external deps; SVG is always rendered live from the draft JSON (source of truth),
// never trusted from a file the converter may or may not have written.
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSvg } from '../library/src/render.ts';
import { validateArrangement } from '../library/src/validate.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const STAGING = path.join(REPO_ROOT, 'staging');
const REJECTED = path.join(STAGING, 'rejected');
const LIBRARY = path.join(REPO_ROOT, 'library');
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT ? Number(process.env.PORT) : 4550;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listStagingFamilies() {
  if (!(await exists(STAGING))) return [];
  const entries = await readdir(STAGING, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && e.name !== 'rejected').map((e) => e.name);
}

async function listItems() {
  const families = await listStagingFamilies();
  const items = [];
  for (const familyDir of families) {
    const dir = path.join(STAGING, familyDir);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const jsonPath = path.join(dir, f);
      let data;
      try {
        data = JSON.parse(await readFile(jsonPath, 'utf8'));
      } catch (e) {
        items.push({ id: f.replace(/\.json$/, ''), familyDir, error: `invalid JSON: ${e.message}` });
        continue;
      }
      const sourcePath = path.join(dir, `${data.id}.source.png`);
      const check = validateArrangement(data, { production: false, fileId: data.id, familyDir });
      items.push({
        id: data.id,
        familyDir,
        family: data.family,
        title: data.title ?? data.id,
        status: data.status,
        contacts: data.contacts?.length ?? 0,
        expectedContacts: data.expectedContacts ?? null,
        confidence: data.qa?.confidence ?? null,
        warnings: data.qa?.warnings ?? [],
        errors: check.errors,
        checkWarnings: check.warnings,
        hasSource: await exists(sourcePath),
        canvas: data.canvas,
      });
    }
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

async function readArrangement(familyDir, id) {
  const jsonPath = path.join(STAGING, familyDir, `${id}.json`);
  return { jsonPath, data: JSON.parse(await readFile(jsonPath, 'utf8')) };
}

async function approve(familyDir, id) {
  const { data } = await readArrangement(familyDir, id);
  const today = new Date().toISOString().slice(0, 10);
  const approved = { ...data, status: 'approved', updatedAt: today, createdAt: data.createdAt ?? today };
  const svg = renderSvg(approved);
  const check = validateArrangement(approved, { production: true, fileId: approved.id, familyDir, svg });
  if (check.errors.length) return { ok: false, errors: check.errors };

  const outDir = path.join(LIBRARY, familyDir);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${id}.json`), JSON.stringify(approved, null, 2) + '\n');
  await writeFile(path.join(outDir, `${id}.svg`), svg);

  const stageDir = path.join(STAGING, familyDir);
  for (const ext of ['.json', '.svg', '.source.png']) {
    const p = path.join(stageDir, `${id}${ext}`);
    if (await exists(p)) await rm(p);
  }
  return { ok: true, warnings: check.warnings };
}

async function reject(familyDir, id) {
  const { data } = await readArrangement(familyDir, id);
  const rejected = { ...data, status: 'rejected', updatedAt: new Date().toISOString().slice(0, 10) };

  const outDir = path.join(REJECTED, familyDir);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${id}.json`), JSON.stringify(rejected, null, 2) + '\n');

  const stageDir = path.join(STAGING, familyDir);
  const srcPng = path.join(stageDir, `${id}.source.png`);
  if (await exists(srcPng)) await rename(srcPng, path.join(outDir, `${id}.source.png`));
  await rm(path.join(stageDir, `${id}.json`));
  const svgPath = path.join(stageDir, `${id}.svg`);
  if (await exists(svgPath)) await rm(svgPath);
  return { ok: true };
}

// Path segments end up in path.join() for reads and writes (approve/reject).
// GET routes take these from the URL, which the WHATWG URL parser normalizes
// against `..` segments -- but POST bodies (approve/reject) are raw JSON with no
// such protection, so validate everywhere rather than relying on that.
const FAMILY_DIR_RE = /^[a-z0-9-]{1,40}$/;
const ID_RE = /^[A-Za-z0-9]{1,20}$/;

function isSafeSegment(value, re) {
  return typeof value === 'string' && re.test(value);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

async function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(PUBLIC, rel);
  if (!filePath.startsWith(PUBLIC) || !(await exists(filePath))) {
    res.writeHead(404).end('not found');
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/items' && req.method === 'GET') {
      return send(res, 200, await listItems());
    }
    if (url.pathname.startsWith('/api/svg/') && req.method === 'GET') {
      const [, , , familyDir, id] = url.pathname.split('/');
      if (!isSafeSegment(familyDir, FAMILY_DIR_RE) || !isSafeSegment(id, ID_RE)) {
        return send(res, 400, { error: 'invalid familyDir or id' });
      }
      const { data } = await readArrangement(familyDir, id);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(renderSvg(data));
      return;
    }
    if (url.pathname.startsWith('/api/source/') && req.method === 'GET') {
      const [, , , familyDir, id] = url.pathname.split('/');
      if (!isSafeSegment(familyDir, FAMILY_DIR_RE) || !isSafeSegment(id, ID_RE)) {
        return send(res, 400, { error: 'invalid familyDir or id' });
      }
      const p = path.join(STAGING, familyDir, `${id}.source.png`);
      if (!(await exists(p))) return send(res, 404, { error: 'no source image' });
      res.writeHead(200, { 'Content-Type': 'image/png' });
      createReadStream(p).pipe(res);
      return;
    }
    if (url.pathname === '/api/approve' && req.method === 'POST') {
      const { familyDir, id } = await readBody(req);
      if (!isSafeSegment(familyDir, FAMILY_DIR_RE) || !isSafeSegment(id, ID_RE)) {
        return send(res, 400, { error: 'invalid familyDir or id' });
      }
      return send(res, 200, await approve(familyDir, id));
    }
    if (url.pathname === '/api/reject' && req.method === 'POST') {
      const { familyDir, id } = await readBody(req);
      if (!isSafeSegment(familyDir, FAMILY_DIR_RE) || !isSafeSegment(id, ID_RE)) {
        return send(res, 400, { error: 'invalid familyDir or id' });
      }
      return send(res, 200, await reject(familyDir, id));
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: String(e?.message ?? e) });
  }
});

// Bind to loopback only -- this is a single-admin local tool with unauthenticated
// approve/reject/file-read endpoints; it must not be reachable from the LAN.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`QA tool: http://localhost:${PORT}/  (staging: ${path.relative(REPO_ROOT, STAGING)})`);
});
