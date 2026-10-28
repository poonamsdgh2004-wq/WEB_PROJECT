const CATEGORIES = ['Community', 'Education', 'Health', 'Animals', 'Environment', 'Emergency', 'Other'];
const $ = (s, r = document) => r.querySelector(s);
const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let campaigns = [], donateId = null;

// ---------- API ----------
async function api(url, options) {
  let res;
  try {
    res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  } catch { throw { message: 'Cannot reach the server. Check your connection and try again.' }; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { message: data.error || 'Please fix the highlighted fields.', fields: data.errors };
  return data;
}

// ---------- Toasts ----------
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- Rendering ----------
function render() {
  const q = $('#search').value.trim().toLowerCase();
  const cat = $('#filterCat').value, sort = $('#sort').value;
  const pct = (c) => c.raised / c.goal;
  let list = campaigns.filter((c) => (!cat || c.category === cat) && (!q || (c.title + c.description + c.creator).toLowerCase().includes(q)));
  if (sort === 'progress') list.sort((a, b) => pct(b) - pct(a));
  if (sort === 'raised') list.sort((a, b) => b.raised - a.raised);

  $('#grid').innerHTML = list.length ? list.map((c) => {
    const p = Math.min(100, Math.round(pct(c) * 100));
    return `<article class="card">
      <span class="tag">${esc(c.category)}</span>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.description)}</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${p}% funded"><i style="width:${p}%"></i></div>
      <div class="nums"><span><strong>${fmt(c.raised)}</strong> <span class="muted">of ${fmt(c.goal)}</span></span>
        <span class="${p >= 100 ? 'done' : ''}">${p >= 100 ? 'Goal reached' : p + '%'}</span></div>
      <div class="meta">by ${esc(c.creator)} • ${c.donations.length} donation${c.donations.length === 1 ? '' : 's'}</div>
      <button class="btn primary" data-donate="${esc(c.id)}">Donate</button>
    </article>`;
  }).join('') : '<div class="empty">No campaigns match. Try a different search, or start the first one.</div>';

  $('#statRaised').textContent = fmt(campaigns.reduce((s, c) => s + c.raised, 0));
  $('#statCount').textContent = campaigns.length;
  $('#statDonors').textContent = campaigns.reduce((s, c) => s + c.donations.length, 0);
}

async function load() {
  try { campaigns = await api('/api/campaigns'); render(); }
  catch (e) { toast(e.message, 'bad'); $('#grid').innerHTML = '<div class="empty">Campaigns could not be loaded.</div>'; }
}

// ---------- Forms ----------
function clearErrors(form) {
  form.querySelectorAll('.err').forEach((s) => (s.textContent = ''));
  form.querySelectorAll('.invalid').forEach((i) => i.classList.remove('invalid'));
}
function showErrors(form, errors) {
  for (const [name, msg] of Object.entries(errors)) {
    const field = form.elements[name];
    if (!field) continue;
    field.classList.add('invalid');
    field.closest('label').querySelector('.err').textContent = msg;
  }
}
function checkCreate(v) {
  const e = {};
  if (v.title.length < 5) e.title = 'Title must be at least 5 characters.';
  if (v.creator.length < 2) e.creator = 'Enter your name.';
  if (!CATEGORIES.includes(v.category)) e.category = 'Choose a category.';
  if (!(Number(v.goal) >= 1000)) e.goal = 'Goal must be at least ₹1,000.';
  if (v.description.length < 20) e.description = 'Tell your story in at least 20 characters.';
  return e;
}
function checkDonate(v) {
  const e = {};
  if (!(Number(v.amount) >= 10)) e.amount = 'Donation must be at least ₹10.';
  return e;
}

async function submit(form, url, validate, onDone, okMsg) {
  clearErrors(form);
  const values = Object.fromEntries(new FormData(form));
  Object.keys(values).forEach((k) => (values[k] = String(values[k]).trim()));
  const errors = validate(values);
  if (Object.keys(errors).length) { showErrors(form, errors); form.querySelector('.invalid')?.focus(); return; }
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const result = await api(url, { method: 'POST', body: JSON.stringify(values) });
    form.closest('dialog').close(); form.reset();
    onDone(result); toast(okMsg(result));
  } catch (e) {
    if (e.fields) showErrors(form, e.fields);
    toast(e.message, 'bad');
  } finally { btn.disabled = false; }
}

// ---------- Events ----------
$('#catSelect').innerHTML = '<option value="">Select…</option>' + CATEGORIES.map((c) => `<option>${c}</option>`).join('');
$('#filterCat').insertAdjacentHTML('beforeend', CATEGORIES.map((c) => `<option>${c}</option>`).join(''));
['search', 'filterCat', 'sort'].forEach((id) => $('#' + id).addEventListener('input', render));

$('#openCreate').onclick = () => $('#createDlg').showModal();
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));

$('#grid').addEventListener('click', (e) => {
  const id = e.target.dataset.donate;
  if (!id) return;
  const c = campaigns.find((x) => x.id === id);
  donateId = id;
  $('#donateTitle').textContent = 'Donate to ' + c.title;
  clearErrors($('#donateForm'));
  $('#donateDlg').showModal();
});
$('#chips').addEventListener('click', (e) => {
  if (!e.target.dataset.amt) return;
  $('#donateForm').elements.amount.value = e.target.dataset.amt;
});

$('#createForm').addEventListener('submit', (e) => {
  e.preventDefault();
  submit(e.target, '/api/campaigns', checkCreate, (c) => { campaigns.unshift(c); render(); }, () => 'Campaign published.');
});
$('#donateForm').addEventListener('submit', (e) => {
  e.preventDefault();
  submit(e.target, `/api/campaigns/${donateId}/donate`, checkDonate,
    (c) => { campaigns = campaigns.map((x) => (x.id === c.id ? c : x)); render(); },
    (c) => `Thank you. Your donation to "${c.title}" was recorded.`);
});

load();
