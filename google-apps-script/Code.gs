const SHEET_NAME = 'Wishlists';
const ROSTER_SHEET_NAME = 'RosterPriority';
const SIMC_SHEET_NAME = 'SimcSnapshots';
const QE_SHEET_NAME = 'QeReports';
const QE_QUEUE_SHEET_NAME = 'QeQueue';
const SPREADSHEET_ID = '1y7cgwp_m_aPDznRz7kwS-G1IPlvZWz3vXwilLmBNCKU';
const HEADERS = ['characterId', 'characterName', 'characterClass', 'lootSpec', 'wishlistJson', 'updatedAt', 'version'];
const ROSTER_HEADERS = ['characterId', 'characterName', 'status', 'updatedAt'];
const SIMC_HEADERS = ['characterId', 'characterName', 'lootSpec', 'snapshotJson', 'capturedAt', 'updatedAt', 'version'];
const QE_HEADERS = ['characterId', 'characterName', 'lootSpec', 'reportId', 'reportJson', 'capturedAt', 'updatedAt'];
const QE_QUEUE_HEADERS = ['characterId', 'characterName', 'lootSpec', 'simc', 'requestedAt', 'state', 'error'];
const OFFICER_HASH_PROPERTY = 'OFFICER_PASSPHRASE_HASH';
const OFFICER_SESSION_SECONDS = 21600;
const WOWAUDIT_API_KEY_PROPERTY = 'WOWAUDIT_API_KEY';
// Optional. Set GITHUB_DISPATCH_TOKEN and GITHUB_REPO ("owner/name") in Script
// Properties to start a QE run the moment a healer pastes, instead of waiting
// for the 15-minute schedule.
//
// The fine-grained PAT needs "Contents: read and write" - confirmed against the
// permissions GitHub publishes for POST /repos/{owner}/{repo}/dispatches. Not
// "Actions", which is the obvious guess and silently returns 403, which
// triggerQeSync_ reports as a plain dispatched:false.
const GITHUB_TOKEN_PROPERTY = 'GITHUB_DISPATCH_TOKEN';
const GITHUB_REPO_PROPERTY = 'GITHUB_REPO';
const RAIDBOTS_SUBMIT_URL = 'https://www.raidbots.com/sim';
const RAIDBOTS_REPORT_URL = 'https://www.raidbots.com/reports/';

function doGet() {
  try {
    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues().slice(1);
    const wishlists = rows.filter(row => row[0] !== '').map(row => ({
      characterId: Number(row[0]), characterName: String(row[1] || ''), characterClass: String(row[2] || ''),
      lootSpec: String(row[3] || ''), wishlist: JSON.parse(String(row[4] || '[]')),
      updatedAt: String(row[5] || ''), version: Number(row[6] || 1),
    }));
    return json_({ ok: true, wishlists, rosterStatuses: getRosterStatuses_(), simcSnapshots: getSimcSnapshots_(), qeReports: getQeReports_(), qeQueue: getQeQueue_() });
  } catch (error) { return json_({ ok: false, error: String(error.message || error) }); }
}

function doPost(event) {
  try {
    const body = JSON.parse(event.postData && event.postData.contents || '{}');
    if (body.action === 'officerLogin') return officerLogin_(body);
    if (body.action === 'officerVerify') return json_({ ok: true, authorized: officerAuthorized_(body.token) });
    if (body.action === 'setRosterStatus') return setRosterStatus_(body);
    if (body.action === 'submitDroptimizer') return submitDroptimizer_(body);
    if (body.action === 'checkDroptimizer') return checkDroptimizer_(body);
    if (body.action === 'getWowauditSims') return getWowauditSims_();
    if (body.action === 'saveSimcSnapshot') return saveSimcSnapshot_(body);
    if (body.action === 'saveQeReport') return saveQeReport_(body);
    if (body.action === 'queueQeRun') return queueQeRun_(body);
    if (body.action === 'getQePending') return json_({ ok: true, pending: getQePending_() });
    if (body.action === 'setQeQueueState') return setQeQueueState_(body);
    return saveWishlist_(body);
  } catch (error) { return json_({ ok: false, error: String(error.message || error) }); }
}

