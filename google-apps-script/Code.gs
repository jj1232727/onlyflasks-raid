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
// Diagnostics. A paste that fails leaves nothing behind anywhere else: the
// snapshot is only written on success, and a client-side failure never reaches
// this script at all. An Elemental Shaman insisted he had simmed while the board
// held no trace of him, and there was no way to tell a failed paste from one
// that never happened. SimcLog answers that; SimcExports keeps what he pasted so
// the run can be reproduced by hand.
//
// Neither is in doGet. The board is public and a /simc export names a character,
// realm and full gear - same reason the QE queue keeps its simc out of the
// payload. Reading either one needs an officer token.
const SIMC_EXPORT_SHEET_NAME = 'SimcExports';
const SIMC_LOG_SHEET_NAME = 'SimcLog';
const SIMC_EXPORT_HEADERS = ['characterId', 'characterName', 'lootSpec', 'simc', 'capturedAt', 'updatedAt'];
const SIMC_LOG_HEADERS = ['at', 'characterId', 'characterName', 'lootSpec', 'step', 'ok', 'detail'];
// Oldest rows are dropped past this. Enough to cover a raid week of pastes.
const SIMC_LOG_LIMIT = 500;
// The loot spec a raider picked, shared.
//
// This used to live only in the viewer's localStorage, so "the spec they chose"
// meant a different thing in every browser: two officers could read different
// sims off the same board for the same raider and neither would know. A choice
// that drives who gets loot has to be one value for everyone, like roster status
// already is. Not officer-gated - a raider sets their own spec here, the same
// way saveWishlist_ already accepts a lootSpec from anyone.
const LOOT_SPEC_SHEET_NAME = 'LootSpecs';
const LOOT_SPEC_HEADERS = ['characterId', 'characterName', 'lootSpec', 'updatedAt'];
// Droptimizers that Raidbots is running.
//
// The submit and the upload are both done here, but nothing here decides WHEN:
// the page polls Raidbots and then asks for the upload. Close the tab and the
// sim finishes on Raidbots and is never fetched, so it never reaches WoWAudit
// and the board never sees it. A time trigger drains this sheet and finishes
// those, which is the only part that has to survive the tab.
//
// The page still does its own upload while it is open - that path is seconds
// faster and unchanged - and clears its row when it succeeds.
const PENDING_SIM_SHEET_NAME = 'PendingSims';
const PENDING_SIM_HEADERS = ['characterId', 'characterName', 'simId', 'difficulty', 'submittedAt', 'state', 'error'];
// Raidbots finishes in about a minute. Well past that it is not coming.
const PENDING_SIM_GIVE_UP_MS = 3 * 60 * 60 * 1000;
// Finished rows are kept only long enough to be worth reading. 26 raiders at
// three sims a week fills this steadily, and nothing else would ever clear it.
const PENDING_SIM_KEEP = 300;
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

// Caching for doGet only. Every board load reads eight sheets, about five
// seconds of it, and Apps Script runs at most thirty executions at once - so
// twenty-five raiders opening the board together is the real ceiling, not any
// API limit.
//
// The WoWAudit read is deliberately NOT cached; see getWowauditSims_.
//
// Correctness first: a cache that can serve stale loot data is worse than a slow
// board. So it is invalidated centrally in doPost - any action that is not on
// the read-only list drops it - rather than by each writer remembering to. A
// writer added later cannot forget. The TTLs are short enough to self-heal in
// under a minute even if something does slip through, and drainPendingSims
// drops it too since it writes outside doPost.
const BOARD_CACHE_KEY = 'board:doGet:v1';
const BOARD_CACHE_SECONDS = 30;
// CacheService caps a value at 100KB. The board payload is about 34KB so it
// fits in one, but the chunking stays: it costs nothing at this size and the
// payload only grows.
const CACHE_CHUNK = 90000;
// Everything else is a write, or leads to one. Over-invalidating costs a few
// seconds of cache; under-invalidating shows someone last minute's loot data.
const READ_ONLY_ACTIONS = ['cacheStatus', 'officerVerify', 'getWowauditSims', 'getQePending', 'getSimcLog', 'getSimcExport', 'checkQeDispatch'];

