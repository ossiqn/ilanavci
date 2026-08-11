const { Notification, net } = require('electron');

let soundEnabled = true;

function setSoundEnabled(enabled) {
  soundEnabled = enabled;
}

function sendDesktop(data) {
  try {
    var notification = new Notification({
      title: 'IlanAvci - ' + (data.title || 'Bildirim'),
      body: data.message || '',
      urgency: data.severity === 'high' ? 'critical' : 'normal',
      silent: !soundEnabled
    });

    notification.show();

    if (data.url) {
      notification.on('click', function() {
        require('electron').shell.openExternal(data.url);
      });
    }
  } catch (e) {}
}

function sendTelegram(data, config) {
  if (!config || !config.botToken || !config.chatId) return Promise.resolve({ success: false, error: 'Eksik config' });

  var severityMap = { 'high': 'YUKSEK', 'medium': 'ORTA', 'info': 'BILGI' };

  var text = '*IlanAvci Alarm*\n\n';
  text += '*' + (data.title || '') + '*\n';
  text += (data.message || '') + '\n\n';
  text += 'Oncelik: ' + (severityMap[data.severity] || 'BILGI') + '\n';
  if (data.price) text += 'Fiyat: ' + data.price + ' TL\n';
  if (data.platform) text += 'Platform: ' + data.platform.toUpperCase() + '\n';
  if (data.url) text += '\n[Ilani Gor](' + data.url + ')';

  return new Promise(function(resolve) {
    try {
      var body = JSON.stringify({
        chat_id: config.chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      });

      var request = net.request({
        url: 'https://api.telegram.org/bot' + config.botToken + '/sendMessage',
        method: 'POST'
      });

      request.setHeader('Content-Type', 'application/json');

      request.on('response', function(response) {
        var chunks = [];
        response.on('data', function(c) { chunks.push(c); });
        response.on('end', function() {
          var raw = Buffer.concat(chunks).toString('utf8');
          try {
            var parsed = JSON.parse(raw);
            resolve({ success: response.statusCode === 200 && parsed.ok, response: parsed });
          } catch (e) {
            resolve({ success: false, error: 'Parse error' });
          }
        });
        response.on('error', function(err) { resolve({ success: false, error: err.message }); });
      });

      request.on('error', function(err) { resolve({ success: false, error: err.message }); });
      request.write(body);
      request.end();
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

function testTelegram(config) {
  return sendTelegram({
    title: 'Test Bildirimi',
    message: 'IlanAvci Telegram baglantisi basariyla kuruldu.',
    severity: 'info',
    platform: 'test'
  }, config);
}

function dispatch(alertData, watcher, settings) {
  var promises = [];

  if (watcher.notify_desktop) {
    sendDesktop(alertData);
  }

  if (watcher.notify_telegram && settings && settings.telegramBotToken && settings.telegramChatId) {
    promises.push(sendTelegram(alertData, {
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId
    }));
  }

  if (promises.length > 0) return Promise.all(promises);
  return Promise.resolve();
}

module.exports = {
  sendDesktop: sendDesktop,
  sendTelegram: sendTelegram,
  testTelegram: testTelegram,
  dispatch: dispatch,
  setSoundEnabled: setSoundEnabled
};