ASCILI WHEEL, SERVER VERSION

1. Netlify does not reliably deploy functions from drag and drop. Use the Netlify CLI or connect a GitHub repo.
2. In Netlify: Site configuration > Environment variables > add SPIN_SECRET = a long random string (20+ characters). Never share it.
3. Deploy this whole folder (keep netlify.toml, netlify/functions/spin.mjs and public/index.html).
   CLI: npm i -g netlify-cli, netlify login, netlify link, netlify deploy --prod
4. Test: open your site, spin, and check View Source. No codes should appear.

6. Claim checker: open /check on your site, enter the team password (Netlify variable CHECK_PASSWORD) and the Ref from a customer's WhatsApp message. Do not reorder the prize lists in SPIN_PRIZES once live.
