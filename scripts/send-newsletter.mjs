/**
 * Builds a weekly digest from the published RSS feed and sends it via Brevo.
 *
 * Reads the live feed rather than the repo so it can only ever send what is
 * actually published. Runs in GitHub Actions — no server involved.
 *
 * Env:
 *   BREVO_API_KEY  required
 *   BREVO_LIST_ID  required — the subscriber list id
 *   SITE_URL       required — e.g. https://srishankaradental.com
 */

const { BREVO_API_KEY, BREVO_LIST_ID, SITE_URL } = process.env;

for (const [k, v] of Object.entries({ BREVO_API_KEY, BREVO_LIST_ID, SITE_URL })) {
  if (!v) { console.error(`${k} is not set.`); process.exit(1); }
}

const feed = await (await fetch(new URL('/rss.xml', SITE_URL))).text();

const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
  const pick = (tag) => {
    const r = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
    return (m[1].match(r)?.[1] ?? '').trim();
  };
  return { title: pick('title'), link: pick('link'), description: pick('description'), pubDate: pick('pubDate') };
});

const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
const recent = items.filter((i) => new Date(i.pubDate).getTime() >= weekAgo);

if (recent.length === 0) {
  console.log('No articles published this week — not sending.');
  process.exit(0);
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const html = `<!doctype html>
<html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#191718">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden">
      <tr><td style="background:#2A2E78;padding:22px 26px">
        <div style="color:#fff;font-size:19px;font-weight:bold">Sri Shankara Dental Clinic</div>
        <div style="color:#EB8C30;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Dental news</div>
      </td></tr>
      <tr><td style="padding:26px">
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#57545a">
          New research and developments in dentistry from the past week. General
          information only &mdash; not treatment advice.
        </p>
        ${recent.map((i) => `
        <div style="padding:16px 0;border-top:1px solid #e2e0e6">
          <a href="${esc(new URL(i.link, SITE_URL).href)}" style="color:#2A2E78;font-size:17px;font-weight:bold;text-decoration:none">${esc(i.title)}</a>
          <p style="margin:7px 0 0;font-size:14px;line-height:1.6;color:#57545a">${esc(i.description)}</p>
        </div>`).join('')}
      </td></tr>
      <tr><td style="background:#f4f5fb;padding:18px 26px;font-size:12px;line-height:1.6;color:#57545a">
        You are receiving this because you asked for it on our website.
        <a href="{{ unsubscribe }}" style="color:#2A2E78">Unsubscribe</a> at any time.<br />
        Sri Shankara Dental Clinic, Tapovan Enclave, Dehradun, Uttarakhand.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

const today = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short',
}).format(new Date());

const create = await fetch('https://api.brevo.com/v3/emailCampaigns', {
  method: 'POST',
  headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({
    name: `Dental news — ${today}`,
    subject: recent.length === 1 ? recent[0].title : `Dental news: ${recent.length} updates`,
    sender: { name: 'Sri Shankara Dental Clinic', email: 'news@srishankaradental.com' },
    htmlContent: html,
    recipients: { listIds: [Number(BREVO_LIST_ID)] },
  }),
});

if (!create.ok) {
  console.error(`Brevo campaign create failed ${create.status}: ${await create.text()}`);
  process.exit(1);
}

const { id } = await create.json();

const send = await fetch(`https://api.brevo.com/v3/emailCampaigns/${id}/sendNow`, {
  method: 'POST',
  headers: { 'api-key': BREVO_API_KEY, accept: 'application/json' },
});

if (!send.ok) {
  console.error(`Brevo send failed ${send.status}: ${await send.text()}`);
  process.exit(1);
}

console.log(`Sent campaign ${id} with ${recent.length} article(s).`);
