const cheerio = require('cheerio');
const { fetchPage, wait } = require('../scraper');

const BASE_URL = 'https://www.r10.net';

const CATEGORIES = {
  'domain': { node: 'domain-satis', label: 'Domain' },
  'site': { node: 'site-satis', label: 'Site' },
  'hosting': { node: 'hosting', label: 'Hosting' },
  'yazilim': { node: 'yazilim-satis', label: 'Yazilim' },
  'sosyal-medya': { node: 'sosyal-medya', label: 'Sosyal Medya' },
  'seo': { node: 'seo-hizmetleri', label: 'SEO' },
  'grafik': { node: 'grafik-tasarim', label: 'Grafik' },
  'diger': { node: 'diger', label: 'Diger' }
};

const PRICE_PATTERNS = [
  /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:TL|tl|Tl|\u20BA)/,
  /(?:fiyat|price|ucret|bedel)\s*[:\-=]\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/,
  /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:USD|usd|dolar)/i,
  /(\d{1,3}(?:[.,]\d{3})*)\s*\u20BA/
];

function buildUrl(watcher) {
  const params = new URLSearchParams();
  params.set('q', watcher.keywords);
  params.set('type', 'post');
  params.set('order', 'date');

  if (watcher.category && CATEGORIES[watcher.category]) {
    params.set('nodes[]', CATEGORIES[watcher.category].node);
  }

  return BASE_URL + '/search/?' + params.toString();
}

function extractPrice(text) {
  for (let i = 0; i < PRICE_PATTERNS.length; i++) {
    const match = text.match(PRICE_PATTERNS[i]);
    if (match) {
      let raw = match[1];
      raw = raw.replace(/\./g, '').replace(',', '.');
      const value = parseFloat(raw);
      if (!isNaN(value) && value > 0 && value < 100000000) {
        return value;
      }
    }
  }
  return null;
}

function generateId(input) {
  let hash = 0;
  const str = String(input || '');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return String(Math.abs(hash));
}

function parseResults(html, watcher) {
  const $ = cheerio.load(html);
  const results = [];

  const excludeList = (watcher.exclude_keywords || '')
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);

  const selectors = [
    '.contentRow',
    '.structItem',
    '.block-row',
    'li.block-row',
    '.listPlain > li'
  ];

  let elements = $([]);
  for (let i = 0; i < selectors.length; i++) {
    elements = $(selectors[i]);
    if (elements.length > 0) break;
  }

  elements.each((_, el) => {
    try {
      const $el = $(el);

      const linkEl = $el.find('.contentRow-title a, .structItem-title a, .listPlain-title a, h3 a, .title a').first();
      const title = linkEl.text().trim();
      let href = linkEl.attr('href') || '';

      if (!title || title.length < 3) return;

      const titleLower = title.toLowerCase();
      for (let i = 0; i < excludeList.length; i++) {
        if (titleLower.indexOf(excludeList[i]) !== -1) return;
      }

      const fullText = $el.text();
      const price = extractPrice(title + ' ' + fullText);

      if (price !== null) {
        if (watcher.min_price && price < watcher.min_price) return;
        if (watcher.max_price && watcher.max_price < 999999 && price > watcher.max_price) return;
      }

      const sellerEl = $el.find('[data-user-id], .username, .contentRow-minor a').first();
      const seller = sellerEl.text().trim() || '';
      const sellerId = sellerEl.attr('data-user-id') || '';

      const timeEl = $el.find('time').first();
      const dateStr = timeEl.attr('datetime') || timeEl.text().trim() || '';

      const threadMatch = href.match(/\.(\d+)\/?$/);
      const externalId = threadMatch ? threadMatch[1] : generateId(href + title);

      if (href && !href.startsWith('http')) {
        href = BASE_URL + (href.startsWith('/') ? '' : '/') + href;
      }

      const snippet = $el.find('.contentRow-snippet, .structItem-snippet, .tagLine').text().trim();

      results.push({
        platform: 'r10',
        external_id: externalId,
        title: title,
        price: price,
        currency: 'TL',
        seller: seller || 'bilinmiyor',
        seller_id: sellerId,
        url: href,
        description: snippet.substring(0, 500),
        category: watcher.category || '',
        images: '[]',
        extra_data: JSON.stringify({ date: dateStr }),
        watcher_id: watcher.id
      });
    } catch (e) {
      // skip
    }
  });

  return results;
}

async function search(watcher) {
  const url = buildUrl(watcher);

  const result = await fetchPage(url);
  if (!result.success) {
    return { success: false, listings: [], error: result.error };
  }

  const listings = parseResults(result.html, watcher);
  return { success: true, listings: listings, count: listings.length };
}

async function searchMultiPage(watcher, maxPages) {
  const pages = maxPages || 1;
  let allListings = [];

  for (let page = 1; page <= pages; page++) {
    const url = buildUrl(watcher) + '&page=' + page;
    const result = await fetchPage(url);

    if (!result.success) break;

    const listings = parseResults(result.html, watcher);
    allListings = allListings.concat(listings);

    if (listings.length === 0) break;
    if (page < pages) await wait(2000 + Math.random() * 2000);
  }

  return { success: true, listings: allListings, count: allListings.length };
}

module.exports = {
  name: 'r10',
  displayName: 'R10.net',
  baseUrl: BASE_URL,
  categories: CATEGORIES,
  search: search,
  searchMultiPage: searchMultiPage
};