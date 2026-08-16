# Shared wishlist storage

1. Create a blank Google Sheet named `OnlyFlasks Wishlists`.
2. Open **Extensions → Apps Script**.
3. Replace `Code.gs` with the contents of `google-apps-script/Code.gs` from this project.
4. Set `SPREADSHEET_ID` to the ID found between `/d/` and `/edit` in the Google Sheet URL.
5. Click **Deploy → New deployment → Web app**.
6. Set **Execute as** to `Me` and **Who has access** to `Anyone`.
7. Authorize the script and copy the deployment URL ending in `/exec`.
8. Paste that URL into `public/app-config.json` as `wishlistApiUrl`.
9. Run `npm run build`, publish to GitHub Pages, and submit one test wishlist.

The endpoint is intentionally trust-based. Anyone with the site can replace the wishlist associated with a roster character ID. The Sheet keeps Google edit history for recovery.
