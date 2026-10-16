import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// Full feature walkthrough against the demo (mock) backend. Start the app first:
//   npm run dev -- -p 3001   then   npm run test:e2e
// Override the URL with E2E_URL. Failure screenshots go to tests/output/.
const FIX = path.join(import.meta.dirname, 'fixtures');
const OUT = path.join(import.meta.dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const B = process.env.E2E_URL ?? 'http://localhost:3001';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true });
const errors = [], fails = [], passes = [];
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/hydrat|DevTools|favicon/i.test(m.text()) && errors.push(`${tag} console: ${m.text().slice(0, 200)}`));
};
const ok = (c, m) => (c ? passes : fails).push(m);
async function section(name, fn) {
  try { await fn(); passes.push('§ ' + name); console.log('✓', name); }
  catch (e) {
    const line = (e.stack.match(/full\.mjs:(\d+)/) || [])[1];
    fails.push(`§ ${name} (line ${line}): ${e.message.split('\n')[0]}`);
    console.log('✗', name, 'line', line, '—', e.message.split('\n').slice(0, 3).join(' | '));
    const slug = name.slice(0, 12).replace(/\W/g, '_');
    for (const [t, p] of [['c', c], ['w', w], ['a', a]]) await p.screenshot({ path: path.join(OUT, `fail-${slug}-${t}.png`) }).catch(() => {});
  }
}
const page = async (tag, wide) => { const p = await ctx.newPage(); watch(p, tag); if (wide) await p.setViewportSize({ width: 1300, height: 900 }); return p; };
const roleOf = (phone) => (phone === '9999900000' ? 'admin' : /^99999100/.test(phone) || phone === '9876500002' ? 'worker' : 'customer');
async function loginAs(p, phone, role = roleOf(phone)) {
  await p.goto(B + '/login?as=' + role);
  await p.getByLabel(/Mobile number|मोबाइल नंबर/).fill(phone);
  await p.getByRole('button', { name: /Send OTP|OTP भेजें/ }).click();
  await p.getByLabel('Digit 1').fill('123456');
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  await p.waitForTimeout(500);
}
async function logout(p) {
  await p.goto(B + (p.url().includes('/admin') ? '/admin' : p.url().includes('/w') ? '/w/profile' : '/c/profile'));
  await p.getByRole('button', { name: /Log out|लॉग आउट/ }).click();
  await p.waitForURL(/login/);
}
const db = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('dinadena.mockdb.v1')));
const otpOf = async (p, scope) => (await (scope ?? p).locator('p.tracking-\\[0\\.4em\\]').first().innerText()).trim();
// The customer's card for one worker on the live job screen.
const card = (p, name) => p.locator('section > div.rounded-2xl').filter({ hasText: name });

const c = await page('customer');
const w = await page('worker');
const a = await page('admin', true);

await section('Welcome: language choice persists, Hindi UI', async () => {
  await c.goto(B + '/');
  await c.waitForURL(/welcome/);
  await c.getByRole('radio', { name: /हिन्दी/ }).click();
  await c.getByRole('button', { name: /ग्राहक/ }).click();
  await c.waitForURL(/login\?as=customer/);
  await c.getByText('ग्राहक लॉग इन').waitFor();
  await c.goto(B + '/');
  await c.waitForURL(/login/); // welcome skipped on later launches
  await c.evaluate(() => localStorage.setItem('dinadena.lang', 'en'));
  await c.reload();
});

await section('Login validation and wrong OTP', async () => {
  await c.goto(B + '/login');
  await c.getByLabel('Mobile number').fill('12345');
  await c.getByRole('button', { name: 'Send OTP' }).click();
  await c.getByText('Enter a valid 10-digit mobile number').waitFor();
  await c.getByLabel('Mobile number').fill('9876500001');
  await c.getByRole('button', { name: 'Send OTP' }).click();
  await c.getByLabel('Digit 1').fill('111111');
  await c.getByText(/Wrong OTP. 2 tries left/).waitFor();
});

await section('New customer: onboarding → home', async () => {
  await c.getByLabel('Digit 1').fill('123456');
  await c.waitForURL(/onboarding/);
  await c.getByLabel('Your full name').fill('Test Customer');
  await c.getByRole('button', { name: 'Continue' }).click();
  await c.waitForURL(/\/c$/);
  await c.getByText('Hello, Test').waitFor();
});