function cacheRead_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var count = Number(cache.get(key + ':n') || 0);
    if (!count) return null;
    var parts = [];
    for (var i = 0; i < count; i++) {
      var part = cache.get(key + ':' + i);
      // A chunk can expire on its own; a partial value is not a value.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  } catch (error) { return null; }
}

function cacheWrite_(key, value, seconds) {
  try {
    var cache = CacheService.getScriptCache(), parts = [];
    for (var i = 0; i < value.length; i += CACHE_CHUNK) parts.push(value.slice(i, i + CACHE_CHUNK));
    for (var j = 0; j < parts.length; j++) cache.put(key + ':' + j, parts[j], seconds);
    cache.put(key + ':n', String(parts.length), seconds);
  } catch (error) { /* a cache that cannot be written is just a slow board */ }
}

function cacheDrop_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var count = Number(cache.get(key + ':n') || 0), keys = [key + ':n'];
    for (var i = 0; i < count; i++) keys.push(key + ':' + i);
    cache.removeAll(keys);
  } catch (error) { /* best effort */ }
}

// Anything that changes what the board shows.
function invalidateBoardCache_() { cacheDrop_(BOARD_CACHE_KEY); }

// Latency here swings by seconds, so a hit cannot be inferred from timing.
function cacheStatus_() {
  var cache = CacheService.getScriptCache(), out = {};
  [['board', BOARD_CACHE_KEY]].forEach(function (pair) {
    var count = Number(cache.get(pair[1] + ':n') || 0), held = 0;
    for (var i = 0; i < count; i++) if (cache.get(pair[1] + ':' + i) !== null) held++;
    out[pair[0]] = { chunks: count, present: held, usable: count > 0 && held === count };
  });
  return out;
}

function doGet() {
  try {
    var cached = cacheRead_(BOARD_CACHE_KEY);
    if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues().slice(1);
    const wishlists = rows.filter(row => row[0] !== '').map(row => ({
      characterId: Number(row[0]), characterName: String(row[1] || ''), characterClass: String(row[2] || ''),
      lootSpec: String(row[3] || ''), wishlist: JSON.parse(String(row[4] || '[]')),
      updatedAt: String(row[5] || ''), version: Number(row[6] || 1),
    }));
    var payload = JSON.stringify({ ok: true, wishlists: wishlists, rosterStatuses: getRosterStatuses_(), lootSpecs: getLootSpecs_(), simcSnapshots: getSimcSnapshots_(), qeReports: getQeReports_(), qeQueue: getQeQueue_(), pendingSims: getPendingSims_() });
    cacheWrite_(BOARD_CACHE_KEY, payload, BOARD_CACHE_SECONDS);
    return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
  } catch (error) { return json_({ ok: false, error: String(error.message || error) }); }
}

function doPost(event) {
  try {
    const body = JSON.parse(event.postData && event.postData.contents || '{}');
    var writes = READ_ONLY_ACTIONS.indexOf(String(body.action || '')) < 0;
    if (!writes) return routePost_(body);
    // Twice, deliberately. Dropping it only before the write leaves a race: a
    // board load landing mid-write reads the old sheets and caches them, and
    // that pre-write copy then outlives the write by the whole TTL. Dropping it
    // again afterwards kills anything cached during the window. The finally is
    // for the throwing case, which can still have written first.
    invalidateBoardCache_();
    try {
      return routePost_(body);
    } finally {
      invalidateBoardCache_();
    }
  } catch (error) { return json_({ ok: false, error: String(error.message || error) }); }
}

function routePost_(body) {
  if (body.action === 'officerLogin') return officerLogin_(body);
  if (body.action === 'officerVerify') return json_({ ok: true, authorized: officerAuthorized_(body.token) });
  if (body.action === 'setRosterStatus') return setRosterStatus_(body);
  if (body.action === 'setLootSpec') return setLootSpec_(body);
  if (body.action === 'submitDroptimizer') return submitDroptimizer_(body);
  if (body.action === 'checkDroptimizer') return checkDroptimizer_(body);
  if (body.action === 'getWowauditSims') return getWowauditSims_();
  if (body.action === 'saveSimcSnapshot') return saveSimcSnapshot_(body);
  if (body.action === 'logSimcAttempt') return logSimcAttempt_(body);
  if (body.action === 'getSimcLog') return getSimcLog_(body);
  if (body.action === 'getSimcExport') return getSimcExport_(body);
  if (body.action === 'saveQeReport') return saveQeReport_(body);
  if (body.action === 'queueQeRun') return queueQeRun_(body);
  if (body.action === 'getQePending') return json_({ ok: true, pending: getQePending_() });
  if (body.action === 'setQeQueueState') return setQeQueueState_(body);
  // Diagnostic. Deliberately does NOT dispatch: doPost is public, so an action
  // that starts a workflow run is a button anyone can hold down.
  if (body.action === 'cacheStatus') return json_({ ok: true, cache: cacheStatus_() });
  if (body.action === 'checkQeDispatch') return json_({ ok: true, dispatch: checkQeDispatchConfig_() });
  return saveWishlist_(body);
}