function getWowauditSims_() {
  const apiKey = PropertiesService.getScriptProperties().getProperty(WOWAUDIT_API_KEY_PROPERTY);
  if (!apiKey) throw new Error('WoWAudit API access has not been configured in Apps Script.');
  const response = UrlFetchApp.fetch('https://wowaudit.com/v1/wishlists', {
    method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
  });
  const status = response.getResponseCode(), result = parseJson_(response.getContentText());
  if (status < 200 || status >= 300) throw new Error('WoWAudit refresh failed (' + status + ').');
  return json_({ ok: true, sims: result });
}

function submitDroptimizer_(body) {
  const payload = body.payload;
  if (!payload || payload.type !== 'droptimizer') throw new Error('A Droptimizer payload is required.');
  if (!payload.text || String(payload.text).length < 100) throw new Error('Paste the complete /simc export.');
  if (!Number.isFinite(Number(body.characterId))) throw new Error('A valid characterId is required.');
  const submitId = Utilities.getUuid();
  const response = UrlFetchApp.fetch(RAIDBOTS_SUBMIT_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Raidbots-Submit-Id': submitId }, payload: JSON.stringify(payload),
  });
  const status = response.getResponseCode(), result = parseJson_(response.getContentText());
  if (status < 200 || status >= 300 || !result.simId) {
    throw new Error('Raidbots submission failed (' + status + '): ' + String(result.error || result.message || response.getContentText()).slice(0, 240));
  }
  return json_({ ok: true, jobId: String(result.jobId || ''), simId: String(result.simId), reportUrl: 'https://www.raidbots.com/simbot/report/' + result.simId });
}

function checkDroptimizer_(body) {
  const simId = String(body.simId || '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(simId)) throw new Error('A valid Raidbots simId is required.');
  if (!body.reportReady) {
    const reportResponse = UrlFetchApp.fetch(RAIDBOTS_REPORT_URL + encodeURIComponent(simId) + '/data.json', { muteHttpExceptions: true });
    if (reportResponse.getResponseCode() === 404) return json_({ ok: true, state: 'running', simId: simId });
    if (reportResponse.getResponseCode() !== 200) throw new Error('Raidbots status check failed (' + reportResponse.getResponseCode() + ').');
    const report = parseJson_(reportResponse.getContentText());
    if (report.error || report.errors || report.meta && report.meta.error) {
      return json_({ ok: true, state: 'failed', simId: simId, error: String(report.error || report.meta && report.meta.error || 'Simulation failed') });
    }
  }
  if (!body.upload) return json_({ ok: true, state: 'complete', simId: simId });
  const apiKey = PropertiesService.getScriptProperties().getProperty(WOWAUDIT_API_KEY_PROPERTY);
  if (!apiKey) throw new Error('WoWAudit API access has not been configured in Apps Script.');
  const uploadPayload = {
    report_id: simId,
    character_id: Number(body.characterId),
    character_name: String(body.characterName || '').slice(0, 80),
    configuration_name: String(body.configurationName || 'Single Target').slice(0, 80),
    replace_manual_edits: Boolean(body.replaceManualEdits),
  };
  const uploadResponse = UrlFetchApp.fetch('https://wowaudit.com/v1/wishlists', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + apiKey }, payload: JSON.stringify(uploadPayload),
  });
  const uploadStatus = uploadResponse.getResponseCode(), uploadResult = parseJson_(uploadResponse.getContentText());
  if (uploadStatus < 200 || uploadStatus >= 300) {
    throw new Error('WoWAudit upload failed (' + uploadStatus + '): ' + String(uploadResult.error || uploadResult.message || uploadResponse.getContentText()).slice(0, 240));
  }
  if (uploadResult.created === false) {
    const details = Array.isArray(uploadResult.base) ? uploadResult.base.join('; ') : (uploadResult.error || uploadResult.message || 'WoWAudit rejected the report.');
    throw new Error(String(details).slice(0, 240));
  }
  return json_({ ok: true, state: 'uploaded', simId: simId, reportUrl: 'https://www.raidbots.com/simbot/report/' + simId });
}

