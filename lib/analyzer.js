const THRESHOLDS = {
  anomalyPercent: 30,
  significantDropPercent: 15,
  hotDealScore: 75,
  opportunityScore: 50,
  highRelevanceScore: 80
};

const URGENCY_KEYWORDS = [
  'acil', 'bugun', 'son fiyat', 'hemen', 'yarin', 'tasfiye',
  'kapanis', 'son gun', 'indirimli', 'firsat', 'kacirmayin'
];

const BULK_KEYWORDS = [
  'toplu', 'paket', 'hepsi', 'toplam', 'adet', 'set', 'bundle', 'combo'
];

function analyzeListing(listing, historical) {
  var signals = [];
  var titleLower = (listing.title || '').toLowerCase();
  var descLower = (listing.description || '').toLowerCase();
  var combinedText = titleLower + ' ' + descLower;

  if (listing.isNew) {
    signals.push({
      type: 'new_listing',
      severity: 'medium',
      title: 'Yeni Ilan Bulundu',
      message: listing.title,
      score: 60
    });
  }

  if (listing.price && Array.isArray(historical) && historical.length >= 3) {
    var prices = historical
      .filter(function(h) { return h.price && h.price > 0; })
      .map(function(h) { return h.price; });

    if (prices.length >= 3) {
      var sum = prices.reduce(function(a, b) { return a + b; }, 0);
      var avg = sum / prices.length;
      var deviation = ((avg - listing.price) / avg) * 100;

      if (deviation >= THRESHOLDS.anomalyPercent) {
        signals.push({
          type: 'price_anomaly',
          severity: 'high',
          title: 'Fiyat Anomalisi',
          message: 'Ortalamadan %' + deviation.toFixed(0) + ' daha dusuk. Ort: ' + avg.toFixed(0) + ' TL, Bu: ' + listing.price + ' TL',
          score: Math.min(deviation, 100)
        });
      } else if (deviation >= THRESHOLDS.significantDropPercent) {
        signals.push({
          type: 'below_average',
          severity: 'medium',
          title: 'Ortalamanin Altinda',
          message: 'Ortalamadan %' + deviation.toFixed(0) + ' daha uygun',
          score: deviation
        });
      }

      var stdDev = Math.sqrt(prices.reduce(function(s, p) { return s + Math.pow(p - avg, 2); }, 0) / prices.length);
      var zScore = avg > 0 ? (avg - listing.price) / (stdDev || 1) : 0;

      if (zScore > 2) {
        signals.push({
          type: 'statistical_outlier',
          severity: 'high',
          title: 'Istatistiksel Sapma',
          message: 'Normal dagilimin disinda (Z: ' + zScore.toFixed(1) + ')',
          score: Math.min(zScore * 20, 100)
        });
      }
    }
  }

  if (listing.priceChanged && listing.oldPrice && listing.newPrice !== undefined) {
    var currentPrice = listing.newPrice !== null ? listing.newPrice : listing.price;
    if (currentPrice < listing.oldPrice) {
      var dropPercent = ((listing.oldPrice - currentPrice) / listing.oldPrice) * 100;

      if (dropPercent >= THRESHOLDS.significantDropPercent) {
        signals.push({
          type: 'price_drop',
          severity: dropPercent >= 30 ? 'high' : 'medium',
          title: 'Fiyat Dususu',
          message: listing.oldPrice + ' TL -> ' + currentPrice + ' TL (%' + dropPercent.toFixed(0) + ' dusus)',
          score: Math.min(dropPercent, 100)
        });
      }
    }
  }

  var urgencyFound = false;
  for (var i = 0; i < URGENCY_KEYWORDS.length; i++) {
    if (combinedText.indexOf(URGENCY_KEYWORDS[i]) !== -1) {
      urgencyFound = true;
      break;
    }
  }

  if (urgencyFound) {
    signals.push({
      type: 'urgent_sale',
      severity: 'medium',
      title: 'Acil Satis Isareti',
      message: 'Ilanda aciliyet belirten ifadeler var',
      score: 55
    });
  }

  var bulkFound = false;
  for (var j = 0; j < BULK_KEYWORDS.length; j++) {
    if (combinedText.indexOf(BULK_KEYWORDS[j]) !== -1) {
      bulkFound = true;
      break;
    }
  }

  if (bulkFound && listing.price) {
    signals.push({
      type: 'bulk_deal',
      severity: 'info',
      title: 'Toplu Satis',
      message: 'Toplu veya paket satis olabilir',
      score: 35
    });
  }

  var totalScore = 0;
  if (signals.length > 0) {
    var scoreSum = signals.reduce(function(sum, sig) { return sum + sig.score; }, 0);
    totalScore = Math.min(100, Math.round(scoreSum / signals.length));
  }

  return {
    signals: signals,
    score: totalScore,
    isOpportunity: totalScore >= THRESHOLDS.opportunityScore,
    isHotDeal: totalScore >= THRESHOLDS.hotDealScore,
    signalCount: signals.length
  };
}

function analyzeSellerProfile(listings) {
  if (!listings || listings.length === 0) {
    return { reliable: false, score: 0 };
  }

  var prices = listings.filter(function(l) { return l.price > 0; }).map(function(l) { return l.price; });
  var total = listings.length;

  var avgPrice = 0;
  var minPrice = 0;
  var maxPrice = 0;
  var priceConsistency = 50;

  if (prices.length > 0) {
    var sum = prices.reduce(function(a, b) { return a + b; }, 0);
    avgPrice = sum / prices.length;
    minPrice = Math.min.apply(null, prices);
    maxPrice = Math.max.apply(null, prices);

    if (prices.length > 1) {
      var variance = prices.reduce(function(s, p) { return s + Math.pow(p - avgPrice, 2); }, 0) / prices.length;
      var stdDev = Math.sqrt(variance);
      priceConsistency = avgPrice > 0 ? Math.max(0, 100 - (stdDev / avgPrice * 100)) : 50;
    }
  }

  var activityScore = Math.min(total * 3, 40);
  var consistencyScore = priceConsistency * 0.4;
  var trustScore = Math.min(100, Math.round(activityScore + consistencyScore + 20));

  return {
    totalListings: total,
    avgPrice: Math.round(avgPrice),
    minPrice: Math.round(minPrice),
    maxPrice: Math.round(maxPrice),
    priceConsistency: Math.round(priceConsistency),
    trustScore: trustScore,
    reliable: trustScore > 60,
    isEstablished: total > 10
  };
}

module.exports = { analyzeListing: analyzeListing, analyzeSellerProfile: analyzeSellerProfile };