await section('Customer profile: rename, language switch', async () => {
  await c.goto(B + '/c/profile');
  await c.getByLabel('Full name').fill('Test Customer Two');
  await c.getByRole('button', { name: 'Save' }).click();
  await c.getByText('Test Customer Two').first().waitFor();
  await c.getByRole('tab', { name: 'हिन्दी' }).click();
  await c.getByText('भाषा').waitFor();
  await c.getByRole('tab', { name: 'English' }).click();
  await c.getByText('Language').waitFor();
});

await section('Route guard: customer cannot open admin/worker', async () => {
  await c.goto(B + '/admin');
  await c.waitForURL(/\/c$/);
  await c.goto(B + '/w');
  await c.waitForURL(/\/c$/);
});

await section('New worker: onboarding → register → pending → demo approve → online', async () => {
  await loginAs(w, '9876500002');
  await w.waitForURL(/onboarding/);
  await w.getByLabel('Your full name').fill('Test Worker');
  ok(await w.getByRole('button', { name: /Find work/ }).count() === 0, 'role preset from worker login');
  await w.getByRole('button', { name: 'Continue' }).click();
  await w.waitForURL(/\/w\/register/);
  await w.getByRole('button', { name: /Loading & Unloading/ }).click();
  await w.getByRole('button', { name: /Furniture Moving/ }).click();
  await w.getByLabel('Home area').selectOption('Transport Nagar');
  await w.locator('input[type=file][accept*="pdf"]').setInputFiles(path.join(FIX, 'id.pdf'));
  await w.getByText('Uploaded').waitFor();
  await w.getByLabel('Bank name').fill('SBI');
  await w.getByLabel('Account no. (last 4)').fill('4321');
  await w.getByLabel('UPI ID').fill('test@upi');
  await w.getByRole('button', { name: 'Submit for verification' }).click();
  await w.waitForURL(/\/w$/);
  await w.getByText('Your profile is under verification').first().waitFor();
  await w.getByRole('switch').click();
  ok(await w.getByRole('dialog').getByText('Available after an admin verifies your profile', { exact: false }).isVisible(), 'pending toggle explains approval');
  await w.keyboard.press('Escape');
  ok((await w.getByRole('switch').getAttribute('aria-checked')) === 'false', 'stays offline while pending');
  await w.goto(B + '/w/jobs');
  await w.getByText('Your profile is under verification').waitFor();
  await w.goto(B + '/w');
  await w.getByRole('button', { name: 'Approve me now (demo)' }).click();
  await w.getByText('Verified Worker').waitFor({ timeout: 8000 });
  const sw = w.getByRole('switch');
  ok(!(await sw.isDisabled()) && (await sw.getAttribute('aria-checked')) === 'true', 'online after approval');
  await sw.click();
  await w.waitForTimeout(500);
  ok((await sw.getAttribute('aria-checked')) === 'false', 'toggle off');
  await sw.click();
  await w.waitForTimeout(500);
  ok((await sw.getAttribute('aria-checked')) === 'true', 'toggle on');
});