function parseJson_(text) {
  try { return JSON.parse(String(text || '{}')); }
  catch (error) { return { message: String(text || 'Invalid JSON response') }; }
}

function officerLogin_(body) {
  const configured = PropertiesService.getScriptProperties().getProperty(OFFICER_HASH_PROPERTY);
  if (!configured) throw new Error('Officer access has not been configured.');
  if (!body.passphrase || hash_(String(body.passphrase)) !== configured) {
    Utilities.sleep(600);
    throw new Error('Incorrect officer passphrase.');
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('officer:' + token, '1', OFFICER_SESSION_SECONDS);
  return json_({ ok: true, token: token, expiresIn: OFFICER_SESSION_SECONDS });
}

function officerAuthorized_(token) {
  if (!token) return false;
  const cache = CacheService.getScriptCache();
  const key = 'officer:' + String(token);
  if (cache.get(key) !== '1') return false;
  cache.put(key, '1', OFFICER_SESSION_SECONDS);
  return true;
}

function setRosterStatus_(body) {
  if (!officerAuthorized_(body.token)) throw new Error('Officer session expired. Sign in again.');
  const id = Number(body.characterId), status = String(body.status || '');
  if (!Number.isFinite(id)) throw new Error('A valid characterId is required.');
  if (!['Main', 'Trial', 'Fill'].includes(status)) throw new Error('Invalid roster status.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getRosterSheet_(), values = sheet.getDataRange().getValues();
    let row = values.findIndex((value, index) => index > 0 && Number(value[0]) === id) + 1;
    if (!row) row = sheet.getLastRow() + 1;
    const updatedAt = new Date().toISOString();
    sheet.getRange(row, 1, 1, ROSTER_HEADERS.length).setValues([[
      id, String(body.characterName || '').slice(0, 80), status, updatedAt,
    ]]);
    return json_({ ok: true, characterId: id, status, updatedAt });
  } finally { lock.releaseLock(); }
}

function saveWishlist_(body) {
  if (!Number.isFinite(Number(body.characterId))) throw new Error('A valid characterId is required.');
  if (!body.characterName || !body.characterClass || !body.lootSpec) throw new Error('Character identity and lootSpec are required.');
  if (!Array.isArray(body.wishlist) || body.wishlist.length < 1) throw new Error('Wishlist must contain items.');
  const sheet = getSheet_(), id = Number(body.characterId), values = sheet.getDataRange().getValues();
  let row = values.findIndex((value, index) => index > 0 && Number(value[0]) === id) + 1;
  if (!row) row = sheet.getLastRow() + 1;
  const updatedAt = new Date().toISOString();
  sheet.getRange(row, 1, 1, HEADERS.length).setValues([[
    id, String(body.characterName).slice(0, 80), String(body.characterClass).slice(0, 40),
    String(body.lootSpec).slice(0, 80), JSON.stringify(body.wishlist), updatedAt, Number(body.version || 1),
  ]]);
  return json_({ ok: true, characterId: id, updatedAt });
}

function saveSimcSnapshot_(body) {
  const id = Number(body.characterId), snapshot = body.snapshot;
  if (!Number.isFinite(id)) throw new Error('A valid characterId is required.');
  if (!body.characterName || !body.lootSpec || !snapshot || typeof snapshot !== 'object') throw new Error('Character identity, lootSpec, and snapshot are required.');
  const compact = {
    character: String(snapshot.character || '').slice(0, 80),
    spec: String(snapshot.spec || '').slice(0, 80),
    lootSpec: String(snapshot.lootSpec || '').slice(0, 80),
    capturedAt: String(snapshot.capturedAt || new Date().toISOString()).slice(0, 40),
    bags: Array.isArray(snapshot.bags) ? snapshot.bags.slice(0, 50) : [],
    vault: Array.isArray(snapshot.vault) ? snapshot.vault.slice(0, 20) : [],
    catalystCurrencies: snapshot.catalystCurrencies || {},
    upgradeCurrencies: snapshot.upgradeCurrencies || {},
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSimcSheet_(), values = sheet.getDataRange().getValues();
    let row = values.findIndex((value, index) => index > 0 && Number(value[0]) === id) + 1;
    if (row) {
      try {
        const previous = JSON.parse(String(values[row - 1][3] || '{}'));
        compact.previousCatalystCurrencies = previous.catalystCurrencies || {};
        compact.previousCapturedAt = String(previous.capturedAt || '');
      } catch (error) { /* a damaged previous snapshot should not block a new one */ }
    }
    if (!row) row = sheet.getLastRow() + 1;
    const encoded = JSON.stringify(compact);
    if (encoded.length > 45000) throw new Error('The SimC snapshot is too large to store.');
    const updatedAt = new Date().toISOString();
    sheet.getRange(row, 1, 1, SIMC_HEADERS.length).setValues([[
      id, String(body.characterName).slice(0, 80), String(body.lootSpec).slice(0, 80),
      encoded, compact.capturedAt, updatedAt, 1,
    ]]);
    return json_({ ok: true, characterId: id, snapshot: compact, updatedAt });
  } finally { lock.releaseLock(); }
}

// Only the three known difficulties, and only id-shaped values - these end up
// in an href on the board.
function sanitiseReportIds_(value) {
  var clean = {};
  if (!value || typeof value !== 'object') return clean;
  ['normal', 'heroic', 'mythic'].forEach(function (difficulty) {
    var id = String(value[difficulty] || '');
    if (/^[A-Za-z0-9_-]{6,40}$/.test(id)) clean[difficulty] = id;
  });
  return clean;
}

// QE Live reports are fetched and parsed in the browser (their API is CORS
// open), so this only has to store the summary the board reads back.
function saveQeReport_(body) {
  const id = Number(body.characterId), report = body.report;
  if (!Number.isFinite(id)) throw new Error('A valid characterId is required.');
  if (!body.characterName || !report || typeof report !== 'object') throw new Error('Character identity and a QE report are required.');
  if (!report.difficulties || typeof report.difficulties !== 'object') throw new Error('The QE report has no raid difficulties.');
  var compact = {
    id: String(report.id || '').slice(0, 40),
    character: String(report.character || '').slice(0, 80),
    realm: String(report.realm || '').slice(0, 60),
    region: String(report.region || '').slice(0, 8),
    spec: String(report.spec || '').slice(0, 80),
    contentType: String(report.contentType || '').slice(0, 40),
    capturedAt: String(report.capturedAt || new Date().toISOString()).slice(0, 40),
    difficulties: report.difficulties,
    // QE writes one report per difficulty, so `id` alone only names the last of
    // the three. Keep them all so each score can link back to its own run.
    reportIds: sanitiseReportIds_(report.reportIds),
  };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getQeSheet_(), values = sheet.getDataRange().getValues();
    var row = values.findIndex(function (value, index) { return index > 0 && Number(value[0]) === id; }) + 1;
    if (row) {
      // Merge, so running Heroic later does not erase this week's Normal.
      try {
        var previous = JSON.parse(String(values[row - 1][4] || '{}'));
        if (previous && previous.difficulties && previous.capturedAt && !expiredAtReset_(previous.capturedAt)) {
          var merged = {};
          Object.keys(previous.difficulties).forEach(function (k) { merged[k] = previous.difficulties[k]; });
          Object.keys(compact.difficulties).forEach(function (k) { merged[k] = compact.difficulties[k]; });
          compact.difficulties = merged;
        }
      } catch (error) { /* a damaged previous report must not block a new one */ }
    }
    if (!row) row = sheet.getLastRow() + 1;
    var encoded = JSON.stringify(compact);
    if (encoded.length > 45000) throw new Error('The QE report is too large to store.');
    var updatedAt = new Date().toISOString();
    sheet.getRange(row, 1, 1, QE_HEADERS.length).setValues([[
      id, String(body.characterName).slice(0, 80), String(body.lootSpec || '').slice(0, 80),
      compact.id, encoded, compact.capturedAt, updatedAt,
    ]]);
    try { setQeQueueState_({ characterId: id, state: 'done' }); } catch (error) { /* not every save came from the queue */ }
    return json_({ ok: true, characterId: id, report: compact, updatedAt });
  } finally { lock.releaseLock(); }
}

