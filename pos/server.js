const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createSimulator } = require('./src/simulator');

const PORT = process.env.PORT || 4010;
const JWT_SECRET = process.env.JWT_SECRET || 'pos-simulator-demo-secret';
const SIMULATION_INTERVAL_MS = Number(process.env.SIMULATION_INTERVAL_MS || 15000);

const app = express();
const simulator = createSimulator({ intervalMs: SIMULATION_INTERVAL_MS });

app.use(cors());
app.use(express.json({ limit: '3mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Missing bearer token.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== 'sam' || password !== 'password123') {
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }
  const token = jwt.sign(
    { username: 'sam', role: 'pos_manager', provider: 'ShelfSafe POS Simulator' },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    success: true,
    token,
    user: {
      username: 'sam',
      displayName: 'Sam POS Manager',
      provider: 'ShelfSafe POS Simulator'
    },
    sync: simulator.getSyncState(),
    collectionCounts: simulator.getCollectionCounts()
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', serverTime: new Date().toISOString() });
});

app.get('/api/simulator/status', authRequired, (_req, res) => {
  res.json({ success: true, ...simulator.getDashboardState() });
});

app.get('/api/simulator/config', authRequired, (_req, res) => {
  res.json({ success: true, config: simulator.getConfig(), sync: simulator.getSyncState(), collectionCounts: simulator.getCollectionCounts() });
});

app.post('/api/simulator/config', authRequired, (req, res) => {
  const requestedCount = Number(req.body?.itemCount);
  if (!Number.isFinite(requestedCount)) {
    return res.status(400).json({ success: false, message: 'itemCount must be a number.' });
  }
  const result = simulator.reseed(requestedCount);
  res.json({ success: true, message: 'Simulator item count updated.', config: simulator.getConfig(), ...result });
});

app.get('/api/inventory', authRequired, (req, res) => {
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 250)));
  const items = simulator.getInventory().slice(0, limit);
  res.json({
    success: true,
    inventoryVersion: simulator.getSyncState().cursor,
    totalItems: simulator.getInventoryCount(),
    items
  });
});

app.get('/api/activity', authRequired, (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 25)));
  res.json({ success: true, items: simulator.getRecentActivity(limit) });
});

app.get('/api/bootstrap/full-dataset', authRequired, (_req, res) => {
  const payload = simulator.getBootstrapPayload();
  res.json({ success: true, ...payload });
});

app.get('/api/sync/changes', authRequired, (req, res) => {
  const sinceCursor = Number(req.query.cursor || 0);
  res.json({ success: true, ...simulator.getEntityChangesSince(sinceCursor) });
});

app.get('/api/inventory/changes', authRequired, (req, res) => {
  const sinceCursor = Number(req.query.cursor || 0);
  res.json({ success: true, ...simulator.getInventoryChangesSince(sinceCursor) });
});

app.post('/api/simulator/force-change', authRequired, (_req, res) => {
  const batch = simulator.runMutationCycle(true);
  res.json({ success: true, message: 'Forced a simulation cycle.', batch });
});

app.post('/api/simulator/reset-changes', authRequired, (_req, res) => {
  simulator.clearChangeQueues();
  res.json({ success: true, message: 'Pending change queues cleared.', sync: simulator.getSyncState() });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`POS simulator running at http://localhost:${PORT}`);
  console.log('Demo login -> username: sam | password: password123');
  console.log(`Automatic stock mutation interval: ${SIMULATION_INTERVAL_MS / 1000}s`);
});
