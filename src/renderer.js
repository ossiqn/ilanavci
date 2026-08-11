(function() {

  var currentPage = 'dashboard';
  var debounceTimers = {};
  var schedulerRunning = true;
  var creditInfo = null;

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function debounce(key, fn, delay) {
    clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(fn, delay || 300);
  }

  function playSound(severity) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var freqMap = { 'high': [880, 1100, 880], 'medium': [660, 880], 'info': [523] };
      var freqs = freqMap[severity] || [523];
      var now = ctx.currentTime;

      freqs.forEach(function(freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        var start = now + i * 0.15;
        var end = start + 0.12;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, end);
        osc.start(start);
        osc.stop(end + 0.05);
      });
    } catch (e) {}
  }

  function switchPage(name) {
    currentPage = name;
    $$('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
    $$('.page').forEach(function(p) { p.classList.remove('active'); });
    var navBtn = $('[data-page="' + name + '"]');
    var pageEl = $('#page-' + name);
    if (navBtn) navBtn.classList.add('active');
    if (pageEl) pageEl.classList.add('active');

    switch (name) {
      case 'dashboard': loadDashboard(); break;
      case 'watchers': loadWatchers(); break;
      case 'alerts': loadAlerts(); break;
      case 'listings': loadListings(); break;
      case 'settings': loadSettings(); break;
    }
  }

  function severityIcon(sev) {
    if (sev === 'high') return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    if (sev === 'medium') return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  function metricIcon(type) {
    var icons = {
      watchers: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
      listings: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      today: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      alerts: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
      drops: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
      price: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>'
    };
    return icons[type] || '';
  }

  function actionIcon(type) {
    var icons = {
      pause: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
      play: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
      trash: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'
    };
    return icons[type] || '';
  }

  function updateBadge(count) {
    var badge = $('#alertBadge');
    if (!badge) return;
    if (count > 0) {
      badge.classList.remove('hidden');
      badge.textContent = count > 99 ? '99+' : count;
    } else {
      badge.classList.add('hidden');
    }
  }

  async function loadDashboard() {
    try {
      var stats = await bridge.invoke('stats:dashboard');
      var html = '';
      html += '<div class="metric"><div class="metric-icon purple">' + metricIcon('watchers') + '</div><div><div class="metric-val">' + stats.activeWatchers + '</div><div class="metric-label">Aktif Takip</div></div></div>';
      html += '<div class="metric"><div class="metric-icon blue">' + metricIcon('listings') + '</div><div><div class="metric-val">' + stats.totalListings + '</div><div class="metric-label">Toplam Ilan</div></div></div>';
      html += '<div class="metric"><div class="metric-icon green">' + metricIcon('today') + '</div><div><div class="metric-val">' + stats.todayListings + '</div><div class="metric-label">Bugun Yeni</div></div></div>';
      html += '<div class="metric"><div class="metric-icon orange">' + metricIcon('alerts') + '</div><div><div class="metric-val">' + stats.unreadAlerts + '</div><div class="metric-label">Okunmamis</div></div></div>';
      html += '<div class="metric"><div class="metric-icon red">' + metricIcon('drops') + '</div><div><div class="metric-val">' + stats.priceDropsToday + '</div><div class="metric-label">Fiyat Dususu</div></div></div>';
      html += '<div class="metric"><div class="metric-icon purple">' + metricIcon('price') + '</div><div><div class="metric-val">' + stats.avgPrice + ' TL</div><div class="metric-label">Ort. Fiyat</div></div></div>';
      $('#metricsGrid').innerHTML = html;

      if (stats.recentAlerts.length > 0) {
        $('#dashAlerts').innerHTML = stats.recentAlerts.map(renderAlertRow).join('');
      } else {
        $('#dashAlerts').innerHTML = '<div class="empty-box">Henuz alarm olusturulmadi</div>';
      }

      if (stats.topDrops.length > 0) {
        $('#dashDrops').innerHTML = stats.topDrops.map(function(d) {
          return '<div class="drop-row"><div class="drop-pct">-' + Math.abs(parseFloat(d.change_percent)).toFixed(0) + '%</div>' +
            '<div class="drop-body"><div class="drop-name">' + esc(d.title) + '</div>' +
            '<div class="drop-prices">' + d.old_price + ' TL &rarr; ' + d.new_price + ' TL</div></div></div>';
        }).join('');
      } else {
        $('#dashDrops').innerHTML = '<div class="empty-box">Fiyat degisimi tespit edilmedi</div>';
      }

      if (stats.recentListings.length > 0) {
        $('#dashListings').innerHTML = stats.recentListings.map(renderListingRow).join('');
      } else {
        $('#dashListings').innerHTML = '<div class="empty-box">Henuz ilan bulunamadi</div>';
      }

      updateBadge(stats.unreadAlerts);
    } catch (e) { console.error(e); }
  }

  function renderAlertRow(a) {
    var readClass = a.is_read ? '' : ' unread';
    var sevClass = a.severity ? ' sev-' + a.severity : '';
    var iconClass = a.severity || 'info';
    return '<div class="alert-row' + readClass + sevClass + '" data-alert-id="' + a.id + '" data-url="' + esc(a.listing_url || '') + '">' +
      '<div class="alert-icon ' + iconClass + '">' + severityIcon(a.severity) + '</div>' +
      '<div class="alert-body"><div class="alert-title">' + esc(a.title) + '</div>' +
      '<div class="alert-msg">' + esc(a.message) + '</div>' +
      '<div class="alert-time">' + esc(a.created_at || '') + (a.watcher_name ? ' &middot; ' + esc(a.watcher_name) : '') + '</div>' +
      '</div></div>';
  }

  function renderListingRow(l) {
    var ph = [];
    try { ph = JSON.parse(l.price_history || '[]'); } catch(e) {}
    var dropped = ph.length > 0 && ph[ph.length - 1].price > l.price;
    var priceClass = dropped ? ' dropped' : '';
    return '<div class="listing-row" data-url="' + esc(l.url) + '">' +
      '<div class="listing-tag">' + esc((l.platform || '').toUpperCase()) + '</div>' +
      '<div class="listing-body"><div class="listing-name">' + esc(l.title) + '</div>' +
      '<div class="listing-meta"><span class="seller-link" data-seller="' + esc(l.seller || '') + '">' + esc(l.seller || 'bilinmiyor') + '</span>' +
      '<span>' + esc(l.first_seen || '') + '</span></div></div>' +
      '<div class="listing-price' + priceClass + '">' + (l.price ? l.price + ' TL' : '-') + '</div></div>';
  }

  async function loadWatchers() {
    var watchers = await bridge.invoke('watcher:list');
    var el = $('#watcherList');

    if (watchers.length === 0) {
      el.innerHTML = '<div class="empty-box"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><p>Henuz takipci eklenmedi</p></div>';
      return;
    }

    el.innerHTML = watchers.map(function(w) {
      var offClass = w.active ? '' : ' off';
      var toggleBtn = w.active ? actionIcon('pause') : actionIcon('play');
      return '<div class="watcher-row' + offClass + '"><div class="watcher-dot"></div>' +
        '<div class="watcher-body"><div class="watcher-name">' + esc(w.name) + '</div>' +
        '<div class="watcher-meta"><span>' + esc(w.platform.toUpperCase()) + '</span>' +
        '<span>' + esc(w.keywords) + '</span>' +
        '<span>' + w.min_price + '-' + w.max_price + ' TL</span>' +
        (w.last_check ? '<span>' + esc(w.last_check) + '</span>' : '') +
        '</div></div><div class="watcher-actions">' +
        '<button data-toggle="' + w.id + '">' + toggleBtn + '</button>' +
        '<button class="danger" data-delete="' + w.id + '">' + actionIcon('trash') + '</button>' +
        '</div></div>';
    }).join('');
  }

  async function loadAlerts() {
    var filterVal = $('#alertFilterType').value;
    var filters = {};
    if (filterVal === 'unread') filters.unread = true;
    if (filterVal === 'high') filters.severity = 'high';
    if (filterVal === 'price_drop') filters.type = 'price_drop';
    if (filterVal === 'price_anomaly') filters.type = 'price_anomaly';
    if (filterVal === 'new_listing') filters.type = 'new_listing';

    var alerts = await bridge.invoke('alert:list', filters);
    var el = $('#alertList');

    if (alerts.length === 0) {
      el.innerHTML = '<div class="empty-box">Alarm bulunamadi</div>';
      return;
    }

    el.innerHTML = alerts.map(renderAlertRow).join('');
    var count = await bridge.invoke('alert:count');
    updateBadge(count);
  }

  async function loadListings() {
    var search = $('#listingSearch').value.trim();
    var platform = $('#listingPlatform').value;
    var sort = $('#listingSort').value;
    var filters = { sort: sort };
    if (search) filters.search = search;
    if (platform) filters.platform = platform;

    var listings = await bridge.invoke('listing:list', filters);
    var el = $('#listingList');

    if (listings.length === 0) {
      el.innerHTML = '<div class="empty-box">Ilan bulunamadi</div>';
      return;
    }

    el.innerHTML = listings.map(renderListingRow).join('');
  }

  async function loadSettings() {
    var s = await bridge.invoke('settings:get');
    $('#sDesktop').checked = s.desktopNotify !== false;
    $('#sSound').checked = s.soundEnabled !== false;
    $('#sTgToken').value = s.telegramBotToken || '';
    $('#sTgChat').value = s.telegramChatId || '';
    $('#sInterval').value = s.scanInterval || 5;
  }

  async function saveSettings() {
    await bridge.invoke('settings:set', {
      desktopNotify: $('#sDesktop').checked,
      soundEnabled: $('#sSound').checked,
      telegramBotToken: $('#sTgToken').value.trim(),
      telegramChatId: $('#sTgChat').value.trim(),
      scanInterval: parseInt($('#sInterval').value) || 5
    });
    var btn = $('#btnSaveSettings');
    btn.textContent = 'Kaydedildi';
    setTimeout(function() { btn.textContent = 'Kaydet'; }, 1500);
  }

  async function testTelegram() {
    var token = $('#sTgToken').value.trim();
    var chatId = $('#sTgChat').value.trim();
    var status = $('#tgStatus');

    if (!token || !chatId) {
      status.textContent = 'Token ve Chat ID zorunlu';
      status.className = 'tg-status error';
      return;
    }

    status.textContent = 'Gonderiliyor...';
    status.className = 'tg-status loading';

    try {
      var result = await bridge.invoke('telegram:test', { botToken: token, chatId: chatId });
      if (result.success) {
        status.textContent = 'Basarili! Telegramdan mesaji kontrol et';
        status.className = 'tg-status success';

        await bridge.invoke('settings:set', {
          telegramBotToken: token,
          telegramChatId: chatId
        });
      } else {
        status.textContent = 'Hata: ' + (result.error || 'Bilinmeyen');
        status.className = 'tg-status error';
      }
    } catch (e) {
      status.textContent = 'Hata: ' + e.message;
      status.className = 'tg-status error';
    }
  }

  function openModal() { $('#modalBackdrop').classList.remove('hidden'); }

  function closeModal() {
    $('#modalBackdrop').classList.add('hidden');
    $('#mName').value = '';
    $('#mKeywords').value = '';
    $('#mExclude').value = '';
    $('#mMinPrice').value = '0';
    $('#mMaxPrice').value = '999999';
    $('#mCategory').value = '';
    $('#mTelegram').checked = false;
  }

  async function createWatcher() {
    var name = $('#mName').value.trim();
    var keywords = $('#mKeywords').value.trim();
    if (!name || !keywords) return;

    await bridge.invoke('watcher:create', {
      name: name,
      platform: $('#mPlatform').value,
      keywords: keywords,
      exclude_keywords: $('#mExclude').value.trim(),
      min_price: parseFloat($('#mMinPrice').value) || 0,
      max_price: parseFloat($('#mMaxPrice').value) || 999999,
      category: $('#mCategory').value,
      notify_telegram: $('#mTelegram').checked
    });

    closeModal();
    loadWatchers();
  }

  async function showSellerDetail(seller) {
    if (!seller) return;
    var data = await bridge.invoke('listing:sellerHistory', seller);
    var modal = $('#sellerModalBackdrop');
    var body = $('#sellerModalBody');
    $('#sellerModalTitle').textContent = seller + ' - Gecmis';

    if (!data.listings || data.listings.length === 0) {
      body.innerHTML = '<div class="empty-box">Bu saticiya ait ilan bulunamadi</div>';
    } else {
      var statsHtml = '<div style="margin-bottom:14px;display:flex;gap:16px;font-size:12px;color:var(--text-2);">' +
        '<span>' + data.stats.totalListings + ' ilan</span>' +
        '<span>Ort: ' + Math.round(data.stats.avgPrice) + ' TL</span>';
      if (data.stats.minPrice > 0) {
        statsHtml += '<span>' + Math.round(data.stats.minPrice) + ' - ' + Math.round(data.stats.maxPrice) + ' TL</span>';
      }
      statsHtml += '</div>';
      body.innerHTML = statsHtml + data.listings.map(renderListingRow).join('');
    }

    modal.classList.remove('hidden');
  }

  async function toggleScheduler() {
    var icon = $('#schedIcon');
    if (schedulerRunning) {
      await bridge.invoke('scan:stop');
      schedulerRunning = false;
      icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      $('#scanDot').className = 'scan-dot stopped';
      $('#scanLabel').textContent = 'Durduruldu';
    } else {
      await bridge.invoke('scan:start');
      schedulerRunning = true;
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      $('#scanDot').className = 'scan-dot';
      $('#scanLabel').textContent = 'Baslatildi';
    }
  }

  function showCreditSplash(info) {
    creditInfo = info;
    $('#creditAuthor').textContent = info.author;
    $('#creditMsg').textContent = info.message;
    $('#creditSplash').classList.remove('hidden');
  }

  function closeCreditSplash() {
    $('#creditSplash').classList.add('hidden');
  }

  $$('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var page = this.getAttribute('data-page');
      if (page) switchPage(page);
    });
  });

  $('#btnMin').addEventListener('click', function() { bridge.send('window:minimize'); });
  $('#btnMax').addEventListener('click', function() { bridge.send('window:maximize'); });
  $('#btnClose').addEventListener('click', function() { bridge.send('window:close'); });

  $('#btnSchedToggle').addEventListener('click', toggleScheduler);

  $('#btnGithub').addEventListener('click', function() {
    if (creditInfo) bridge.invoke('shell:openExternal', creditInfo.github);
  });

  $('#btnR10').addEventListener('click', function() {
    if (creditInfo) bridge.invoke('shell:openExternal', creditInfo.r10);
  });

  $('#brandAuthor').addEventListener('click', function() {
    if (creditInfo) showCreditSplash(creditInfo);
  });

  $('#footerCreditBtn').addEventListener('click', function() {
    if (creditInfo) showCreditSplash(creditInfo);
  });

  $('#creditClose').addEventListener('click', closeCreditSplash);

  $('#creditGithub').addEventListener('click', function() {
    if (creditInfo) bridge.invoke('shell:openExternal', creditInfo.github);
  });

  $('#creditR10').addEventListener('click', function() {
    if (creditInfo) bridge.invoke('shell:openExternal', creditInfo.r10);
  });

  $('#creditSplash').addEventListener('click', function(e) {
    if (e.target === this) closeCreditSplash();
  });

  $('#btnAddWatcher').addEventListener('click', openModal);
  $('#btnCloseModal').addEventListener('click', closeModal);
  $('#btnCancelModal').addEventListener('click', closeModal);
  $('#btnCreateWatcher').addEventListener('click', createWatcher);

  $('#modalBackdrop').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  $('#btnCloseSellerModal').addEventListener('click', function() {
    $('#sellerModalBackdrop').classList.add('hidden');
  });

  $('#sellerModalBackdrop').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
  });

  $('#alertFilterType').addEventListener('change', loadAlerts);

  $('#btnMarkAllRead').addEventListener('click', async function() {
    await bridge.invoke('alert:markAllRead');
    loadAlerts();
    updateBadge(0);
  });

  $('#listingSearch').addEventListener('input', function() {
    debounce('ls', loadListings, 400);
  });
  $('#listingPlatform').addEventListener('change', loadListings);
  $('#listingSort').addEventListener('change', loadListings);

  $('#btnSearchSeller').addEventListener('click', function() {
    var val = $('#sellerSearchInput').value.trim();
    if (val) showSellerDetail(val);
  });

  $('#sellerSearchInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var val = this.value.trim();
      if (val) showSellerDetail(val);
    }
  });

  $('#btnSaveSettings').addEventListener('click', saveSettings);
  $('#btnTgTest').addEventListener('click', testTelegram);

  document.addEventListener('click', function(e) {
    var alertRow = e.target.closest('.alert-row');
    if (alertRow) {
      var alertId = alertRow.getAttribute('data-alert-id');
      var url = alertRow.getAttribute('data-url');
      if (alertId && alertRow.classList.contains('unread')) {
        bridge.invoke('alert:markRead', parseInt(alertId));
        alertRow.classList.remove('unread');
        bridge.invoke('alert:count').then(updateBadge);
      }
      if (url && e.target.closest('.alert-body')) {
        bridge.invoke('shell:openExternal', url);
      }
      return;
    }

    var listingRow = e.target.closest('.listing-row');
    if (listingRow) {
      var sellerEl = e.target.closest('.seller-link');
      if (sellerEl) {
        e.stopPropagation();
        var sellerName = sellerEl.getAttribute('data-seller');
        if (sellerName) showSellerDetail(sellerName);
        return;
      }
      var listingUrl = listingRow.getAttribute('data-url');
      if (listingUrl) bridge.invoke('shell:openExternal', listingUrl);
      return;
    }

    var toggleBtn = e.target.closest('[data-toggle]');
    if (toggleBtn) {
      var tid = parseInt(toggleBtn.getAttribute('data-toggle'));
      bridge.invoke('watcher:toggle', tid).then(loadWatchers);
      return;
    }

    var deleteBtn = e.target.closest('[data-delete]');
    if (deleteBtn) {
      var did = parseInt(deleteBtn.getAttribute('data-delete'));
      bridge.invoke('watcher:delete', did).then(loadWatchers);
      return;
    }
  });

  bridge.on('scan:update', function(data) {
    var dot = $('#scanDot');
    var label = $('#scanLabel');

    if (data.status === 'scheduler') {
      schedulerRunning = data.running;
      if (data.running) {
        dot.className = 'scan-dot';
        label.textContent = 'Aktif';
      } else {
        dot.className = 'scan-dot stopped';
        label.textContent = 'Durduruldu';
      }
    } else if (data.status === 'started') {
      dot.className = 'scan-dot active';
      label.textContent = 'Taraniyor...';
    } else if (data.status === 'scanning') {
      label.textContent = data.current + '/' + data.total + ' ' + (data.watcherName || '');
    } else if (data.status === 'completed') {
      dot.className = 'scan-dot';
      label.textContent = data.totalNew + ' yeni, ' + data.totalAlerts + ' alarm';
      setTimeout(function() {
        if (schedulerRunning) label.textContent = 'Aktif';
      }, 4000);
      if (currentPage === 'dashboard') loadDashboard();
    }
  });

  bridge.on('alert:new', function() {
    bridge.invoke('alert:count').then(updateBadge);
    if (currentPage === 'dashboard') loadDashboard();
    if (currentPage === 'alerts') loadAlerts();
  });

  bridge.on('sound:play', function(data) {
    playSound(data.severity || 'info');
  });

  bridge.on('show:credits', function(info) {
    showCreditSplash(info);
  });

  bridge.invoke('credit:info').then(function(info) {
    creditInfo = info;
  });

  loadDashboard();

  setInterval(function() {
    bridge.invoke('alert:count').then(updateBadge);
  }, 30000);

})();