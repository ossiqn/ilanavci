const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'ilanavci.db');
let db;

function initDatabase() {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -8000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'r10',
      category TEXT DEFAULT '',
      keywords TEXT NOT NULL,
      exclude_keywords TEXT DEFAULT '',
      min_price REAL DEFAULT 0,
      max_price REAL DEFAULT 999999,
      check_interval INTEGER DEFAULT 5,
      notify_telegram INTEGER DEFAULT 0,
      notify_desktop INTEGER DEFAULT 1,
      notify_sound INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      total_found INTEGER DEFAULT 0,
      last_check TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watcher_id INTEGER,
      platform TEXT NOT NULL,
      external_id TEXT,
      title TEXT NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'TL',
      seller TEXT,
      seller_id TEXT,
      url TEXT NOT NULL,
      description TEXT,
      category TEXT,
      images TEXT DEFAULT '[]',
      extra_data TEXT DEFAULT '{}',
      first_seen TEXT DEFAULT (datetime('now','localtime')),
      last_seen TEXT DEFAULT (datetime('now','localtime')),
      price_history TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      is_bookmarked INTEGER DEFAULT 0,
      FOREIGN KEY (watcher_id) REFERENCES watchers(id) ON DELETE SET NULL,
      UNIQUE(platform, external_id)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watcher_id INTEGER,
      listing_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      severity TEXT DEFAULT 'info',
      platform TEXT DEFAULT '',
      listing_url TEXT DEFAULT '',
      listing_price REAL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (watcher_id) REFERENCES watchers(id) ON DELETE CASCADE,
      FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      seller_id TEXT DEFAULT '',
      seller_name TEXT NOT NULL,
      total_listings INTEGER DEFAULT 0,
      avg_price REAL DEFAULT 0,
      min_price REAL DEFAULT 0,
      max_price REAL DEFAULT 0,
      first_seen TEXT DEFAULT (datetime('now','localtime')),
      last_seen TEXT DEFAULT (datetime('now','localtime')),
      notes TEXT DEFAULT '',
      is_flagged INTEGER DEFAULT 0,
      UNIQUE(platform, seller_name)
    );

    CREATE TABLE IF NOT EXISTS price_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      old_price REAL,
      new_price REAL,
      change_percent REAL,
      direction TEXT DEFAULT 'down',
      detected_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_listings_platform ON listings(platform);
    CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller);
    CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
    CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(is_active);
    CREATE INDEX IF NOT EXISTS idx_listings_first_seen ON listings(first_seen);
    CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(is_read, created_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
    CREATE INDEX IF NOT EXISTS idx_sellers_name ON sellers(seller_name);
    CREATE INDEX IF NOT EXISTS idx_price_changes_listing ON price_changes(listing_id);
  `);

  return db;
}

function createWatcher(data) {
  const stmt = db.prepare(`
    INSERT INTO watchers (name, platform, category, keywords, exclude_keywords, min_price, max_price, check_interval, notify_telegram, notify_desktop, notify_sound)
    VALUES (@name, @platform, @category, @keywords, @exclude_keywords, @min_price, @max_price, @check_interval, @notify_telegram, @notify_desktop, @notify_sound)
  `);

  const info = stmt.run({
    name: data.name,
    platform: data.platform || 'r10',
    category: data.category || '',
    keywords: data.keywords,
    exclude_keywords: data.exclude_keywords || '',
    min_price: data.min_price || 0,
    max_price: data.max_price || 999999,
    check_interval: data.check_interval || 5,
    notify_telegram: data.notify_telegram ? 1 : 0,
    notify_desktop: data.notify_desktop !== false ? 1 : 0,
    notify_sound: data.notify_sound !== false ? 1 : 0
  });

  return getWatcherById(info.lastInsertRowid);
}

function getWatcherById(id) {
  return db.prepare('SELECT * FROM watchers WHERE id = ?').get(id);
}

function getWatchers() {
  return db.prepare('SELECT * FROM watchers ORDER BY created_at DESC').all();
}

function getActiveWatchers() {
  return db.prepare('SELECT * FROM watchers WHERE active = 1 ORDER BY last_check ASC NULLS FIRST').all();
}

function updateWatcher(id, data) {
  const fields = [];
  const values = {};

  ['name', 'platform', 'category', 'keywords', 'exclude_keywords', 'min_price', 'max_price', 'check_interval', 'notify_telegram', 'notify_desktop', 'notify_sound'].forEach(key => {
    if (data[key] !== undefined) {
      fields.push(`${key} = @${key}`);
      values[key] = data[key];
    }
  });

  if (fields.length === 0) return getWatcherById(id);

  fields.push("updated_at = datetime('now','localtime')");
  values.id = id;

  db.prepare(`UPDATE watchers SET ${fields.join(', ')} WHERE id = @id`).run(values);
  return getWatcherById(id);
}

function deleteWatcher(id) {
  db.prepare('DELETE FROM watchers WHERE id = ?').run(id);
  return { success: true };
}

function toggleWatcher(id) {
  db.prepare("UPDATE watchers SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now','localtime') WHERE id = ?").run(id);
  return getWatcherById(id);
}

function updateWatcherLastCheck(id, totalFound) {
  db.prepare("UPDATE watchers SET last_check = datetime('now','localtime'), total_found = ? WHERE id = ?").run(totalFound || 0, id);
}

function upsertListing(listing) {
  const existing = db.prepare('SELECT * FROM listings WHERE platform = ? AND external_id = ?').get(listing.platform, listing.external_id);

  if (existing) {
    let priceHistory = [];
    try { priceHistory = JSON.parse(existing.price_history || '[]'); } catch (e) { priceHistory = []; }

    let priceChanged = false;
    let oldPrice = existing.price;

    if (existing.price !== listing.price && listing.price !== null && listing.price !== undefined) {
      priceChanged = true;
      priceHistory.push({ price: existing.price, date: existing.last_seen });

      if (priceHistory.length > 50) {
        priceHistory = priceHistory.slice(-50);
      }

      const direction = listing.price < existing.price ? 'down' : 'up';
      const changePercent = existing.price > 0 ? (((listing.price - existing.price) / existing.price) * 100) : 0;

      db.prepare('INSERT INTO price_changes (listing_id, old_price, new_price, change_percent, direction) VALUES (?, ?, ?, ?, ?)').run(
        existing.id, existing.price, listing.price, changePercent.toFixed(2), direction
      );
    }

    db.prepare(`
      UPDATE listings SET
        title = ?, price = COALESCE(?, price), seller = COALESCE(?, seller),
        seller_id = COALESCE(?, seller_id), description = COALESCE(?, description),
        images = COALESCE(?, images), extra_data = COALESCE(?, extra_data),
        last_seen = datetime('now','localtime'), price_history = ?, is_active = 1
      WHERE id = ?
    `).run(
      listing.title, listing.price, listing.seller, listing.seller_id,
      listing.description, listing.images, listing.extra_data,
      JSON.stringify(priceHistory), existing.id
    );

    return {
      id: existing.id,
      isNew: false,
      updated: true,
      priceChanged: priceChanged,
      oldPrice: oldPrice,
      newPrice: listing.price,
      listing: { ...existing, ...listing }
    };
  }

  const info = db.prepare(`
    INSERT INTO listings (watcher_id, platform, external_id, title, price, currency, seller, seller_id, url, description, category, images, extra_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    listing.watcher_id, listing.platform, listing.external_id,
    listing.title, listing.price, listing.currency || 'TL',
    listing.seller, listing.seller_id, listing.url,
    listing.description, listing.category,
    listing.images || '[]', listing.extra_data || '{}'
  );

  return {
    id: info.lastInsertRowid,
    isNew: true,
    updated: false,
    priceChanged: false,
    listing: listing
  };
}

