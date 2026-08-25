/**
 * Launch readiness. Lists what is still outstanding before the site should be
 * pointed at the real domain.
 *
 * Does not fail the build — it reports. Run: npm run check:launch
 */

import { readFile, readdir } from 'node:fs/promises';

const clinic = await readFile('src/data/clinic.ts', 'utf8');
const has = (re) => re.test(clinic);

const blockers = [];
const nice = [];

// --- must be right before the site goes live -----------------------------
if (has(/web3formsKey: 'PLACEHOLDER'/))
  blockers.push('Contact form has no Web3Forms key — the page falls back to phone booking, so no enquiries are lost, but the form is not live. Free key at web3forms.com');

if (has(/grievanceOfficer:[\s\S]*?name: 'PLACEHOLDER'/))
  blockers.push('No named grievance officer. The DPDP Rules 2025 require one; the privacy page currently falls back to "The Practice Manager".');

if (has(/bio: '',/))
  blockers.push("Dr. Anand's biography is empty — the About page shows a bracketed note.");

// --- worth doing, not blocking -------------------------------------------
if (has(/geo: \{ lat: 0, lng: 0 \}/))
  nice.push('No latitude/longitude. Adding it strengthens the local-search signal. Grab it from Google Maps.');

if (has(/mapEmbedUrl: '',/))
  nice.push('No embedded map on the contact page.');

if (has(/googleBusiness: '',/))
  nice.push('No Google Business Profile linked. This is the single biggest driver of new patients — set it up before worrying about anything else on this list.');

if (has(/practo: '',/))
  nice.push('No Practo listing linked. Widely used for finding clinics in India.');

if (has(/whatsapp: '',/))
  nice.push('No WhatsApp number set.');

const services = await readdir('src/content/services');
const priced = await Promise.all(
  services.filter((f) => f.endsWith('.md')).map(async (f) => {
    const t = await readFile(`src/content/services/${f}`, 'utf8');
    return /^priceRange:/m.test(t);
  })
);
const unpriced = priced.filter((x) => !x).length;
if (unpriced) {
  nice.push(
    `${unpriced} treatment page(s) show no indicative cost. Clause 8.2.9 of the DCI code expressly permits publishing fees, and patients search for them — worth adding.`
  );
}

// --- report ---------------------------------------------------------------
const line = '─'.repeat(64);
console.log(`\n${line}\n  Launch readiness\n${line}\n`);

if (blockers.length) {
  console.log('  Before pointing the real domain at this site:\n');
  blockers.forEach((b, i) => console.log(`   ${i + 1}. ${b}\n`));
} else {
  console.log('  No blockers.\n');
}

if (nice.length) {
  console.log('  Worth doing, not blocking:\n');
  nice.forEach((n, i) => console.log(`   ${i + 1}. ${n}\n`));
}

console.log(`${line}\n`);
