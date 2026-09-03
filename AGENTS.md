# Project rules

- Footer content is protected. Do not remove, hide, shorten, rewrite, reorder, or restyle any footer content, business information, contact details, bank account details, social links, or footer layout unless the user explicitly requests that footer change.
- Every public HTML page must contain the same complete footer used on the homepage. Subfolder pages may change only relative asset and home-link paths.
- story/admin.html and search-engine verification files are the only HTML pages exempt from the public footer requirement.
- After changing a public page, shared stylesheet, template, generator, or deployment configuration, run node scripts/check-footers.mjs and verify the footer is present and visible on every affected public page.

