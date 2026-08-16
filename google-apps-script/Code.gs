const SHEET_NAME = 'Wishlists';
const SPREADSHEET_ID = '1y7cgwp_m_aPDznRz7kwS-G1IPlvZWz3vXwilLmBNCKU';
const HEADERS = ['characterId', 'characterName', 'characterClass', 'lootSpec', 'wishlistJson', 'updatedAt', 'version'];

function doGet() {
  try {
    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues().slice(1);
    const wishlists = rows.filter(row => row[0] !== '').map(row => ({
      characterId: Number(row[0]),
      characterName: String(row[1] || ''),
      characterClass: String(row[2] || ''),
      lootSpec: String(row[3] || ''),
      wishlist: JSON.parse(String(row[4] || '[]')),
      updatedAt: String(row[5] || ''),
      version: Number(row[6] || 1),
    }));
    return json_({ ok: true, wishlists });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) });
  }
}

function doPost(event) {
  try {
    const body = JSON.parse(event.postData && event.postData.contents || '{}');
    if (!Number.isFinite(Number(body.characterId))) throw new Error('A valid characterId is required.');
    if (!body.characterName || !body.characterClass || !body.lootSpec) throw new Error('Character identity and lootSpec are required.');
    if (!Array.isArray(body.wishlist) || body.wishlist.length < 1) throw new Error('Wishlist must contain items.');

    const sheet = getSheet_();
    const id = Number(body.characterId);
    const values = sheet.getDataRange().getValues();
    let row = values.findIndex((value, index) => index > 0 && Number(value[0]) === id) + 1;
    if (!row) row = sheet.getLastRow() + 1;
    const updatedAt = new Date().toISOString();
    sheet.getRange(row, 1, 1, HEADERS.length).setValues([[
      id,
      String(body.characterName).slice(0, 80),
      String(body.characterClass).slice(0, 40),
      String(body.lootSpec).slice(0, 80),
      JSON.stringify(body.wishlist),
      updatedAt,
      Number(body.version || 1),
    ]]);
    return json_({ ok: true, characterId: id, updatedAt });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) });
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
