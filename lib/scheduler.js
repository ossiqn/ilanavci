const cron = require('node-cron');
const Store = require('electron-store');
const r10 = require('./platforms/r10');
const db = require('./database');
const analyzer = require('./analyzer');
const notifier = require('./notifier');

const store = new Store();

const PLATFORMS = { r10: r10 };

let tasks = [];
let scanning = false;
let firstScan = {};
let isRunning = false;

function sendToRenderer(win, channel, data) {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, data); } catch (e) {}
  }
}

function isRecentListing(dateStr, hoursLimit) {
  if (!dateStr) return true;
  try {
    var listingDate;
    if (dateStr.indexOf('T') !== -1 || dateStr.indexOf('-') !== -1) {
      listingDate = new Date(dateStr);
    } else {
      var lower = dateStr.toLowerCase();
      if (lower.indexOf('dakika') !== -1 || lower.indexOf('saniye') !== -1 || lower.indexOf('simdi') !== -1) return true;
      if (lower.indexOf('saat') !== -1) {
        var hourMatch = lower.match(/(\d+)\s*saat/);
        if (hourMatch) return parseInt(hourMatch[1]) <= hoursLimit;
      }
      return false;
    }
    if (isNaN(listingDate.getTime())) return true;
    var diffHours = (new Date() - listingDate) / (1000 * 60 * 60);
    return diffHours <= hoursLimit;
  } catch (e) {
    return true;
  }
}

async function processWatcher(watcher, mainWindow) {
  var platform = PLATFORMS[watcher.platform];
  if (!platform) return { newCount: 0, alertCount: 0 };

  var isFirstRun = !firstScan[watcher.id];
  var result = await platform.search(watcher);
  if (!result.success) return { newCount: 0, alertCount: 0, error: result.error };

  var settings = store.store || {};
  var newCount = 0;
  var alertCount = 0;

  var historical = db.getListings({
    platform: watcher.platform,
    search: (watcher.keywords || '').split(',')[0].trim(),
    limit: 100
  });

  var filteredListings = result.listings;

  if (isFirstRun) {
    filteredListings = result.listings.filter(function(listing) {
      try {
        var extra = JSON.parse(listing.extra_data || '{}');
        return isRecentListing(extra.date, 1);
      } catch (e) { return true; }
    });
    console.log('[Scan] ' + watcher.name + ' ilk tarama, son 1 saat: ' + filteredListings.length + '/' + result.listings.length);
  }

  for (var i = 0; i < filteredListings.length; i++) {
    var listing = filteredListings[i];
    var upsertResult = db.upsertListing(listing);

    var analysisInput = {
      title: listing.title,
      description: listing.description,
      price: listing.price,
      isNew: upsertResult.isNew,
      priceChanged: upsertResult.priceChanged,
      oldPrice: upsertResult.oldPrice,
      newPrice: upsertResult.priceChanged ? listing.price : null
    };

    var analysis = analyzer.analyzeListing(analysisInput, historical);
    if (upsertResult.isNew) newCount++;

    var alertSent = false;
    for (var s = 0; s < analysis.signals.length; s++) {
      var signal = analysis.signals[s];
      var shouldAlert = false;

      if (signal.severity === 'high') shouldAlert = true;
      if (signal.severity === 'medium') shouldAlert = true;
      if (signal.type === 'new_listing' && upsertResult.isNew) shouldAlert = true;

      if (shouldAlert && !alertSent) {
        var alertData = {
          watcher_id: watcher.id,
          listing_id: upsertResult.id,
          type: signal.type,
          title: signal.title,
          message: signal.message + '\n\n' + listing.title + '\n' + (listing.price ? listing.price + ' TL' : 'Fiyat belirtilmemis'),
          severity: signal.severity,
          platform: watcher.platform,
          listing_url: listing.url,
          listing_price: listing.price
        };

        var alert = db.createAlert(alertData);
        alertCount++;
        alertSent = true;

        await notifier.dispatch({
          title: signal.title,
          message: listing.title + (listing.price ? ' - ' + listing.price + ' TL' : ''),
          severity: signal.severity,
          url: listing.url,
          price: listing.price,
          platform: watcher.platform
        }, watcher, settings);

        sendToRenderer(mainWindow, 'alert:new', alert);
        sendToRenderer(mainWindow, 'sound:play', { severity: signal.severity });
      }
    }

    if (listing.seller && listing.seller !== 'bilinmiyor') {
      var sellerListings = db.getListings({ seller: listing.seller, limit: 200 });
      var sellerPrices = sellerListings.filter(function(l) { return l.price > 0; }).map(function(l) { return l.price; });
      if (sellerPrices.length > 0) {
        var avg = sellerPrices.reduce(function(a, b) { return a + b; }, 0) / sellerPrices.length;
        db.upsertSeller({
          platform: watcher.platform,
          seller_id: listing.seller_id || '',
          seller_name: listing.seller,
          total_listings: sellerListings.length,
          avg_price: avg,
          min_price: Math.min.apply(null, sellerPrices),
          max_price: Math.max.apply(null, sellerPrices)
        });
      }
    }
  }

  firstScan[watcher.id] = true;
  db.updateWatcherLastCheck(watcher.id, result.count);

  return { newCount: newCount, alertCount: alertCount };
}