function createAlert(data) {
  const info = db.prepare(`
    INSERT INTO alerts (watcher_id, listing_id, type, title, message, severity, platform, listing_url, listing_price)
    VALUES (@watcher_id, @listing_id, @type, @title, @message, @severity, @platform, @listing_url, @listing_price)
  `).run({
    watcher_id: data.watcher_id || null,
    listing_id: data.listing_id || null,
    type: data.type,
    title: data.title,
    message: data.message || '',
    severity: data.severity || 'info',
    platform: data.platform || '',
    listing_url: data.listing_url || '',
    listing_price: data.listing_price || null
  });

  return { id: info.lastInsertRowid, ...data };
}

function getAlerts(filters = {}) {
  let query = 'SELECT a.*, w.name as watcher_name FROM alerts a LEFT JOIN watchers w ON a.watcher_id = w.id';
  const conditions = [];
  const params = [];

  if (filters.unread) {
    conditions.push('a.is_read = 0');
  }
  if (filters.type) {
    conditions.push('a.type = ?');
    params.push(filters.type);
  }
  if (filters.severity) {
    conditions.push('a.severity = ?');
    params.push(filters.severity);
  }
  if (filters.watcher_id) {
    conditions.push('a.watcher_id = ?');
    params.push(filters.watcher_id);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY a.created_at DESC LIMIT ?';
  params.push(filters.limit || 300);

  return db.prepare(query).all(...params);
}

function markAlertRead(id) {
  db.prepare('UPDATE alerts SET is_read = 1 WHERE id = ?').run(id);
  return { success: true };
}

function markAllAlertsRead() {
  db.prepare('UPDATE alerts SET is_read = 1 WHERE is_read = 0').run();
  return { success: true };
}

function deleteAlert(id) {
  db.prepare('DELETE FROM alerts WHERE id = ?').run(id);
  return { success: true };
}

function getUnreadAlertCount() {
  const row = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE is_read = 0').get();
  return row.count;
}

function getListings(filters = {}) {
  let query = 'SELECT l.*, w.name as watcher_name FROM listings l LEFT JOIN watchers w ON l.watcher_id = w.id';
  const conditions = [];
  const params = [];

  if (filters.platform) {
    conditions.push('l.platform = ?');
    params.push(filters.platform);
  }
  if (filters.search) {
    conditions.push('(l.title LIKE ? OR l.description LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.seller) {
    conditions.push('l.seller = ?');
    params.push(filters.seller);
  }
  if (filters.min_price !== undefined && filters.min_price !== '') {
    conditions.push('l.price >= ?');
    params.push(parseFloat(filters.min_price));
  }
  if (filters.max_price !== undefined && filters.max_price !== '') {
    conditions.push('l.price <= ?');
    params.push(parseFloat(filters.max_price));
  }
  if (filters.bookmarked) {
    conditions.push('l.is_bookmarked = 1');
  }
  if (filters.active !== undefined) {
    conditions.push('l.is_active = ?');
    params.push(filters.active ? 1 : 0);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const orderMap = {
    'newest': 'l.first_seen DESC',
    'oldest': 'l.first_seen ASC',
    'price_asc': 'l.price ASC',
    'price_desc': 'l.price DESC',
    'updated': 'l.last_seen DESC'
  };

  query += ' ORDER BY ' + (orderMap[filters.sort] || 'l.first_seen DESC');
  query += ' LIMIT ?';
  params.push(filters.limit || 500);

  return db.prepare(query).all(...params);
}

function getListingDetail(id) {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing) return null;

  const priceChanges = db.prepare('SELECT * FROM price_changes WHERE listing_id = ? ORDER BY detected_at DESC').all(id);

  return { ...listing, priceChanges };
}

function getSellerHistory(seller) {
  const listings = db.prepare('SELECT * FROM listings WHERE seller = ? ORDER BY first_seen DESC LIMIT 200').all(seller);

  const sellerProfile = db.prepare('SELECT * FROM sellers WHERE seller_name = ?').get(seller);

  const prices = listings.filter(l => l.price > 0).map(l => l.price);
  const stats = {
    totalListings: listings.length,
    avgPrice: prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
    minPrice: prices.length > 0 ? Math.min(...prices) : 0,
    maxPrice: prices.length > 0 ? Math.max(...prices) : 0
  };

  return { listings, profile: sellerProfile, stats };
}

function upsertSeller(data) {
  const existing = db.prepare('SELECT * FROM sellers WHERE platform = ? AND seller_name = ?').get(data.platform, data.seller_name);

  if (existing) {
    db.prepare(`
      UPDATE sellers SET
        total_listings = ?, avg_price = ?, min_price = ?, max_price = ?,
        last_seen = datetime('now','localtime')
      WHERE id = ?
    `).run(data.total_listings, data.avg_price, data.min_price || 0, data.max_price || 0, existing.id);
    return existing;
  }

  const info = db.prepare(`
    INSERT INTO sellers (platform, seller_id, seller_name, total_listings, avg_price, min_price, max_price)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.platform, data.seller_id || '', data.seller_name, data.total_listings || 0, data.avg_price || 0, data.min_price || 0, data.max_price || 0);

  return { id: info.lastInsertRowid };
}

function getDashboardStats() {
  const activeWatchers = db.prepare('SELECT COUNT(*) as c FROM watchers WHERE active = 1').get().c;
  const totalWatchers = db.prepare('SELECT COUNT(*) as c FROM watchers').get().c;
  const totalListings = db.prepare('SELECT COUNT(*) as c FROM listings').get().c;
  const todayListings = db.prepare("SELECT COUNT(*) as c FROM listings WHERE date(first_seen) = date('now','localtime')").get().c;
  const unreadAlerts = db.prepare('SELECT COUNT(*) as c FROM alerts WHERE is_read = 0').get().c;
  const totalAlerts = db.prepare('SELECT COUNT(*) as c FROM alerts').get().c;
  const priceDropsToday = db.prepare("SELECT COUNT(*) as c FROM price_changes WHERE direction = 'down' AND date(detected_at) = date('now','localtime')").get().c;
  const avgPriceRow = db.prepare('SELECT AVG(price) as avg FROM listings WHERE price > 0').get();
  const avgPrice = avgPriceRow.avg ? avgPriceRow.avg.toFixed(0) : '0';

  const recentAlerts = db.prepare(`
    SELECT a.*, w.name as watcher_name
    FROM alerts a LEFT JOIN watchers w ON a.watcher_id = w.id
    ORDER BY a.created_at DESC LIMIT 15
  `).all();

  const recentListings = db.prepare(`
    SELECT l.*, w.name as watcher_name
    FROM listings l LEFT JOIN watchers w ON l.watcher_id = w.id
    ORDER BY l.first_seen DESC LIMIT 15
  `).all();

  const topDrops = db.prepare(`
    SELECT pc.*, l.title, l.url, l.platform, l.seller
    FROM price_changes pc
    JOIN listings l ON pc.listing_id = l.id
    WHERE pc.direction = 'down'
    ORDER BY ABS(pc.change_percent) DESC
    LIMIT 10
  `).all();

  const platformStats = db.prepare(`
    SELECT platform, COUNT(*) as count, AVG(price) as avg_price, MIN(price) as min_price, MAX(price) as max_price
    FROM listings WHERE price > 0 GROUP BY platform
  `).all();

  const hourlyActivity = db.prepare(`
    SELECT strftime('%H', first_seen) as hour, COUNT(*) as count
    FROM listings WHERE date(first_seen) >= date('now', '-7 days', 'localtime')
    GROUP BY hour ORDER BY hour
  `).all();

  return {
    activeWatchers, totalWatchers, totalListings, todayListings,
    unreadAlerts, totalAlerts, priceDropsToday, avgPrice,
    recentAlerts, recentListings, topDrops, platformStats, hourlyActivity
  };
}

module.exports = {
  initDatabase,
  createWatcher, getWatchers, getActiveWatchers, getWatcherById,
  updateWatcher, deleteWatcher, toggleWatcher, updateWatcherLastCheck,
  upsertListing,
  createAlert, getAlerts, markAlertRead, markAllAlertsRead, deleteAlert, getUnreadAlertCount,
  getListings, getListingDetail, getSellerHistory,
  upsertSeller,
  getDashboardStats
};