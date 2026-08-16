# Shared wishlist storage

1. Create a blank Google Sheet named `OnlyFlasks Wishlists`.
2. Open **Extensions → Apps Script**.
3. Replace `Code.gs` with the contents of `google-apps-script/Code.gs` from this project.
4. Set `SPREADSHEET_ID` to the ID found between `/d/` and `/edit` in the Google Sheet URL.
5. Click **Deploy → New deployment → Web app**.
6. Set **Execute as** to `Me` and **Who has access** to `Anyone`.
7. Authorize the script and copy the deployment URL ending in `/exec`.
8. Paste that URL into `public/app-config.json` as `wishlistApiUrl`.
9. In `configureOfficerPassphrase`, replace the placeholder with a strong shared officer passphrase.
10. Select `configureOfficerPassphrase` in the function menu and click **Run** once.
11. Remove the plain-text passphrase from the editor, save, and deploy a **new version** of the web app.
12. Run `npm run build`, publish to GitHub Pages, and submit one test wishlist.

## Raidbots pilot

1. In `configureWowauditApiKey`, temporarily replace the placeholder with the WoWAudit API key.
2. Select `configureWowauditApiKey` in Apps Script and click **Run** once.
3. Remove the plain-text key from the editor and save.
4. Deploy a **new web-app version**. Editing the script alone does not update the `/exec` deployment.
5. Open **My wishlist**, select the matching character and loot specialization, paste the complete `/simc` export, and choose **Run and upload**.

The browser sends the export to Apps Script. Apps Script submits the anonymous Raidbots job, checks the public report, and uploads the completed report ID to WoWAudit. The API key never enters GitHub or browser storage.

Wishlist submissions remain trust-based. Roster Main/Trial/Fill changes require a short-lived officer session validated by Apps Script. The Sheet keeps Google edit history for recovery.
