const listEl = document.getElementById('list');
const detailEl = document.getElementById('detail');

let items = [];
let activeId = null;
let view = 'overlay'; // 'original' | 'generated' | 'overlay'
let opacityOrig = 0.5;
let opacityGen = 0.5;

async function load() {
  const res = await fetch('/api/items');
  items = await res.json();
  renderList();
  if (activeId && items.some((i) => i.id === activeId)) {
    renderDetail(items.find((i) => i.id === activeId));
  } else if (items.length) {
    select(items[0].id);
  } else {
    detailEl.innerHTML = '<div class="empty">No draft items in <code>staging/</code>.<br />Run the converter, then reload.</div>';
  }
}

function renderList() {
  if (!items.length) {
    listEl.innerHTML = '<div class="empty">No items.</div>';
    return;
  }
  listEl.innerHTML = '';
  for (const it of items) {
    const btn = document.createElement('button');
    btn.className = 'item' + (it.id === activeId ? ' active' : '');
    const badgeClass = it.errors?.length ? 'error' : it.checkWarnings?.length || it.warnings?.length ? 'warn' : 'draft';
    const badgeText = it.errors?.length ? `${it.errors.length} err` : it.status ?? '?';
    btn.innerHTML = `${it.id} <span class="badge ${badgeClass}">${badgeText}</span>
      <div class="item-sub">${it.contacts ?? '?'} contacts${it.expectedContacts != null ? ` / ${it.expectedContacts} expected` : ''}</div>`;
    btn.onclick = () => select(it.id);
    listEl.appendChild(btn);
  }
}

function select(id) {
  activeId = id;
  renderList();
  renderDetail(items.find((i) => i.id === id));
}

function renderDetail(item) {
  if (!item) return;
  const familyDir = item.familyDir;
  const svgUrl = `/api/svg/${familyDir}/${item.id}`;
  const srcUrl = `/api/source/${familyDir}/${item.id}`;

  const issues = [
    ...item.errors.map((e) => ({ kind: 'error', text: e })),
    ...item.checkWarnings.map((w) => ({ kind: 'warn', text: w })),
    ...item.warnings.map((w) => ({ kind: 'warn', text: `converter: ${w}` })),
  ];

  detailEl.innerHTML = `
    <div class="header"><h1>${item.id}</h1><span class="meta">${item.family ?? ''} · ${item.contacts} contacts${item.expectedContacts != null ? ` / ${item.expectedContacts} expected` : ''}${item.confidence != null ? ` · confidence ${(item.confidence * 100).toFixed(0)}%` : ''}</span></div>
    <div class="issues">${
      issues.length
        ? issues.map((i) => `<div class="row ${i.kind}">${i.kind === 'error' ? '✕' : '⚠'} ${escapeHtml(i.text)}</div>`).join('')
        : '<div class="row" style="background:#12301b;color:#7ee08a;">no issues</div>'
    }</div>
    <div class="viewtabs">
      <button data-v="original" ${!item.hasSource ? 'disabled' : ''}>Original</button>
      <button data-v="generated">Generated SVG</button>
      <button data-v="overlay" ${!item.hasSource ? 'disabled' : ''}>Overlay</button>
    </div>
    <div id="opacity" class="opacity-controls" style="display:none">
      <label>Original <input id="opOrig" type="range" min="0" max="1" step="0.05" value="${opacityOrig}"></label>
      <label>Generated <input id="opGen" type="range" min="0" max="1" step="0.05" value="${opacityGen}"></label>
    </div>
    <div id="canvas" class="canvas-wrap"></div>
    <div class="actions">
      <button class="btn-approve" id="approveBtn" ${item.errors.length ? 'disabled title="fix errors first"' : ''}>Approve</button>
      <button class="btn-reject" id="rejectBtn">Reject</button>
    </div>
    <div class="status-msg" id="statusMsg"></div>
  `;

  const canvas = document.getElementById('canvas');
  const ratio = item.canvas ? item.canvas.height / item.canvas.width : 1;
  canvas.style.aspectRatio = item.canvas ? `${item.canvas.width} / ${item.canvas.height}` : '1 / 1';

  function draw() {
    if (view === 'original') {
      canvas.innerHTML = `<img src="${srcUrl}">`;
    } else if (view === 'generated') {
      canvas.innerHTML = `<object type="image/svg+xml" data="${svgUrl}"></object>`;
    } else {
      canvas.innerHTML = `
        <img class="layer" src="${srcUrl}" style="opacity:${opacityOrig}">
        <object class="layer" type="image/svg+xml" data="${svgUrl}" style="opacity:${opacityGen}; background:transparent"></object>`;
    }
    document.getElementById('opacity').style.display = view === 'overlay' ? 'flex' : 'none';
    for (const b of document.querySelectorAll('.viewtabs button')) b.classList.toggle('active', b.dataset.v === view);
  }

  for (const b of document.querySelectorAll('.viewtabs button')) {
    b.onclick = () => {
      if (b.disabled) return;
      view = b.dataset.v;
      draw();
    };
  }
  document.getElementById('opOrig').oninput = (e) => {
    opacityOrig = Number(e.target.value);
    draw();
  };
  document.getElementById('opGen').oninput = (e) => {
    opacityGen = Number(e.target.value);
    draw();
  };
  if (view !== 'overlay' && !item.hasSource) view = 'generated';
  draw();

  document.getElementById('approveBtn').onclick = () => act('approve', item);
  document.getElementById('rejectBtn').onclick = () => act('reject', item);
}

async function act(action, item) {
  const msg = document.getElementById('statusMsg');
  msg.textContent = `${action === 'approve' ? 'Approving' : 'Rejecting'}…`;
  const res = await fetch(`/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ familyDir: item.familyDir, id: item.id }),
  });
  const body = await res.json();
  if (!body.ok) {
    msg.innerHTML = (body.errors ?? [body.error ?? 'failed']).map((e) => `<div class="row error">${escapeHtml(e)}</div>`).join('');
    return;
  }
  activeId = null;
  await load();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

load();
setInterval(load, 15000);
