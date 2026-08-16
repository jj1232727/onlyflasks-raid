const SHEET_NAME = 'Wishlists';
const ROSTER_SHEET_NAME = 'RosterPriority';
const SPREADSHEET_ID = '1y7cgwp_m_aPDznRz7kwS-G1IPlvZWz3vXwilLmBNCKU';
const HEADERS = ['characterId', 'characterName', 'characterClass', 'lootSpec', 'wishlistJson', 'updatedAt', 'version'];
const ROSTER_HEADERS = ['characterId', 'characterName', 'status', 'updatedAt'];
const OFFICER_HASH_PROPERTY = 'OFFICER_PASSPHRASE_HASH';
const OFFICER_SESSION_SECONDS = 21600;

function doGet() {
  try {
    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues().slice(1);
    const wishlists = rows.filter(row => row[0] !== '').map(row => ({
      characterId: Number(row[0]), characterName: String(row[1] || ''), characterClass: String(row[2] || ''),
      lootSpec: String(row[3] || ''), wishlist: JSON.parse(String(row[4] || '[]')),
      updatedAt: String(row[5] || ''), version: Number(row[6] || 1),
    }));
    return json_({ ok: true, wishlists, rosterStatuses: getRosterStatuses_() });
  } catch (error) { return json_({ ok: false, error: String(error.message || error) }); }
}

function doPost(event) {
  try {
    const body = JSON.parse(event.postData && event.postData.contents || '{}');
    if (body.action === 'officerLogin') return officerLogin_(body);
    if (body.action === 'officerVerify') return json_({ ok: true, authorized: officerAuthorized_(body.token) });
    if (body.action === 'setRosterStatus') return setRosterStatus_(body);
    return saveWishlist_(body);
  } catch (error) { return json_({ ok: false, error: String(error.message || error) }); }
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

function getRosterStatuses_() {
  return getRosterSheet_().getDataRange().getValues().slice(1).reduce((result, row) => {
    if (row[0] !== '' && ['Main', 'Trial', 'Fill'].includes(String(row[2]))) result[String(Number(row[0]))] = String(row[2]);
    return result;
  }, {});
}

function getSheet_() { return getOrCreateSheet_(SHEET_NAME, HEADERS); }
function getRosterSheet_() { return getOrCreateSheet_(ROSTER_SHEET_NAME, ROSTER_HEADERS); }
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

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
