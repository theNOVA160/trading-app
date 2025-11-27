const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const APIS = {
  yahooFinance: { baseUrl: "https://query1.finance.yahoo.com" },
  alphavantage: { apiKey: process.env.ALPHA_VANTAGE_KEY || "demo", baseUrl: "https://www.alphavantage.co/query" },
  finnhub: { apiKey: process.env.FINNHUB_KEY || "demo", baseUrl: "https://finnhub.io/api/v1" },
  newsapi: { apiKey: process.env.NEWSAPI_KEY || "demo", baseUrl: "https://newsapi.org/v2" }
};

function calculateRSI(prices, period = 14) {
  if (prices.length < period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  return rsi;
}

async function getStockData(ticker) {
  try {
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
      {
        params: { interval: '1d', range: '1y' },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000
      }
    );
    
    const data = response.data.chart.result[0];
    const quote = data.meta;
    const closes = data.indicators.quote[0].close;
    
    const currentPrice = closes[closes.length - 1];
    const previousClose = closes[closes.length - 2] || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    const rsi = calculateRSI(closes);
    
    return {
      success: true,
      ticker: ticker,
      price: currentPrice,
      currency: quote.currency,
      change: change.toFixed(2),
      changePercent: changePercent.toFixed(2),
      marketCap: quote.marketCap,
      volume: data.indicators.quote[0].volume[data.indicators.quote[0].volume.length - 1],
      rsi: rsi,
      pe: quote.regularMarketPrice / (quote.epsCurrentYear || 1),
      timestamp: new Date(quote.regularMarketTime * 1000).toISOString()
    };
  } catch (error) {
    console.error(`Error getting stock ${ticker}:`, error.message);
    return null;
  }
}

async function analyzeStock(ticker) {
  try {
    const stock = await getStockData(ticker);
    
    if (!stock || !stock.success) {
      return { success: false, error: 'No se encontró el stock' };
    }
    
    let score = 0;
    const detalles = [];
    const changePercent = parseFloat(stock.changePercent);
    
    if (changePercent > 2) {
      score += 15;
      detalles.push({ factor: 'Cambio +2%+', puntos: 15 });
    } else if (changePercent > 1) {
      score += 10;
      detalles.push({ factor: 'Cambio +1%+', puntos: 10 });
    } else if (changePercent > 0) {
      score += 5;
      detalles.push({ factor: 'Cambio positivo', puntos: 5 });
    }
    
    const rsi = stock.rsi;
    if (rsi && rsi > 40 && rsi < 60) {
      score += 20;
      detalles.push({ factor: 'RSI neutral (40-60)', puntos: 20 });
    } else if (rsi && rsi > 30 && rsi < 70) {
      score += 15;
      detalles.push({ factor: 'RSI aceptable', puntos: 15 });
    } else if (rsi && rsi > 70) {
      score -= 15;
      detalles.push({ factor: 'RSI overbought (>70)', puntos: -15 });
    }
    
    if (stock.volume > 1000000) {
      score += 15;
      detalles.push({ factor: 'Volumen alto >1M', puntos: 15 });
    } else if (stock.volume > 500000) {
      score += 10;
      detalles.push({ factor: 'Volumen normal', puntos: 10 });
    }
    
    const pe = stock.pe;
    if (pe && pe < 25) {
      score += 20;
      detalles.push({ factor: 'P/E bajo (<25)', puntos: 20 });
    } else if (pe && pe < 35) {
      score += 10;
      detalles.push({ factor: 'P/E moderado', puntos: 10 });
    } else if (pe > 50) {
      score -= 10;
      detalles.push({ factor: 'P/E muy alto (>50)', puntos: -10 });
    }
    
    if (changePercent > 0) {
      score += 15;
      detalles.push({ factor: 'Tendencia alcista', puntos: 15 });
    }
    
    if (changePercent > 3) {
      score += 20;
      detalles.push({ factor: 'Momentum fuerte (+3%)', puntos: 20 });
    } else if (changePercent > 1.5) {
      score += 12;
      detalles.push({ factor: 'Momentum positivo', puntos: 12 });
    }
    
    if (changePercent < -3) {
      score -= 20;
      detalles.push({ factor: 'Caída fuerte (<-3%)', puntos: -20 });
    }
    
    score = Math.max(0, Math.min(150, score));
    
    let recomendacion = '🔴 ESPERAR';
    let probabilidad = '<65%';
    
    if (score >= 130) {
      recomendacion = '🟢 COMPRA AGRESIVA';
      probabilidad = '85%+';
    } else if (score >= 110) {
      recomendacion = '🟢 COMPRA MODERADA';
      probabilidad = '75-85%';
    } else if (score >= 90) {
      recomendacion = '🟡 ESPECULATIVA';
      probabilidad = '65-75%';
    } else if (score >= 70) {
      recomendacion = '🟡 RIESGO ALTO';
      probabilidad = '50-65%';
    }
    
    const entrada = stock.price;
    const target1 = entrada * 1.015;
    const target2 = entrada * 1.035;
    const stopLoss = entrada * 0.98;
    
    return {
      success: true,
      ticker: ticker,
      precio: stock.price,
      cambio: changePercent,
      score: score,
      scoreMax: 150,
      recomendacion: recomendacion,
      probabilidad: probabilidad,
      confianza: (score / 150 * 100).toFixed(1),
      detalles: detalles,
      entrada: entrada.toFixed(2),
      target1: target1.toFixed(2),
      target2: target2.toFixed(2),
      stopLoss: stopLoss.toFixed(2),
      rsi: rsi?.toFixed(2),
      pe: pe?.toFixed(2),
      volume: stock.volume
    };
  } catch (error) {
    console.error('Error analyzing stock:', error.message);
    return { success: false, error: error.message };
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: '✅ Sistema operativo', timestamp: new Date().toISOString() });
});