async function runScan(mainWindow) {
  if (scanning) return { status: 'busy' };
  scanning = true;

  var watchers = db.getActiveWatchers();
  if (watchers.length === 0) {
    scanning = false;
    return { status: 'no_watchers' };
  }

  sendToRenderer(mainWindow, 'scan:update', {
    status: 'started', total: watchers.length, current: 0, watcherName: ''
  });

  var totalNew = 0;
  var totalAlerts = 0;
  var errors = [];

  for (var i = 0; i < watchers.length; i++) {
    var watcher = watchers[i];

    sendToRenderer(mainWindow, 'scan:update', {
      status: 'scanning', total: watchers.length, current: i + 1, watcherName: watcher.name
    });

    try {
      var result = await processWatcher(watcher, mainWindow);
      totalNew += result.newCount;
      totalAlerts += result.alertCount;
      console.log('[Scan] ' + watcher.name + ' - Yeni: ' + result.newCount + ', Alarm: ' + result.alertCount);
      if (result.error) errors.push({ watcher: watcher.name, error: result.error });
    } catch (e) {
      errors.push({ watcher: watcher.name, error: e.message });
      console.error('[Scan] Exception: ' + e.message);
    }

    if (i < watchers.length - 1) {
      await new Promise(function(r) { setTimeout(r, 3000 + Math.floor(Math.random() * 2000)); });
    }
  }

  scanning = false;

  var summary = {
    status: 'completed',
    totalNew: totalNew, totalAlerts: totalAlerts,
    totalWatchers: watchers.length, errors: errors,
    timestamp: new Date().toLocaleString('tr-TR')
  };

  sendToRenderer(mainWindow, 'scan:update', summary);
  return summary;
}

function startScheduler(mainWindow) {
  stopScheduler();
  var interval = store.get('scanInterval') || 5;

  var task = cron.schedule('*/' + interval + ' * * * *', function() {
    runScan(mainWindow);
  });

  tasks.push(task);
  isRunning = true;

  setTimeout(function() { runScan(mainWindow); }, 3000);

  console.log('[Scheduler] Baslatildi - her ' + interval + ' dakikada bir');
  sendToRenderer(mainWindow, 'scan:update', { status: 'scheduler', running: true });
}

function stopScheduler() {
  for (var i = 0; i < tasks.length; i++) tasks[i].stop();
  tasks = [];
  scanning = false;
  isRunning = false;
  firstScan = {};
  console.log('[Scheduler] Durduruldu');
}

function getSchedulerStatus() {
  return { running: isRunning, scanning: scanning };
}

module.exports = {
  startScheduler: startScheduler,
  stopScheduler: stopScheduler,
  runScan: runScan,
  getSchedulerStatus: getSchedulerStatus
};