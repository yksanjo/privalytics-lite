const express = require('express');
const initSqlJs = require('sql.js');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'privalytics-lite.db');

let db;

async function initDB() {
  const SQL = await initSqlJs();
  
  try {
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  } catch (e) {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      session_hash TEXT NOT NULL,
      path TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (site_id) REFERENCES sites(id)
    )
  `);

  saveDB();
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function generateSessionHash(ip, date) {
  const data = `${ip}:${date}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// TRACKING - Lite version: only tracks pageviews
app.post('/api/track', (req, res) => {
  try {
    const { siteId, path: pagePath = '/' } = req.body;
    
    if (!siteId) {
      return res.status(400).json({ error: 'Site ID required' });
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const today = getDateString();
    const sessionHash = generateSessionHash(ip, today);

    db.run(`
      INSERT INTO events (site_id, session_hash, path)
      VALUES (?, ?, ?)
    `, [siteId, sessionHash, pagePath]);

    saveDB();
    res.status(204).end();
  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).end();
  }
});

// SITES API
app.get('/api/sites', (req, res) => {
  try {
    const results = db.exec('SELECT * FROM sites ORDER BY created_at DESC');
    const sites = results.length > 0 ? results[0].values.map(row => ({
      id: row[0],
      name: row[1],
      domain: row[2],
      created_at: row[3]
    })) : [];
    res.json(sites);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

app.post('/api/sites', (req, res) => {
  try {
    const { name, domain } = req.body;
    
    if (!name || !domain) {
      return res.status(400).json({ error: 'Name and domain required' });
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();
    db.run('INSERT INTO sites (id, name, domain, created_at) VALUES (?, ?, ?, ?)', 
      [id, name, domain, createdAt]);
    saveDB();

    res.status(201).json({ id, name, domain, created_at: createdAt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create site' });
  }
});

// BASIC STATS - Only total visitors and views
app.get('/api/sites/:id/stats', (req, res) => {
  try {
    const { id } = req.params;

    const visitorsResult = db.exec(`
      SELECT COUNT(DISTINCT session_hash) as count
      FROM events
      WHERE site_id = ?
    `, [id]);
    const visitors = visitorsResult.length > 0 ? visitorsResult[0].values[0][0] : 0;

    const viewsResult = db.exec(`
      SELECT COUNT(*) as count
      FROM events
      WHERE site_id = ?
    `, [id]);
    const views = viewsResult.length > 0 ? viewsResult[0].values[0][0] : 0;

    res.json({
      visitors: visitors || 0,
      views: views || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// TIME SERIES - Only views over time
app.get('/api/sites/:id/timeseries', (req, res) => {
  try {
    const { id } = req.params;

    const results = db.exec(`
      SELECT DATE(timestamp) as date, COUNT(*) as count
      FROM events
      WHERE site_id = ?
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
      LIMIT 30
    `, [id]);

    const data = results.length > 0 ? results[0].values.map(row => ({
      date: row[0],
      count: row[1]
    })).reverse() : [];

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timeseries' });
  }
});

// TOP PAGES
app.get('/api/sites/:id/pages', (req, res) => {
  try {
    const { id } = req.params;

    const results = db.exec(`
      SELECT path, COUNT(*) as views
      FROM events
      WHERE site_id = ?
      GROUP BY path
      ORDER BY views DESC
      LIMIT 10
    `, [id]);

    const pages = results.length > 0 ? results[0].values.map(row => ({
      path: row[0],
      views: row[1]
    })) : [];

    res.json(pages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

// TRACKING SCRIPT - Ultra minimal
app.get('/script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
(function() {
  var siteId = document.currentScript?.getAttribute('data-site-id') || '';
  var path = window.location.pathname;
  navigator.sendBeacon('/api/track', JSON.stringify({ siteId: siteId, path: path }));
})();
  `.trim());
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Privalytics Lite running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
