ASCILI WHEEL, SERVER VERSION

1. Netlify does not reliably deploy functions from drag and drop. Use the Netlify CLI or connect a GitHub repo.
2. In Netlify: Site configuration > Environment variables > add SPIN_SECRET = a long random string (20+ characters). Never share it.
3. Deploy this whole folder (keep netlify.toml, netlify/functions/spin.mjs and public/index.html).
   CLI: npm i -g netlify-cli, netlify login, netlify link, netlify deploy --prod
4. Test: open your site, spin, and check View Source. No codes should appear.
5. Prizes, codes and weights live in the SPIN_PRIZES environment variable in Netlify (not in this repo). Codes must exist in Take App.
