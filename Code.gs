// Khata → Google Sheets sync (script version 3).
//
// SET UP (once)
// 1. In your Google Sheet: Extensions → Apps Script (or create a project at script.google.com; the script
//    then creates a sheet called "Khata" on the first sync). Paste this whole file, Save.
// 2. GIVE DRIVE ACCESS: in the toolbar, pick the function "setUp" in the dropdown next to Run/Debug, press Run,
//    then Review permissions → your account → Advanced → Go to … (unsafe) → Allow. The log should end with
//    "Khata setup OK". (Deploying alone does NOT ask for the new Drive permission; the web app then fails with
//    "You do not have permission to call DriveApp.createFolder".)
// 3. Deploy → New deployment → type: Web app. Execute as: Me. Who has access: Anyone. Deploy.
// 4. Copy the Web app link (ends in /exec) into Khata → Settings → Google Sheet.
//
// UPDATING FROM AN OLDER VERSION
// Paste this file over the old one, Save, run setUp once (step 2 above; needed when new permissions are added),
// then Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
// The link stays the same. Saving alone is NOT enough: the old version keeps running until you deploy a new version.
//
// WHAT IS STORED
// - Drive folder "Khata backups": latest.json, plus one daily-YYYY-MM-DD.json per day (last 14 days) and one
//   monthly-YYYY-MM.json per month (last 12 months). Each holds your full backup, ENCRYPTED ON THE PHONE with your
//   PIN, and plain metadata: time, app version, entry count, SHA-256 of the encrypted backup. No amounts.
//   The daily and monthly copies are the FIRST good sync of that day or month and are never overwritten.
// - Drive folder "Khata photos": bill photos, each encrypted on the phone with your PIN.
// - Sheet tabs Entries, Monthly, Budgets, Groups, Fuel, Service: readable, never bank balances; income only if
//   you switched it on in Khata. "Backup log" tab: time, kind, version, entry count, hash. No amounts.
// - The first phone that connects locks everything with its recovery code.
// - A backup with far fewer entries than the latest one (more than 10% fewer, or zero) is refused unless the
//   phone sends force: true after you confirm on the phone.

const TABS = ['Entries', 'Monthly', 'Budgets', 'Groups', 'Fuel', 'Service'];
const LOG_TAB = 'Backup log';
const LEGACY_TAB = 'Backup (encrypted, do not edit)';
const BACKUP_FOLDER = 'Khata backups';
const PHOTO_FOLDER = 'Khata photos';
const KEEP_DAILY = 14, KEEP_MONTHLY = 12, SHRINK = 0.9, TZ = 'Asia/Kathmandu', VERSION = 3;

// Run this once from the editor (Run ▶ with "setUp" selected) to grant Sheets + Drive access and create the folders.
function setUp() {
  const b = folder(BACKUP_FOLDER), p = folder(PHOTO_FOLDER), ss = book();
  Logger.log('Khata setup OK. Backups folder: ' + b.getUrl() + ' Photos folder: ' + p.getUrl() + ' Sheet: ' + ss.getUrl());
}

function props() { return PropertiesService.getScriptProperties(); }

function book() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = props().getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create('Khata');
  props().setProperty('SHEET_ID', ss.getId());
  return ss;
}

function folder(name) {
  const key = 'FOLDER_' + name;
  const id = props().getProperty(key);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(name);
  f.setDescription('Made by the Khata sync script. Encrypted with your Khata PIN. Do not edit the files.');
  props().setProperty(key, f.getId());
  return f;
}

function sha256(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

function checkSecret(secret) {
  const saved = props().getProperty('SECRET');
  if (!secret || String(secret).length < 24) return 'Missing recovery code.';
  if (!saved) { props().setProperty('SECRET', String(secret)); return ''; }
  return saved === String(secret) ? '' : 'Wrong recovery code for this sheet. Use the code from the phone that set it up.';
}

function fileByName(dir, name) { const it = dir.getFilesByName(name); while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) return f; } return null; }

function snapshotList() {
  const dir = folder(BACKUP_FOLDER), out = [], it = dir.getFiles();
  while (it.hasNext()) {
    const f = it.next(), name = f.getName();
    if (f.isTrashed() || !/^(latest|daily-|monthly-|before-v3-)/.test(name)) continue;
    let meta = {};
    try { meta = JSON.parse(f.getDescription() || '{}'); } catch (e) {}
    out.push({ id: f.getId(), name: name, kind: name.split(/[-.]/)[0], time: meta.time || f.getLastUpdated().toISOString(),
      count: meta.count == null ? null : meta.count, version: meta.version || '', sha: meta.sha || '' });
  }
  const rank = { latest: 0, daily: 1, monthly: 2, before: 3 };
  return out.sort((a, b) => (rank[a.kind] - rank[b.kind]) || (a.time < b.time ? 1 : -1));
}

