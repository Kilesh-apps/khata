// Khata → Google Sheets sync (script version 1).
// Paste this into Extensions → Apps Script, save, then Deploy → New deployment →
// Web app (Execute as: Me, Who has access: Anyone). Copy the web-app link (ends in /exec) into Khata.
// Updating the script later? Deploy → Manage deployments → ✏️ → Version: New version → Deploy (the link stays the same).
//
// What lands in the sheet:
//   - Readable tabs: spending entries, monthly totals, budgets, groups, fuel and service logs.
//     Never bank, wallet or cash balances; income only if you switched it on in Khata.
//   - One hidden tab with the full backup, encrypted on the phone with your PIN. This script can't read it.
// The first phone that connects becomes the only one allowed to write or read the backup (recovery code).

const TABS = ['Entries', 'Monthly', 'Budgets', 'Groups', 'Fuel', 'Service'];
const BACKUP_TAB = 'Backup (encrypted, do not edit)';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    const saved = props.getProperty('SECRET');
    if (!body.secret || String(body.secret).length < 24) return out({ ok: false, error: 'Missing recovery code.' });
    if (!saved) props.setProperty('SECRET', String(body.secret));
    else if (saved !== String(body.secret)) return out({ ok: false, error: 'This sheet is already linked to another phone. Use that phone\u2019s recovery code.' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    TABS.forEach(name => writeTab(ss, name, (body.tabs && body.tabs[name]) || []));
    if (body.backup) writeChunks(ss, BACKUP_TAB, 'Khata encrypted backup', String(body.backup));
    props.setProperty('LAST', new Date().toISOString());
    return out({ ok: true, v: 1, at: props.getProperty('LAST') });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('SECRET');
  if (!saved || p.secret !== saved) return out({ ok: false, error: 'Wrong recovery code for this sheet.', v: 1 });
  const backup = readChunks(SpreadsheetApp.getActiveSpreadsheet(), BACKUP_TAB);
  if (!backup) return out({ ok: false, error: 'No backup in this sheet yet.' });
  return out({ ok: true, backup: backup, at: props.getProperty('LAST'), v: 1 });
}

function writeChunks(ss, name, title, text) {
  const rows = [[title + ', saved ' + new Date().toISOString() + '. Do not edit.']];
  for (let i = 0; i < text.length; i += 45000) rows.push(['~' + text.slice(i, i + 45000)]); // a cell holds up to 50,000 characters
  writeTab(ss, name, rows, true);
  const sh = ss.getSheetByName(name);
  if (sh && !sh.isSheetHidden() && ss.getSheets().length > 1) sh.hideSheet();
}

function readChunks(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return '';
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).slice(1)).join('');
}

function writeTab(ss, name, rows, raw) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (!rows.length) return;
  const width = Math.max.apply(null, rows.map(r => r.length));
  const data = rows.map(r => {
    const x = r.slice();
    while (x.length < width) x.push('');
    // text starting with = + - @ would turn into a formula; keep it as plain text
    return x.map(v => (!raw && typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v);
  });
  const range = sh.getRange(1, 1, data.length, width);
  if (raw) range.setNumberFormat('@');
  range.setValues(data);
  if (!raw) {
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#2F6B4F').setFontColor('#FFFFFF');
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
