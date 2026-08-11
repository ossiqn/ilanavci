const { net } = require('electron');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function wait(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function fetchPage(url, options) {
  options = options || {};
  var maxRetries = options.retries || 3;
  var timeout = options.timeout || 15000;
  var baseDelay = options.delay || 2000;
  var attempt = 0;

  function tryFetch() {
    return new Promise(function(resolve) {
      var timer;
      var done = false;

      function finish(result) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(result);
      }

      timer = setTimeout(function() {
        finish({ success: false, error: 'Timeout' });
      }, timeout);

      try {
        var request = net.request({
          url: url,
          method: 'GET',
          redirect: 'follow'
        });

        request.setHeader('User-Agent', getRandomUA());
        request.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
        request.setHeader('Accept-Language', 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7');
        request.setHeader('Cache-Control', 'no-cache');

        if (options.headers) {
          Object.keys(options.headers).forEach(function(k) {
            request.setHeader(k, options.headers[k]);
          });
        }

        var chunks = [];
        var statusCode = 0;

        request.on('response', function(response) {
          statusCode = response.statusCode;

          response.on('data', function(chunk) {
            chunks.push(chunk);
          });

          response.on('end', function() {
            var html = Buffer.concat(chunks).toString('utf8');
            if (statusCode >= 200 && statusCode < 300) {
              finish({ success: true, html: html, status: statusCode });
            } else {
              finish({ success: false, error: 'HTTP ' + statusCode });
            }
          });

          response.on('error', function(err) {
            finish({ success: false, error: err.message });
          });
        });

        request.on('error', function(err) {
          finish({ success: false, error: err.message });
        });

        request.end();
      } catch(e) {
        finish({ success: false, error: e.message });
      }
    });
  }

  function run() {
    return tryFetch().then(function(result) {
      if (result.success) return result;
      attempt++;
      if (attempt < maxRetries) {
        return wait(baseDelay * attempt + Math.random() * 1000).then(run);
      }
      return result;
    });
  }

  return run();
}

function fetchJSON(url, options) {
  options = options || {};
  return fetchPage(url, options).then(function(result) {
    if (!result.success) return result;
    try {
      var data = JSON.parse(result.html);
      return { success: true, data: data };
    } catch(e) {
      return { success: false, error: 'JSON parse hatasi: ' + e.message };
    }
  });
}

module.exports = { fetchPage: fetchPage, fetchJSON: fetchJSON, wait: wait, getRandomUA: getRandomUA };