function writeSnapshot(dir, name, content, meta) {
  const old = fileByName(dir, name);
  const f = dir.createFile(name, content, MimeType.PLAIN_TEXT);  // write the new copy first ...
  f.setDescription(JSON.stringify(meta));
  if (old) old.setTrashed(true);                                 // ... and only then drop the old one
  return f;
}

function prune(dir) {
  const today = new Date(), it = dir.getFiles();
  const dayCut = Utilities.formatDate(new Date(today.getTime() - (KEEP_DAILY - 1) * 864e5), TZ, 'yyyy-MM-dd');
  const m = new Date(today.getFullYear(), today.getMonth() - (KEEP_MONTHLY - 1), 1);
  const monthCut = Utilities.formatDate(m, TZ, 'yyyy-MM');
  while (it.hasNext()) {
    const f = it.next(), n = f.getName();
    let x;
    if ((x = /^daily-(\d{4}-\d{2}-\d{2})\.json$/.exec(n)) && x[1] < dayCut) f.setTrashed(true);
    if ((x = /^monthly-(\d{4}-\d{2})\.json$/.exec(n)) && x[1] < monthCut) f.setTrashed(true);
  }
}

function writeLog(ss) {
  const rows = [['Time (Nepal)', 'Kind', 'App version', 'Entries', 'SHA-256 of encrypted backup', 'File']]
    .concat(snapshotList().map(s => [Utilities.formatDate(new Date(s.time), TZ, 'yyyy-MM-dd HH:mm'), s.kind, s.version, s.count == null ? '' : s.count, s.sha, s.name]));
  writeTab(ss, LOG_TAB, rows);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const body = JSON.parse(e.postData.contents);
    const bad = checkSecret(body.secret);
    if (bad) return out({ ok: false, error: bad, v: VERSION });
    const action = body.action || 'sync';
    if (action === 'photo-put') return out(photoPut(body));
    if (action === 'photo-prune') return out(photoPrune(body));
    if (action !== 'sync') return out({ ok: false, error: 'Unknown action.' });

    const ss = book(), p = props(), dir = folder(BACKUP_FOLDER);
    const backup = String(body.backup || '');
    if (!backup) return out({ ok: false, error: 'Empty backup.' });
    const sha = sha256(backup);
    if (body.sha && body.sha !== sha) return out({ ok: false, error: 'The backup was damaged on the way. Try again.' });
    const last = JSON.parse(p.getProperty('LATEST_META') || 'null');
    const count = body.count == null ? null : Number(body.count);

    // Shrink guard: never let a much smaller backup replace a good one without an explicit force.
    if (last && last.count > 0 && count != null && !body.force && (count === 0 || count < last.count * SHRINK)) {
      return out({ ok: false, code: 'shrink', last: last.count, sent: count, at: last.time, v: VERSION,
        error: 'This backup has far fewer entries (' + count + ') than the last one (' + last.count + '). Not saved.' });
    }

    // First run of version 3: keep the old single-tab backup as a file before anything else.
    if (!last) {
      const legacy = readChunks(ss, LEGACY_TAB);
      if (legacy && !fileByName(dir, 'before-v3-' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + '.json')) {
        writeSnapshot(dir, 'before-v3-' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + '.json',
          JSON.stringify({ meta: { time: p.getProperty('LAST') || new Date().toISOString(), version: 'before v3', count: null, sha: sha256(legacy) }, backup: legacy }),
          { time: p.getProperty('LAST') || new Date().toISOString(), version: 'before v3', count: null, sha: sha256(legacy) });
      }
    }

    const now = new Date();
    const meta = { time: now.toISOString(), version: String(body.version || ''), count: count, sha: sha };
    const content = JSON.stringify({ meta: meta, backup: backup });
    writeSnapshot(dir, 'latest.json', content, meta);
    const day = 'daily-' + Utilities.formatDate(now, TZ, 'yyyy-MM-dd') + '.json';
    const month = 'monthly-' + Utilities.formatDate(now, TZ, 'yyyy-MM') + '.json';
    if (!fileByName(dir, day)) writeSnapshot(dir, day, content, meta);      // first good sync of the day, kept as is
    if (!fileByName(dir, month)) writeSnapshot(dir, month, content, meta);  // first good sync of the month, kept as is
    prune(dir);
    p.setProperty('LATEST_META', JSON.stringify(meta));
    p.setProperty('LAST', meta.time);

    // Readable tabs only after the backup is safely stored.
    TABS.forEach(name => writeTab(ss, name, (body.tabs && body.tabs[name]) || []));
    writeLog(ss);
    const blank = ss.getSheetByName('Sheet1');
    if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
    return out({ ok: true, v: VERSION, at: meta.time, count: count, sha: sha, sheet: ss.getUrl() });
  } catch (err) {
    return out({ ok: false, error: String(err), v: VERSION });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const q = (e && e.parameter) || {};
  if (!q.secret) return out({ ok: true, running: true, v: VERSION, message: 'Khata sync script (version ' + VERSION + ') is running. Paste this link into Khata.' });
  const bad = checkSecret(q.secret);
  if (bad) return out({ ok: false, error: bad, v: VERSION });
  const dir = folder(BACKUP_FOLDER);
  if (q.action === 'list') return out({ ok: true, v: VERSION, snapshots: snapshotList().map(s => ({ id: s.id, name: s.name, kind: s.kind, time: s.time, count: s.count, version: s.version })) });
  if (q.action === 'photos') return out({ ok: true, v: VERSION, ids: photoIds() });
  if (q.action === 'photo') return out(photoGet(q.id));
  let f = null;
  if (q.id) { try { f = DriveApp.getFileById(q.id); } catch (err) {} if (f && !inFolder(f, dir)) f = null; }
  else f = fileByName(dir, 'latest.json');
  if (!f) {
    const legacy = readChunks(book(), LEGACY_TAB);  // version 1 and 2 kept the backup in a hidden tab
    if (legacy && !q.id) return out({ ok: true, v: VERSION, backup: legacy, meta: { time: props().getProperty('LAST'), count: null, sha: sha256(legacy) } });
    return out({ ok: false, error: q.id ? 'That backup no longer exists.' : 'No backup in this sheet yet.' });
  }
  const j = JSON.parse(f.getBlob().getDataAsString());
  return out({ ok: true, v: VERSION, backup: j.backup, meta: j.meta, name: f.getName() });
}