// NA weekly reset, Tuesday 15:00 UTC - mirrors src/raid-week.js.
function expiredAtReset_(iso) {
  var parsed = Date.parse(iso);
  if (!isFinite(parsed)) return true;
  var now = new Date();
  var reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 0, 0, 0));
  reset.setUTCDate(reset.getUTCDate() - ((reset.getUTCDay() - 2 + 7) % 7));
  if (reset > now) reset.setUTCDate(reset.getUTCDate() - 7);
  return parsed < reset.getTime();
}

// The board cannot run a browser, so a healer's /simc is parked here and a
// worker (scripts/qe-sync.js, or the scheduled action) drains it.
function queueQeRun_(body) {
  var id = Number(body.characterId);
  if (!Number.isFinite(id)) throw new Error('A valid characterId is required.');
  if (!body.characterName || !body.lootSpec) throw new Error('Character identity and lootSpec are required.');
  var simc = String(body.simc || '');
  if (simc.length < 100) throw new Error('A complete /simc export is required.');
  if (simc.length > 45000) throw new Error('That /simc export is too large to queue.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getQeQueueSheet_(), values = sheet.getDataRange().getValues();
    var row = values.findIndex(function (value, index) { return index > 0 && Number(value[0]) === id; }) + 1;
    if (!row) row = sheet.getLastRow() + 1;
    var requestedAt = new Date().toISOString();
    sheet.getRange(row, 1, 1, QE_QUEUE_HEADERS.length).setValues([[
      id, String(body.characterName).slice(0, 80), String(body.lootSpec).slice(0, 80),
      simc, requestedAt, 'pending', '',
    ]]);
    var dispatched = triggerQeSync_();
    return json_({ ok: true, characterId: id, requestedAt: requestedAt, state: 'pending', dispatched: dispatched });
  } finally { lock.releaseLock(); }
}