app.get('/api/stock/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const data = await getStockData(ticker);
    res.json(data || { success: false, error: 'Stock not found' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: 'Se requiere ticker' });
    const result = await analyzeStock(ticker);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/news/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    
    try {
      const response = await axios.get(
        'https://finnhub.io/api/v1/company-news',
        { params: { symbol: ticker, token: APIS.finnhub.apiKey }, timeout: 5000 }
      );
      
      const noticias = response.data.slice(0, 10).map(news => ({
        titulo: news.headline,
        resumen: news.summary,
        source: news.source,
        url: news.url,
        fecha: new Date(news.datetime * 1000).toISOString()
      }));
      
      return res.json({ success: true, ticker, noticias });
    } catch (err) {
      console.log('Finnhub timeout, trying NewsAPI...');
    }
    
    const response = await axios.get(
      'https://newsapi.org/v2/everything',
      {
        params: {
          q: `${ticker} stock`,
          sortBy: 'publishedAt',
          language: 'en',
          apiKey: APIS.newsapi.apiKey,
          pageSize: 10
        },
        timeout: 5000
      }
    );
    
    const noticias = response.data.articles.map(article => ({
      titulo: article.title,
      resumen: article.description,
      source: article.source.name,
      url: article.url,
      fecha: article.publishedAt
    }));
    
    res.json({ success: true, ticker, noticias });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/market/europe/:hour', async (req, res) => {
  try {
    const hour = req.params.hour;
    const europeanStocks = ['SAP', 'ASML', 'LVMH', 'SIEMENS', 'UNILEVER', 'HSBC', 'SHELL', 'SANOFI'];
    
    const results = await Promise.all(europeanStocks.map(t => analyzeStock(t)));
    const validos = results.filter(s => s && s.success);
    validos.sort((a, b) => b.score - a.score);
    
    res.json({
      success: true,
      hour: hour,
      market: 'Europe',
      timestamp: new Date().toISOString(),
      total: validos.length,
      recommendations: validos.slice(0, 10).map(s => ({
        ticker: s.ticker,
        score: s.score,
        recomendacion: s.recomendacion,
        entrada: s.entrada,
        target: s.target2,
        stopLoss: s.stopLoss
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/market/usa/:hour', async (req, res) => {
  try {
    const hour = req.params.hour;
    const usaStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'NFLX'];
    
    const results = await Promise.all(usaStocks.map(t => analyzeStock(t)));
    const validos = results.filter(s => s && s.success);
    validos.sort((a, b) => b.score - a.score);
    
    res.json({
      success: true,
      hour: hour,
      market: 'USA',
      timestamp: new Date().toISOString(),
      total: validos.length,
      recommendations: validos.slice(0, 10).map(s => ({
        ticker: s.ticker,
        score: s.score,
        recomendacion: s.recomendacion,
        entrada: s.entrada,
        target: s.target2,
        stopLoss: s.stopLoss
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 TRADING DASHBOARD - BACKEND OPERATIVO');
  console.log('='.repeat(60));
  console.log(`✅ Servidor en puerto ${PORT}`);
  console.log(`📍 API: https://trading-app-iu7i.onrender.com/api/health`);
  console.log('='.repeat(60) + '\n');
});