await section('Worker: nearby jobs list, radius chips, map view, accept from detail', async () => {
  await w.goto(B + '/w/jobs');
  await w.getByText('Load furniture into tempo').waitFor({ timeout: 8000 });
  await w.getByRole('button', { name: 'Within 5 km' }).click();
  await w.waitForTimeout(500);
  await w.getByRole('button', { name: 'Within 20 km' }).click();
  await w.getByRole('tab', { name: /Map View/ }).click();
  await w.locator('.leaflet-container').waitFor();
  await w.getByRole('tab', { name: /List View/ }).click();
  await w.getByRole('link', { name: 'View details' }).first().click();
  await w.waitForURL(/\/w\/jobs\//);
  await w.getByRole('button', { name: 'Accept Job' }).click();
  await w.waitForURL(/\/w\/bookings\//);
  await w.getByText('Your spot is confirmed!').waitFor();
  await w.getByText(/1 of 3 slots filled/).waitFor();
});

await section('Worker profile: details, no language switch, edit returns to profile', async () => {
  await w.goto(B + '/w/profile');
  await w.getByText('Verified Worker').first().waitFor();
  await w.getByText('test@upi').waitFor();
  await w.getByText('SBI ••4321').waitFor();
  await w.getByText('Uploaded').waitFor();
  ok(await w.getByRole('tab', { name: 'हिन्दी' }).count() === 0, 'no language switch on worker profile');
  await w.getByRole('link', { name: 'Edit profile' }).click();
  await w.waitForURL(/register/);
  await w.getByLabel('Short bio').fill('Strong and careful');
  await w.getByRole('button', { name: 'Save' }).click();
  await w.waitForURL(/\/w\/profile$/);
  await w.getByText('Strong and careful').waitFor();
});

await section('Separate logins: wrong-role numbers are refused', async () => {
  const x = await page('roles');
  await x.goto(B + '/login?as=customer');
  await x.getByLabel('Mobile number').fill('9999910001');
  await x.getByRole('button', { name: 'Send OTP' }).click();
  await x.getByLabel('Digit 1').fill('123456');
  await x.getByText('This number is registered as a Worker').waitFor();
  ok(x.url().includes('/login'), 'stays on login');
  await x.getByRole('tab', { name: /Admin/ }).click();
  await x.getByText('Admin login').waitFor();
  await x.getByLabel('Mobile number').fill('9999900001');
  await x.getByRole('button', { name: 'Send OTP' }).click();
  await x.getByLabel('Digit 1').fill('123456');
  await x.getByText('This number is registered as a Customer').waitFor();
  await x.getByLabel('Mobile number').fill('9876599999');
  await x.getByRole('button', { name: 'Send OTP' }).click();
  await x.getByLabel('Digit 1').fill('123456');
  await x.getByText('not an admin account').waitFor();
  await x.getByRole('tab', { name: /Worker/ }).click();
  ok(await x.getByRole('button', { name: /Ramesh Yadav/ }).count() === 1 && await x.getByRole('button', { name: /Amit Sharma/ }).count() === 0, 'demo list filtered by role');
  await x.close();
});

await section('Customer: quick job with photo + scheduled time, then cancel', async () => {
  await c.goto(B + '/c/post');
  await c.getByLabel('Job type').selectOption({ label: 'Cleaning' });
  await c.getByLabel(/^Title/).fill('Office clean');
  await c.locator('input[type=file]').setInputFiles(path.join(FIX, 'photo.jpg'));
  await c.getByRole('button', { name: 'Schedule' }).click();
  const d = new Date(Date.now() + 86400_000); const v = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await c.getByLabel('Start time').fill(v);
  await c.getByLabel('Estimated duration').selectOption('120');
  await c.getByText('₹650').waitFor(); // 2 × 300 + 2 × 25
  await c.getByRole('button', { name: 'Post Request' }).click();
  await c.waitForURL(/\/c\/jobs\//);
  await c.getByText('Finding nearby workers…').waitFor();
  await c.getByRole('button', { name: 'Cancel Request' }).click();
  await c.getByRole('dialog').getByRole('button', { name: 'Cancel Request' }).click();
  await c.waitForURL(/\/c$/);
  const s = await db(c);
  ok(s.jobs.find((j) => j.title === 'Office clean')?.status === 'cancelled', 'job cancelled');
  ok(!!s.jobs.find((j) => j.title === 'Office clean')?.photo_url?.startsWith('data:image'), 'photo stored');
});

await section('Full quick job: 2 workers, OTP lockout, extra time reject, pay fail then success, reviews', async () => {
  await logout(c);
  await loginAs(c, '9999900001'); // Amit
  await logout(w);
  await loginAs(w, '9999910001'); // Ramesh
  const w2 = await page('worker2');
  await loginAs(w2, '9999910002'); // Sohan
  await c.goto(B + '/c/post');
  await c.getByLabel('Job type').selectOption({ label: 'Loading & Unloading' });
  await c.getByLabel(/^Title/).fill('Two worker test');
  await c.getByRole('button', { name: 'Post Request' }).click();
  await c.waitForURL(/\/c\/jobs\//);
  const jobUrl = c.url();
  await w.getByText('New quick job nearby!').waitFor({ timeout: 8000 });
  await w.getByRole('button', { name: 'Accept Job' }).click();
  await w.waitForURL(/\/w\/bookings\//);
  await c.getByText('1 of 2 workers confirmed').waitFor({ timeout: 8000 });
  await w2.getByText('New quick job nearby!').waitFor({ timeout: 8000 });
  await w2.getByRole('button', { name: 'Accept Job' }).click();
  await w2.waitForURL(/\/w\/bookings\//);
  await c.getByText('All workers confirmed').waitFor({ timeout: 8000 });
  for (const wp of [w, w2]) {
    await wp.getByRole('button', { name: "I'm on the way" }).click();
    await wp.getByText('Enter customer Start OTP').waitFor();
  }
  await c.waitForTimeout(5500);
  ok(await c.locator('.leaflet-marker-icon').count() >= 3, 'map shows job + 2 workers');
  // OTP lockout for worker 1 (Ramesh)
  const r = card(c, 'Ramesh Yadav'), so = card(c, 'Sohan Kumar');
  await r.getByRole('button', { name: 'Show OTP' }).click();
  const otp = await otpOf(c, r);
  const bad = otp === '0000' ? '1111' : '0000';
  for (let i = 0; i < 3; i++) {
    await w.getByLabel('Digit 1').fill(bad);
    await w.getByRole('button', { name: 'Check In & Start Job' }).click();
    await w.waitForTimeout(400);
  }
  await w.getByLabel('Digit 1').fill(otp);
  await w.getByRole('button', { name: 'Check In & Start Job' }).click();
  await w.getByText(/Too many wrong tries/).waitFor();
  // a new OTP from the customer clears the lock
  await r.getByRole('button', { name: 'New OTP' }).click();
  await c.waitForTimeout(300);
  await w.getByLabel('Digit 1').fill(await otpOf(c, r));
  await w.getByRole('button', { name: 'Check In & Start Job' }).click();
  await w.getByText('Work in progress').waitFor({ timeout: 8000 });
  await so.getByRole('button', { name: 'Show OTP' }).click();
  await c.waitForTimeout(300);
  await w2.getByLabel('Digit 1').fill(await otpOf(c, so));
  await w2.getByRole('button', { name: 'Check In & Start Job' }).click();
  await w2.getByText('Work in progress').waitFor({ timeout: 8000 });
  await c.getByText('Elapsed time').waitFor();
  // extra time rejected
  await w.getByRole('button', { name: /Request Extra Time/ }).click();
  await r.getByRole('button', { name: 'Reject' }).click();
  await w.getByRole('button', { name: /Request Extra Time/ }).waitFor({ timeout: 8000 });
  // check out both
  for (const [wp, cd] of [[w, r], [w2, so]]) {
    const btn = cd.getByRole('button', { name: /Show OTP|New OTP/ }).first();
    await btn.click();
    await c.waitForTimeout(300);
    await wp.getByLabel('Digit 1').fill(await otpOf(c, cd));
    await wp.getByRole('button', { name: 'End Work' }).click();
    await wp.getByText('Work completed!').waitFor({ timeout: 8000 });
  }
  await c.getByText('Job completed successfully!').waitFor({ timeout: 8000 });
  await c.getByText('₹550').first().waitFor();
  await c.getByRole('link', { name: 'Pay ₹550' }).click();
  await c.getByRole('button', { name: 'Simulate failure' }).click();
  await c.getByText('Payment failed').waitFor({ timeout: 8000 });
  await c.getByRole('button', { name: 'Try again' }).click();
  await c.getByRole('button', { name: /Simulate success/ }).click();
  await c.getByText('Payment successful').waitFor({ timeout: 8000 });
  await c.getByRole('button', { name: 'Done' }).click();
  await c.waitForURL(jobUrl);
  await c.getByText('Receipt').waitFor();
  await c.getByRole('radio', { name: '4 star' }).first().click();
  await c.getByRole('button', { name: 'Submit review' }).click();
  await c.waitForTimeout(500);
  await c.getByRole('radio', { name: '5 star' }).first().click();
  await c.getByRole('button', { name: 'Submit review' }).click();
  await c.waitForTimeout(500);
  ok(await c.getByRole('button', { name: 'Submit review' }).count() === 0, 'both workers reviewed');
  await w.getByText('Payment received').waitFor({ timeout: 8000 });
  await w.getByRole('radio', { name: '5 star' }).click();
  await w.getByRole('button', { name: 'Submit review' }).click();
  await w.waitForTimeout(500);
  // complaint from job page
  await c.getByRole('button', { name: 'Raise a Complaint' }).first().click();
  await c.getByLabel('Describe the issue').fill('Test complaint');
  await c.getByRole('button', { name: 'Submit' }).click();
  await c.getByText('Complaint registered').waitFor();
  await c.keyboard.press('Escape');
  await w2.close();
});

await section('Customer search filters, profile, daily booking, accept, full flow at daily rate', async () => {
  await c.goto(B + '/c/workers');
  await c.getByText('Ramesh Yadav').waitFor();
  const before = await c.getByRole('link', { name: /per day/ }).count();
  await c.getByRole('button', { name: 'Filters' }).click();
  await c.getByRole('button', { name: '4.7+ ★' }).count(); // presence check is not required
  await c.getByRole('button', { name: '4.5+ ★' }).click();
  await c.waitForTimeout(400);
  const after = await c.getByRole('link', { name: /per day/ }).count();
  ok(after <= before && after > 0, `rating filter ${before}→${after}`);
  await c.getByRole('switch', { name: 'Available now' }).click();
  await c.getByRole('button', { name: 'Any' }).click();
  await c.getByRole('button', { name: 'Painter' }).click();
  await c.getByText('Dinesh Kumawat').waitFor({ timeout: 5000 });
  await c.getByRole('button', { name: 'Loading & Unloading' }).click();
  await c.getByRole('link', { name: /Ramesh Yadav/ }).click();
  await c.getByText('Very careful with the furniture').waitFor();
  await c.getByRole('link', { name: 'Book' }).click();
  await c.getByText('₹825').waitFor();
  await c.getByLabel('More days').click();
  await c.getByText('₹1,625').waitFor();
  await c.getByLabel('Fewer days').click();
  await c.getByRole('button', { name: 'Confirm Booking' }).click();
  await c.getByText(/Waiting for Ramesh/).waitFor({ timeout: 8000 });
  await w.goto(B + '/w');
  await w.getByText('New booking request!').waitFor({ timeout: 8000 });
  await w.getByRole('button', { name: 'Accept Job' }).click();
  await w.waitForURL(/\/w\/bookings\//);
  await c.getByRole('button', { name: 'Show OTP' }).waitFor({ timeout: 8000 });
  await c.getByRole('button', { name: 'Show OTP' }).click();
  const o = await otpOf(c);
  await w.getByRole('button', { name: "I'm on the way" }).click();
  await w.getByLabel('Digit 1').fill(o);
  await w.getByRole('button', { name: 'Check In & Start Job' }).click();
  await w.getByText('Work in progress').waitFor({ timeout: 8000 });
  await c.getByRole('button', { name: 'Show OTP' }).click();
  await c.waitForTimeout(300);
  await w.getByLabel('Digit 1').fill(await otpOf(c));
  await w.getByRole('button', { name: 'End Work' }).click();
  await c.getByRole('link', { name: 'Pay ₹825' }).waitFor({ timeout: 8000 });
});

await section('Direct booking expires after timeout', async () => {
  await c.goto(B + '/c/workers?');
  await c.getByRole('link', { name: /Sohan Kumar/ }).click();
  await c.getByRole('link', { name: 'Book' }).click();
  await c.getByRole('button', { name: 'Confirm Booking' }).click();
  await c.getByText(/Waiting for Sohan/).waitFor({ timeout: 8000 });
  await c.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('dinadena.mockdb.v1'));
    d.bookings.filter((b) => b.status === 'requested').forEach((b) => { b.expires_at = new Date(Date.now() - 1000).toISOString(); });
    localStorage.setItem('dinadena.mockdb.v1', JSON.stringify(d));
  });
  await c.reload();
  await c.getByText('The worker did not respond in time').waitFor({ timeout: 8000 });
});

await section('My bookings tabs, invoice, rebook prefill, notifications', async () => {
  await c.goto(B + '/c/bookings');
  await c.getByRole('tab', { name: 'Completed' }).click();
  await c.getByText('Two worker test').waitFor();
  await c.getByRole('tab', { name: 'Cancelled' }).click();
  await c.getByText('Install ceiling fan').waitFor();
  await c.getByRole('link', { name: 'Rebook' }).first().click();
  await c.waitForURL(/rebook=|\/book/);
  await c.goto(B + '/c/bookings');
  await c.getByRole('tab', { name: 'Completed' }).click();
  await c.getByRole('link', { name: /Two worker test/ }).click();
  await c.getByText('Receipt').waitFor();
  await c.goto(B + '/c/post?rebook=' + (await db(c)).jobs.find((j) => j.title === 'Two worker test').id);
  await c.waitForTimeout(500);
  ok((await c.getByLabel(/^Title/).inputValue()) === 'Two worker test', 'rebook prefilled');
  await c.goto(B + '/c/notifications');
  await c.getByText('Worker accepted your job').first().waitFor();
  await c.getByRole('button', { name: 'Mark all read' }).click();
  await c.waitForTimeout(400);
  ok(await c.getByRole('button', { name: 'Mark all read' }).count() === 0, 'all read');
});

await section('Worker earnings, my work tabs, notifications', async () => {
  await w.goto(B + '/w/earnings');
  await w.getByText('Two worker test').first().waitFor();
  await w.goto(B + '/w/bookings');
  await w.getByRole('tab', { name: 'Completed' }).click();
  await w.getByText('Two worker test').waitFor();
  await w.goto(B + '/w/notifications');
  await w.getByText('Payment received').first().waitFor();
});

await section('Admin: dashboard, requests filter/search, job detail, refund, dispute', async () => {
  await loginAs(a, '9999900000');
  await a.waitForURL(/\/admin$/);
  await a.getByText('Job demand trend').waitFor();
  await a.goto(B + '/admin/requests');
  await a.getByRole('button', { name: 'Completed' }).click();
  await a.getByLabel('Search jobs').fill('Two worker');
  await a.getByRole('link', { name: 'View' }).first().click();
  await a.getByText('Worker assignments (2/2)').waitFor();
  await a.getByRole('button', { name: 'Refund' }).first().click();
  await a.getByText('Refund recorded').waitFor();
  await a.getByRole('button', { name: 'Mark dispute' }).click();
  await a.getByLabel('Dispute note').fill('Customer disputes hours');
  await a.getByRole('button', { name: 'Create dispute' }).click();
  await a.getByText('Dispute opened').waitFor();
});

await section('Admin: workers approve / reject / suspend, rate override, ID doc', async () => {
  await a.goto(B + '/admin/workers?tab=pending');
  await a.getByText('Pappu Ram').waitFor();
  await a.getByRole('button', { name: 'Review' }).first().click();
  await a.getByRole('button', { name: 'Reject', exact: true }).click();
  await a.getByText('Add a reason').waitFor();
  await a.getByLabel(/Reason/).fill('ID unclear');
  await a.getByRole('button', { name: 'Reject', exact: true }).click();
  await a.waitForTimeout(500);
  await a.getByRole('button', { name: 'Review' }).first().click();
  await a.getByRole('button', { name: 'Approve', exact: true }).click();
  await a.waitForTimeout(500);
  await a.getByRole('button', { name: 'All', exact: true }).click();
  await a.getByLabel('Search workers').fill('Test Worker');
  await a.getByRole('button', { name: 'Manage' }).click();
  await a.getByRole('button', { name: /Aadhaar Card/ }).waitFor();
  await a.getByLabel(/Daily rate override/).fill('950');
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.waitForTimeout(400);
  await a.getByRole('button', { name: 'Manage' }).click();
  await a.getByLabel(/Reason/).fill('Test suspend');
  await a.getByRole('button', { name: 'Suspend', exact: true }).click();
  await a.waitForTimeout(400);
  const s = await db(a);
  const tw = s.worker_profiles.find((x) => s.profiles.find((p) => p.id === x.user_id)?.full_name === 'Test Worker');
  ok(tw.status === 'suspended' && tw.daily_rate === 950 && tw.available === false, 'worker suspended with rate');
  const pr = s.worker_profiles.find((x) => s.profiles.find((p) => p.id === x.user_id)?.full_name === 'Gopal Nath');
  ok(pr.status === 'rejected' || pr.status === 'approved', 'pending handled');
});

await section('Admin: customers, attendance, payments, complaints', async () => {
  await a.goto(B + '/admin/customers');
  await a.getByLabel('Search customers').fill('Amit');
  await a.getByText('Amit Sharma').waitFor();
  await a.goto(B + '/admin/attendance');
  await a.getByText('Check in').first().waitFor();
  await a.goto(B + '/admin/payments');
  await a.getByRole('button', { name: 'refunded' }).click();
  await a.getByText('refunded').nth(1).waitFor();
  await a.goto(B + '/admin/complaints');
  await a.getByText('Test complaint').waitFor();
  await a.getByRole('button', { name: 'Handle' }).first().click();
  await a.getByLabel('Status').selectOption('resolved');
  await a.getByLabel('Admin note').fill('Spoke to both');
  await a.getByRole('button', { name: 'Save' }).click();
  await a.waitForTimeout(500);
});

await section('Admin profile page', async () => {
  await a.getByLabel('My profile').click();
  await a.waitForURL(/admin\/profile/);
  await a.getByLabel('Full name').fill('Ops Admin');
  await a.getByRole('button', { name: 'Save' }).click();
  await a.getByText('Saved').waitFor();
});

await section('Admin: categories add/edit/deactivate, settings change reflects in quotes', async () => {
  await a.goto(B + '/admin/categories');
  await a.getByRole('button', { name: 'Add category' }).click();
  await a.getByLabel('Name (English)').fill('Carpenter');
  await a.getByLabel('Name (Hindi)').fill('बढ़ई');
  await a.getByLabel('Daily rate ₹').fill('1100');
  await a.getByLabel('Hourly rate ₹').fill('300');
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.getByText('Carpenter').waitFor();
  await a.getByRole('switch', { name: 'Carpenter active' }).click();
  await a.waitForTimeout(300);
  await a.getByLabel('Platform fee per worker ₹').fill('30');
  await a.getByRole('button', { name: 'Save settings' }).click();
  await a.getByText('Saved').waitFor();
  await c.goto(B + '/c/post');
  await c.getByLabel('Job type').selectOption({ label: 'Loading & Unloading' });
  await c.getByText('₹560').waitFor(); // 2 × 250 + 2 × 30
  ok(!(await c.getByLabel('Job type').innerText()).includes('Carpenter'), 'inactive category hidden');
});

await section('Admin: reports CSV export', async () => {
  await a.goto(B + '/admin/reports');
  const [d1] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Bookings CSV' }).click()]);
  const t1 = fs.readFileSync(await d1.path(), 'utf8');
  ok(t1.startsWith('booking_id,job_code') && t1.split('\n').length > 3, 'bookings csv');
  const [d2] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Payments CSV' }).click()]);
  ok(fs.readFileSync(await d2.path(), 'utf8').includes('refunded'), 'payments csv');
});

await section('Logout, Hindi customer screens render, reset demo data', async () => {
  await logout(a);
  await c.goto(B + '/c/profile');
  await c.getByRole('tab', { name: 'हिन्दी' }).click();
  await c.goto(B + '/c');
  await c.getByText('लोकप्रिय काम').waitFor();
  await c.goto(B + '/c/profile');
  await c.getByRole('tab', { name: 'English' }).click();
  await logout(w);
  await w.getByRole('button', { name: 'Reset demo data' }).click();
  const s = await db(w);
  ok(!s.jobs.some((j) => j.title === 'Two worker test'), 'reset restored seed');
});

console.log(`\nPASSED ${passes.length}`);
console.log(`FAILED ${fails.length}${fails.length ? '\n  ' + fails.join('\n  ') : ''}`);
console.log(`PAGE ERRORS ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].join('\n  ') : ''}`);
await browser.close();
process.exitCode = fails.length || errors.length ? 1 : 0;