// Always live, never cached. WoWAudit serves this from their own scheduled
// syncs, so a read is cheap for them and no published limit is close - and this
// is the number loot is handed out on. Caching it bought a little latency on a
// call that is mostly Apps Script overhead anyway, in exchange for a window
// where the board could show a sim that had already been replaced.
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
  // Never fatal: a sim that ran is worth more than a tidy queue.
  try { recordPendingSim_(body, String(result.simId)); } catch (error) { /* best effort */ }
  return json_({ ok: true, jobId: String(result.jobId || ''), simId: String(result.simId), reportUrl: 'https://www.raidbots.com/simbot/report/' + result.simId });
}

function checkDroptimizer_(body) {
  const simId = String(body.simId || '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(simId)) throw new Error('A valid Raidbots simId is required.');
  if (!body.reportReady) {
    const reportResponse = UrlFetchApp.fetch(RAIDBOTS_REPORT_URL + encodeURIComponent(simId) + '/data.json', { muteHttpExceptions: true });
    // Raidbots serves reports from object storage that answers 403, not 404,
    // for a key that does not exist yet - so 403 is the ordinary "still
    // running" reply, and it is the one this path sees most. Treating it as a
    // failure turned every resume of a sim that had not finished into an
    // error the raider had to read as if something had broken. The page's own
    // poller and drainPendingSims already accept both codes; this was the last
    // place that did not.
    var reportCode = reportResponse.getResponseCode();
    if (reportCode === 404 || reportCode === 403) return json_({ ok: true, state: 'running', simId: simId });
    if (reportCode !== 200) throw new Error('Raidbots status check failed (' + reportCode + ').');
    const report = parseJson_(reportResponse.getContentText());
    if (report.error || report.errors || report.meta && report.meta.error) {
      return json_({ ok: true, state: 'failed', simId: simId, error: String(report.error || report.meta && report.meta.error || 'Simulation failed') });
    }
  }
  if (!body.upload) return json_({ ok: true, state: 'complete', simId: simId });
  const apiKey = PropertiesService.getScriptProperties().getProperty(WOWAUDIT_API_KEY_PROPERTY);
  if (!apiKey) throw new Error('WoWAudit API access has not been configured in Apps Script.');
  wowauditUpload_(simId, body.characterId, body.characterName, body.configurationName, body.replaceManualEdits);
  try { setPendingSimState_(simId, 'done', ''); } catch (error) { /* best effort */ }
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

function setLootSpec_(body) {
  var id = Number(body.characterId), lootSpec = String(body.lootSpec || '').trim();
  if (!Number.isFinite(id)) throw new Error('A valid characterId is required.');
  if (!lootSpec) throw new Error('A loot spec is required.');
  if (lootSpec.length > 80) throw new Error('That loot spec name is too long.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getLootSpecSheet_(), values = sheet.getDataRange().getValues();
    var row = values.findIndex(function (value, index) { return index > 0 && Number(value[0]) === id; }) + 1;
    if (!row) row = sheet.getLastRow() + 1;
    var updatedAt = new Date().toISOString();
    sheet.getRange(row, 1, 1, LOOT_SPEC_HEADERS.length).setValues([[
      id, String(body.characterName || '').slice(0, 80), lootSpec, updatedAt,
    ]]);
    return json_({ ok: true, characterId: id, lootSpec: lootSpec, updatedAt: updatedAt });
  } finally { lock.releaseLock(); }
}

function getLootSpecs_() {
  return getLootSpecSheet_().getDataRange().getValues().slice(1).reduce(function (result, row) {
    if (row[0] !== '' && String(row[2] || '')) result[String(Number(row[0]))] = String(row[2]);
    return result;
  }, {});
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
    bonusRollCurrencies: snapshot.bonusRollCurrencies || {},
    // Capped for the same reason bags and vault are: one row has to stay inside
    // a cell, and a season of rolls is a list that only grows.
    bonusRolls: Array.isArray(snapshot.bonusRolls) ? snapshot.bonusRolls.slice(0, 40) : [],
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
    // Keep the export itself when the board sends it. Never fatal: a paste must
    // not fail because a diagnostic could not be written.
    try { saveSimcExport_(body); } catch (error) { /* diagnostics are best effort */ }
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
    var dispatch = triggerQeSync_();
    return json_({ ok: true, characterId: id, requestedAt: requestedAt, state: 'pending', dispatched: dispatch.ok, dispatchNote: dispatch.reason });
  } finally { lock.releaseLock(); }
}

// Answers "is the dispatch wired up" without dispatching. A GET on the repo
// proves the token is valid and can see it, which covers every setup mistake
// seen so far. It cannot prove Contents:write - only a real dispatch does that,
// and the next paste is a free test of it.
function checkQeDispatchConfig_() {
  var ready = qeDispatchSettings_();
  if (ready.reason) return { ok: false, reason: ready.reason };
  try {
    var response = UrlFetchApp.fetch('https://api.github.com/repos/' + ready.repo, {
      method: 'get', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ready.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    var code = response.getResponseCode();
    if (code === 200) return { ok: true, reason: 'Token and repo are good. Contents:write is only proven by a real paste.' };
    if (code === 401) return { ok: false, reason: 'GitHub answered 401: the token is invalid or revoked.' };
    if (code === 404) return { ok: false, reason: 'GitHub answered 404: the token cannot see ' + ready.repo + '.' };
    return { ok: false, reason: 'GitHub answered ' + code + ': ' + String(response.getContentText() || '').slice(0, 200) };
  } catch (error) { return { ok: false, reason: 'Request failed: ' + String(error.message || error).slice(0, 200) }; }
}

// Shared by the dispatch and its diagnostic, so a setup mistake reads the same
// either way.
function qeDispatchSettings_() {
  // These two constants are property NAMES, not the secrets themselves. Pasting
  // a token over the name is an easy mistake - the two steps sit next to each
  // other in the setup - and it has happened. Catch it before the name is used
  // in a message, because this reason travels out through a public endpoint:
  // echoing a misplaced token there publishes it to anyone with the URL, and the
  // URL is in a public repo.
  if (!/^[A-Z][A-Z0-9_]{2,40}$/.test(String(GITHUB_TOKEN_PROPERTY)) || !/^[A-Z][A-Z0-9_]{2,40}$/.test(String(GITHUB_REPO_PROPERTY)))
    return { ok: false, reason: 'A GITHUB_*_PROPERTY constant holds a value instead of a property name. Leave those constants alone; the token and repo go in Script Properties, under those names.' };
  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty(GITHUB_TOKEN_PROPERTY) || '').trim();
  var repo = String(props.getProperty(GITHUB_REPO_PROPERTY) || '').trim();
  if (!token) return { reason: 'No ' + GITHUB_TOKEN_PROPERTY + ' in Script Properties.' };
  if (!repo) return { reason: 'No ' + GITHUB_REPO_PROPERTY + ' in Script Properties.' };
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { reason: GITHUB_REPO_PROPERTY + ' should be "owner/name", got "' + repo + '".' };
  return { token: token, repo: repo };
}

// Kick the workflow now. A failure here is not fatal - the schedule still
// catches the job - so never let it break the paste.
//
// It used to answer a bare false for every kind of failure: properties unset,
// repo misspelled, token short a permission, GitHub down. All identical, and all
// only visible as "it did not run". Say which, and quote what GitHub said - the
// token is never part of that, only its presence and GitHub's own message.
function triggerQeSync_() {
  var ready = qeDispatchSettings_();
  if (ready.reason) return { ok: false, reason: ready.reason };
  try {
    var response = UrlFetchApp.fetch('https://api.github.com/repos/' + ready.repo + '/dispatches', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ready.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      payload: JSON.stringify({ event_type: 'qe-sync' }),
    });
    var code = response.getResponseCode();
    if (code === 204) return { ok: true, reason: 'Dispatched.' };
    return { ok: false, reason: 'GitHub answered ' + code + ': ' + String(response.getContentText() || '').slice(0, 200) };
  } catch (error) { return { ok: false, reason: 'Request failed: ' + String(error.message || error).slice(0, 200) }; }
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

// Latest export per character, overwritten each paste. History lives in the log.
function saveSimcExport_(body) {
  var id = Number(body.characterId), simc = String(body.simc || '');
  if (!Number.isFinite(id) || simc.length < 100) return null;
  // A sheet cell tops out at 50000 characters, and a truncated export is worse
  // than none - it would look reproducible and not be.
  if (simc.length > 45000) simc = simc.slice(0, 45000);
  var sheet = getSimcExportSheet_(), values = sheet.getDataRange().getValues();
  var row = values.findIndex(function (value, index) { return index > 0 && Number(value[0]) === id; }) + 1;
  if (!row) row = sheet.getLastRow() + 1;
  var now = new Date().toISOString();
  sheet.getRange(row, 1, 1, SIMC_EXPORT_HEADERS.length).setValues([[
    id, String(body.characterName || '').slice(0, 80), String(body.lootSpec || '').slice(0, 80),
    simc, String(body.capturedAt || now).slice(0, 40), now,
  ]]);
  return row;
}

// One row per paste attempt, success or failure. The board calls this without
// waiting for it, so it must never throw back at the paste.
function logSimcAttempt_(body) {
  var id = Number(body.characterId);
  if (!Number.isFinite(id)) throw new Error('A valid characterId is required.');
  var sheet = getSimcLogSheet_();
  sheet.appendRow([
    new Date().toISOString(), id, String(body.characterName || '').slice(0, 80),
    String(body.lootSpec || '').slice(0, 80), String(body.step || '').slice(0, 40),
    body.ok ? 'OK' : 'FAILED', String(body.detail || '').slice(0, 500),
  ]);
  // Trim oldest first so the sheet cannot grow without bound.
  var extra = sheet.getLastRow() - 1 - SIMC_LOG_LIMIT;
  if (extra > 0) sheet.deleteRows(2, extra);
  // A failure is exactly when the export matters, and the snapshot writer never
  // ran to store it.
  try { if (body.simc) saveSimcExport_(body); } catch (error) { /* best effort */ }
  return json_({ ok: true, logged: true });
}

function getSimcLog_(body) {
  if (!officerAuthorized_(body.token)) throw new Error('Officer session expired. Sign in again.');
  var limit = Math.min(Math.max(Number(body.limit) || 100, 1), SIMC_LOG_LIMIT);
  var rows = getSimcLogSheet_().getDataRange().getValues().slice(1).filter(function (row) { return row[0] !== ''; });
  return json_({ ok: true, log: rows.slice(-limit).reverse().map(function (row) {
    return {
      at: String(row[0] || ''), characterId: Number(row[1]), characterName: String(row[2] || ''),
      lootSpec: String(row[3] || ''), step: String(row[4] || ''), ok: String(row[5]) === 'OK',
      detail: String(row[6] || ''),
    };
  }) });
}

function getSimcExport_(body) {
  if (!officerAuthorized_(body.token)) throw new Error('Officer session expired. Sign in again.');
  var id = Number(body.characterId);
  if (!Number.isFinite(id)) throw new Error('A valid characterId is required.');
  var values = getSimcExportSheet_().getDataRange().getValues();
  var row = values.find(function (value, index) { return index > 0 && Number(value[0]) === id; });
  if (!row) throw new Error('No stored /simc export for that character.');
  return json_({ ok: true, characterId: id, characterName: String(row[1] || ''), lootSpec: String(row[2] || ''), simc: String(row[3] || ''), capturedAt: String(row[4] || ''), updatedAt: String(row[5] || '') });
}

// One place both the page and the trigger push a finished report from, so they
// cannot drift into uploading it two different ways.
function wowauditUpload_(simId, characterId, characterName, configurationName, replaceManualEdits) {
  var apiKey = PropertiesService.getScriptProperties().getProperty(WOWAUDIT_API_KEY_PROPERTY);
  if (!apiKey) throw new Error('WoWAudit API access has not been configured in Apps Script.');
  var response = UrlFetchApp.fetch('https://wowaudit.com/v1/wishlists', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify({
      report_id: simId,
      character_id: Number(characterId),
      character_name: String(characterName || '').slice(0, 80),
      configuration_name: String(configurationName || 'Single Target').slice(0, 80),
      replace_manual_edits: Boolean(replaceManualEdits),
    }),
  });
  var status = response.getResponseCode(), result = parseJson_(response.getContentText());
  if (status < 200 || status >= 300) {
    throw new Error('WoWAudit upload failed (' + status + '): ' + String(result.error || result.message || response.getContentText()).slice(0, 240));
  }
  if (result.created === false) {
    var details = Array.isArray(result.base) ? result.base.join('; ') : (result.error || result.message || 'WoWAudit rejected the report.');
    throw new Error(String(details).slice(0, 240));
  }
  // The board reads sims live, so an upload is visible immediately. Only the
  // doGet payload needs dropping.
  invalidateBoardCache_();
  return true;
}

function recordPendingSim_(body, simId) {
  var id = Number(body.characterId);
  if (!Number.isFinite(id) || !simId) return;
  var sheet = getPendingSimSheet_();
  sheet.appendRow([
    id, String(body.characterName || '').slice(0, 80), simId,
    String((body.payload && body.payload.droptimizer && body.payload.droptimizer.difficulty) || '').slice(0, 40),
    new Date().toISOString(), 'pending', '',
  ]);
}

function setPendingSimState_(simId, state, error) {
  var sheet = getPendingSimSheet_(), values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][2]) === String(simId)) {
      sheet.getRange(i + 1, 6, 1, 2).setValues([[state, String(error || '').slice(0, 300)]]);
      return true;
    }
  }
  return false;
}

