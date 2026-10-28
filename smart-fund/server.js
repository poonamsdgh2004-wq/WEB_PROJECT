const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'campaigns.json');
const CATEGORIES = ['Community', 'Education', 'Health', 'Animals', 'Environment', 'Emergency', 'Other'];

app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- JSON file storage (writes are serialized to avoid corruption) ---
let queue = Promise.resolve();
async function readCampaigns() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
function withData(fn) {
  const run = queue.then(async () => {
    const campaigns = await readCampaigns();
    const result = await fn(campaigns);
    await fs.writeFile(DATA_FILE, JSON.stringify(campaigns, null, 2));
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
class HttpError extends Error { constructor(status, errors) { super('Validation failed'); this.status = status; this.errors = errors; } }

// --- Routes ---
app.get('/api/campaigns', async (req, res, next) => {
  try {
    const list = await readCampaigns();
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(list);
  } catch (e) { next(e); }
});

app.get('/api/campaigns/:id', async (req, res, next) => {
  try {
    const c = (await readCampaigns()).find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Campaign not found.' });
    res.json(c);
  } catch (e) { next(e); }
});

app.post('/api/campaigns', async (req, res, next) => {
  try {
    const title = clean(req.body.title), description = clean(req.body.description);
    const creator = clean(req.body.creator), category = clean(req.body.category);
    const goal = Number(req.body.goal);
    const errors = {};
    if (title.length < 5 || title.length > 80) errors.title = 'Title must be 5–80 characters.';
    if (description.length < 20 || description.length > 600) errors.description = 'Description must be 20–600 characters.';
    if (creator.length < 2 || creator.length > 50) errors.creator = 'Enter your name (2–50 characters).';
    if (!CATEGORIES.includes(category)) errors.category = 'Choose a category.';
    if (!Number.isFinite(goal) || goal < 1000 || goal > 100000000) errors.goal = 'Goal must be between ₹1,000 and ₹10,00,00,000.';
    if (Object.keys(errors).length) throw new HttpError(400, errors);

    const campaign = { id: crypto.randomUUID(), title, description, category, creator, goal: Math.round(goal), raised: 0, createdAt: new Date().toISOString(), donations: [] };
    await withData((list) => { list.push(campaign); });
    res.status(201).json(campaign);
  } catch (e) { next(e); }
});

app.post('/api/campaigns/:id/donate', async (req, res, next) => {
  try {
    const name = clean(req.body.name) || 'Anonymous';
    const message = clean(req.body.message);
    const amount = Number(req.body.amount);
    const errors = {};
    if (name.length > 50) errors.name = 'Name must be 50 characters or fewer.';
    if (message.length > 200) errors.message = 'Message must be 200 characters or fewer.';
    if (!Number.isFinite(amount) || amount < 10 || amount > 10000000) errors.amount = 'Donation must be between ₹10 and ₹1,00,00,000.';
    if (Object.keys(errors).length) throw new HttpError(400, errors);

    const updated = await withData((list) => {
      const c = list.find((x) => x.id === req.params.id);
      if (!c) throw new HttpError(404, { error: 'Campaign not found.' });
      const donation = { name, amount: Math.round(amount), message, at: new Date().toISOString() };
      c.donations.push(donation);
      c.raised += donation.amount;
      return c;
    });
    res.status(201).json(updated);
  } catch (e) { next(e); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json(err.errors.error ? err.errors : { error: err.message, errors: err.errors });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => console.log(`Smart Fund running at http://localhost:${PORT}`));