// Kick the workflow now. A failure here is not fatal - the schedule still
// catches the job - so never let it break the paste.
function triggerQeSync_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(GITHUB_TOKEN_PROPERTY), repo = props.getProperty(GITHUB_REPO_PROPERTY);
  if (!token || !repo) return false;
  try {
    var response = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/dispatches', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      payload: JSON.stringify({ event_type: 'qe-sync' }),
    });
    return response.getResponseCode() === 204;
  } catch (error) { return false; }
}

function setQeQueueState_(body) {
  var id = Number(body.characterId);
  if (!Number.isFinite(id)) throw new Error('A valid characterId is required.');
  var state = String(body.state || '');
  if (['pending', 'running', 'done', 'error'].indexOf(state) < 0) throw new Error('Unknown queue state.');
  var sheet = getQeQueueSheet_(), values = sheet.getDataRange().getValues();
  var row = values.findIndex(function (value, index) { return index > 0 && Number(value[0]) === id; }) + 1;
  if (!row) throw new Error('That character is not queued.');
  sheet.getRange(row, 6, 1, 2).setValues([[state, String(body.error || '').slice(0, 300)]]);
  return json_({ ok: true, characterId: id, state: state });
}

// The queue is public like everything else here, but the /simc body is only
// useful to a worker, so keep it out of the payload the board loads.
function getQeQueue_() {
  return getQeQueueSheet_().getDataRange().getValues().slice(1).reduce(function (result, row) {
    if (row[0] === '') return result;
    result[String(Number(row[0]))] = {
      characterName: String(row[1] || ''), lootSpec: String(row[2] || ''),
      requestedAt: String(row[4] || ''), state: String(row[5] || ''), error: String(row[6] || ''),
    };
    return result;
  }, {});
}