function inFolder(file, dir) { const it = file.getParents(); while (it.hasNext()) if (it.next().getId() === dir.getId()) return true; return false; }

// ---- bill photos: each file holds {salt, iv, ct}, encrypted on the phone ----
function photoIds() {
  const it = folder(PHOTO_FOLDER).getFiles(), ids = [];
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed() && /\.bin$/.test(f.getName())) ids.push(f.getName().slice(0, -4)); }
  return ids;
}
function photoPut(body) {
  const dir = folder(PHOTO_FOLDER), saved = [];
  (body.photos || []).slice(0, 20).forEach(ph => {
    if (!/^[\w-]{3,64}$/.test(ph.id || '') || typeof ph.data !== 'string' || ph.data.length > 4e6) return;
    const old = fileByName(dir, ph.id + '.bin');
    dir.createFile(ph.id + '.bin', ph.data, MimeType.PLAIN_TEXT);
    if (old) old.setTrashed(true);
    saved.push(ph.id);
  });
  return { ok: true, saved: saved, v: VERSION };
}
function photoGet(id) {
  if (!/^[\w-]{3,64}$/.test(id || '')) return { ok: false, error: 'Bad photo id.' };
  const f = fileByName(folder(PHOTO_FOLDER), id + '.bin');
  return f ? { ok: true, id: id, data: f.getBlob().getDataAsString() } : { ok: false, error: 'Photo not found.' };
}
function photoPrune(body) {
  const keep = new Set(body.keep || []);
  if (!keep.size) return { ok: false, error: 'Refusing to delete every photo.' };
  const it = folder(PHOTO_FOLDER).getFiles(); let n = 0;
  while (it.hasNext()) { const f = it.next(), id = f.getName().replace(/\.bin$/, ''); if (!f.isTrashed() && !keep.has(id)) { f.setTrashed(true); n++; } }
  return { ok: true, removed: n, v: VERSION };
}

// ---- sheet helpers ----
function readChunks(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return '';
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).slice(1)).join('');
}

function writeTab(ss, name, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (!rows.length) return;
  const width = Math.max.apply(null, rows.map(r => r.length));
  const data = rows.map(r => {
    const x = r.slice();
    while (x.length < width) x.push('');
    // text starting with = + - @ would turn into a formula; keep it as plain text
    return x.map(v => (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v);
  });
  sh.getRange(1, 1, data.length, width).setValues(data);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#2F6B4F').setFontColor('#FFFFFF');
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