// Sim status the board can read without having been the tab that started it.
//
// Whether a droptimizer is still running belonged in localStorage, so closing
// the tab lost the answer as well as the upload. It is per character and per
// difficulty, and only the states matter - the simId is already public in the
// Raidbots report link the board shows.
function getPendingSims_() {
  var cutoff = Date.now() - PENDING_SIM_GIVE_UP_MS;
  return getPendingSimSheet_().getDataRange().getValues().slice(1).reduce(function (result, row) {
    if (row[0] === '') return result;
    var at = Date.parse(String(row[4]));
    // Settled rows are kept for a while for reading; only recent ones are news.
    if (isFinite(at) && at < cutoff) return result;
    var key = String(Number(row[0]));
    if (!result[key]) result[key] = [];
    result[key].push({
      simId: String(row[2] || ''), difficulty: String(row[3] || ''),
      submittedAt: String(row[4] || ''), state: String(row[5] || ''), error: String(row[6] || ''),
    });
    return result;
  }, {});
}

// Trigger target - no underscore, so it can be selected in the editor.
// Finishes anything Raidbots has completed that nobody uploaded.
function drainPendingSims() {
  var sheet = getPendingSimSheet_(), values = sheet.getDataRange().getValues(), now = Date.now(), touched = 0, changed = false;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row[0] === '' || String(row[5]) !== 'pending') continue;
    var simId = String(row[2]), submitted = Date.parse(String(row[4]));
    // A newer sim for the same character and difficulty already landed, so this
    // one is not late - it is stale. Uploading it would replace good data with
    // older data, which is worse than never finishing it. Happens whenever
    // someone re-pastes rather than waiting for a stranded run.
    if (supersededPendingSim_(values, i)) {
      sheet.getRange(i + 1, 6, 1, 2).setValues([['superseded', 'A newer sim for this difficulty already uploaded.']]);
      changed = true;
      continue;
    }
    if (isFinite(submitted) && now - submitted > PENDING_SIM_GIVE_UP_MS) {
      sheet.getRange(i + 1, 6, 1, 2).setValues([['expired', 'Raidbots never produced a report.']]);
      changed = true;
      continue;
    }
    try {
      var report = UrlFetchApp.fetch(RAIDBOTS_REPORT_URL + encodeURIComponent(simId) + '/data.json', { muteHttpExceptions: true });
      var code = report.getResponseCode();
      // 404 is the normal "still running" answer, so leave it pending.
      if (code === 404 || code === 403) continue;
      // Nor is a throttle or an outage a failure. Twenty-five raiders pasting
      // together is exactly when Raidbots pushes back, and marking those rows
      // errored would abandon sims that were only ever going to be a minute
      // late. Leave them pending; the give-up window is three hours.
      if (code === 429 || code >= 500) continue;
      if (code !== 200) { sheet.getRange(i + 1, 6, 1, 2).setValues([['error', 'Raidbots status ' + code]]); changed = true; continue; }
      var parsed = parseJson_(report.getContentText());
      if (parsed.error || parsed.errors || (parsed.meta && parsed.meta.error)) {
        sheet.getRange(i + 1, 6, 1, 2).setValues([['error', String(parsed.error || (parsed.meta && parsed.meta.error) || 'Simulation failed').slice(0, 300)]]);
        continue;
      }
      wowauditUpload_(simId, row[0], row[1], 'Single Target', false);
      sheet.getRange(i + 1, 6, 1, 2).setValues([['done', '']]);
      touched++;
    } catch (error) {
      var why = String(error.message || error);
      // Transient upstream trouble keeps its turn in the queue rather than
      // burning the row.
      if (retryableFailure_(why)) continue;
      sheet.getRange(i + 1, 6, 1, 2).setValues([['error', why.slice(0, 300)]]);
      changed = true;
    }
  }
  var settled = trimPendingSims_(sheet) || touched || changed;
  // Runs on a timer, where doPost's invalidation never sees it - but only when
  // it actually changed something. Dropping the cache on every tick threw away
  // a good cache every five minutes for nothing.
  if (settled) invalidateBoardCache_();
  return touched;
}