// Worker-only: includes the /simc bodies still waiting to run.
function getQePending_() {
  return getQeQueueSheet_().getDataRange().getValues().slice(1).reduce(function (result, row) {
    if (row[0] === '' || String(row[5]) === 'done') return result;
    result.push({
      characterId: Number(row[0]), characterName: String(row[1] || ''), lootSpec: String(row[2] || ''),
      simc: String(row[3] || ''), requestedAt: String(row[4] || ''), state: String(row[5] || ''),
    });
    return result;
  }, []);
}

function getQeReports_() {
  return getQeSheet_().getDataRange().getValues().slice(1).reduce(function (result, row) {
    if (row[0] === '') return result;
    try { result[String(Number(row[0]))] = JSON.parse(String(row[4] || '{}')); } catch (error) { /* skip damaged rows */ }
    return result;
  }, {});
}

function getSimcSnapshots_() {
  return getSimcSheet_().getDataRange().getValues().slice(1).reduce((result, row) => {
    if (row[0] === '') return result;
    try { result[String(Number(row[0]))] = JSON.parse(String(row[3] || '{}')); } catch (error) { /* skip damaged rows */ }
    return result;
  }, {});
}

function getRosterStatuses_() {
  return getRosterSheet_().getDataRange().getValues().slice(1).reduce((result, row) => {
    if (row[0] !== '' && ['Main', 'Trial', 'Fill'].includes(String(row[2]))) result[String(Number(row[0]))] = String(row[2]);
    return result;
  }, {});
}

function getSheet_() { return getOrCreateSheet_(SHEET_NAME, HEADERS); }
function getRosterSheet_() { return getOrCreateSheet_(ROSTER_SHEET_NAME, ROSTER_HEADERS); }
function getSimcSheet_() { return getOrCreateSheet_(SIMC_SHEET_NAME, SIMC_HEADERS); }
function getQeSheet_() { return getOrCreateSheet_(QE_SHEET_NAME, QE_HEADERS); }
function getQeQueueSheet_() { return getOrCreateSheet_(QE_QUEUE_SHEET_NAME, QE_QUEUE_HEADERS); }
function getOrCreateSheet_(name, headers) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function hash_(value) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return digest.map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

// Run once in Apps Script, then remove the temporary plain text and save again.
function configureOfficerPassphrase() {
  const PASSPHRASE = 'REPLACE WITH A STRONG OFFICER PASSPHRASE';
  if (PASSPHRASE.indexOf('REPLACE WITH') === 0) throw new Error('Replace PASSPHRASE before running this function.');
  PropertiesService.getScriptProperties().setProperty(OFFICER_HASH_PROPERTY, hash_(PASSPHRASE));
}

// Run once, then remove the temporary key from the editor and deploy a new version.
function configureWowauditApiKey() {
  const API_KEY = 'REPLACE WITH YOUR WOWAUDIT API KEY';
  if (API_KEY.indexOf('REPLACE WITH') === 0) throw new Error('Replace API_KEY before running this function.');
  PropertiesService.getScriptProperties().setProperty(WOWAUDIT_API_KEY_PROPERTY, API_KEY.trim());
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