// Throttling, gateways and timeouts come back on the next tick. A rejected
// report or a bad request will not, and should stop consuming turns.
function retryableFailure_(message) {
  return /\b(429|500|502|503|504)\b|timed out|timeout|rate limit|too many requests|temporarily/i.test(String(message || ''));
}

function supersededPendingSim_(values, index) {
  var row = values[index], at = Date.parse(String(row[4]));
  if (!isFinite(at)) return false;
  for (var j = 1; j < values.length; j++) {
    if (j === index || values[j][0] === '') continue;
    if (Number(values[j][0]) !== Number(row[0])) continue;
    if (String(values[j][3]) !== String(row[3])) continue;
    var other = Date.parse(String(values[j][4]));
    if (String(values[j][5]) === 'done' && isFinite(other) && other > at) return true;
  }
  return false;
}

// Oldest settled rows first. Anything still pending is left alone, whatever its
// age - the give-up check above is what ends those.
function trimPendingSims_(sheet) {
  var values = sheet.getDataRange().getValues();
  var extra = values.length - 1 - PENDING_SIM_KEEP;
  if (extra <= 0) return false;
  var removed = false;
  for (var i = 1; i < values.length && extra > 0; i++) {
    if (String(values[i][5]) === 'pending') continue;
    sheet.deleteRow(i + 1);
    values.splice(i, 1);
    i--;
    extra--;
    removed = true;
  }
  return removed;
}

// Run once from the Apps Script editor. Safe to re-run - it replaces its own
// trigger rather than stacking another one.
function installPendingSimTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'drainPendingSims') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('drainPendingSims').timeBased().everyMinutes(5).create();
}

function getSheet_() { return getOrCreateSheet_(SHEET_NAME, HEADERS); }
function getRosterSheet_() { return getOrCreateSheet_(ROSTER_SHEET_NAME, ROSTER_HEADERS); }
function getSimcSheet_() { return getOrCreateSheet_(SIMC_SHEET_NAME, SIMC_HEADERS); }
function getQeSheet_() { return getOrCreateSheet_(QE_SHEET_NAME, QE_HEADERS); }
function getQeQueueSheet_() { return getOrCreateSheet_(QE_QUEUE_SHEET_NAME, QE_QUEUE_HEADERS); }
function getSimcExportSheet_() { return getOrCreateSheet_(SIMC_EXPORT_SHEET_NAME, SIMC_EXPORT_HEADERS); }
function getSimcLogSheet_() { return getOrCreateSheet_(SIMC_LOG_SHEET_NAME, SIMC_LOG_HEADERS); }
function getLootSpecSheet_() { return getOrCreateSheet_(LOOT_SPEC_SHEET_NAME, LOOT_SPEC_HEADERS); }
function getPendingSimSheet_() { return getOrCreateSheet_(PENDING_SIM_SHEET_NAME, PENDING_SIM_HEADERS); }
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
