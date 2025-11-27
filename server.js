# ============================================================================
# BACKEND NODE.JS - OBTIENE DATOS REALES DE INTERNET
# ============================================================================
# Archivo: server.js
# Instalación: npm install express cors axios dotenv
# Uso: node server.js
# Acceso: http://localhost:3000
# ============================================================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================================
// CONFIGURACIÓN DE APIs
// ============================================================================

const APIS = {
  // Yahoo Finance (gratis, sin API key)
  yahooFinance: {
    baseUrl: "https://query1.finance.yahoo.com"
  },
  
  // Alpha Vantage (gratis, 5 calls/min)
  alphavantage: {
    apiKey: process.env.ALPHA_VANTAGE_KEY || "demo",
    baseUrl: "https://www.alphavantage.co/query"
  },
  
  // Finnhub (gratis, sin límite especial)
  finnhub: {
    apiKey: process.env.FINNHUB_KEY || "demo",
    baseUrl: "https://finnhub.io/api/v1"
  },
  
  // NewsAPI (gratis, 100 artículos/día)
  newsapi: {
    apiKey: process.env.NEWSAPI_KEY || "demo",
    baseUrl: "https://newsapi.org/v2"
  }
};

// ============================================================================
// ENDPOINT 1: OBTENER PRECIO ACTUAL + DATOS BÁSICOS
// ============================================================================

app.get('/api/stock/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    
    console.log(`📊 Obteniendo datos de ${ticker}...`);
    
    // Usar Yahoo Finance a través de axios con headers
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
      {
        params: {
          interval: '1d',
          range: '1y'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );
    
    const data = response.data.chart.result[0];
    const quote = data.meta;
    const prices = data.timestamp;
    const closes = data.indicators.quote[0].close;
    
    // Calcular cambios
    const currentPrice = closes[closes.length - 1];
    const previousClose = closes[closes.length - 2] || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    
    // Calcular RSI simplificado
    const rsi = calculateRSI(closes);
    
    res.json({
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
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      ticker: req.params.ticker
    });
  }
});

// ============================================================================
// ENDPOINT 2: OBTENER MÚLTIPLES STOCKS
// ============================================================================

app.post('/api/stocks', async (req, res) => {
  try {
    const { tickers } = req.body;
    
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: 'Se requiere array de tickers' });
    }
    
    console.log(`📊 Obteniendo datos de ${tickers.length} stocks...`);
    
    const results = await Promise.all(
      tickers.map(ticker => 
        axios.get(`http://localhost:3000/api/stock/${ticker}`)
          .catch(err => ({ success: false, ticker, error: err.message }))
      )
    );
    
    const successful = results.filter(r => r.data?.success);
    const failed = results.filter(r => !r.data?.success);
    
    res.json({
      success: true,
      total: tickers.length,
      successful: successful.length,
      failed: failed.length,
      stocks: successful.map(r => r.data),
      errors: failed
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ENDPOINT 3: OBTENER NOTICIAS DE UN STOCK
// ============================================================================

app.get('/api/news/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    
    console.log(`📰 Buscando noticias de ${ticker}...`);
    
    // Opción 1: Intentar con Finnhub (mejor para finance)
    try {
      const response = await axios.get(
        'https://finnhub.io/api/v1/company-news',
        {
          params: {
            symbol: ticker,
            token: APIS.finnhub.apiKey
          }
        }
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
      console.log('Finnhub no disponible, intentando NewsAPI...');
    }
    
    // Opción 2: Fallback a NewsAPI
    const response = await axios.get(
      'https://newsapi.org/v2/everything',
      {
        params: {
          q: `${ticker} stock earnings`,
          sortBy: 'publishedAt',
          language: 'en',
          apiKey: APIS.newsapi.apiKey,
          pageSize: 10
        }
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

// ============================================================================
// ENDPOINT 4: ANALIZAR STOCK (SCORING 0-150)
// ============================================================================

app.post('/api/analyze', async (req, res) => {
  try {
    const { ticker } = req.body;
    
    if (!ticker) {
      return res.status(400).json({ error: 'Se requiere ticker' });
    }
    
    console.log(`🔍 Analizando ${ticker}...`);
    
    // Obtener datos del stock
    const stockResponse = await axios.get(`http://localhost:3000/api/stock/${ticker}`);
    if (!stockResponse.data.success) {
      return res.status(400).json({ error: 'No se encontró el stock' });
    }
    
    const stock = stockResponse.data;
    
    // Calcular score (0-150)
    let score = 0;
    const detalles = [];
    
    // 1. Cambio diario (+0-20 pts)
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
    } else if (changePercent > -1) {
      score += 3;
      detalles.push({ factor: 'Cambio plano', puntos: 3 });
    }
    
    // 2. RSI (0-25 pts)
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
    
    // 3. Volumen (0-15 pts)
    if (stock.volume > 1000000) {
      score += 15;
      detalles.push({ factor: 'Volumen alto >1M', puntos: 15 });
    } else if (stock.volume > 500000) {
      score += 10;
      detalles.push({ factor: 'Volumen normal', puntos: 10 });
    }
    
    // 4. P/E ratio (0-25 pts)
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
    
    // 5. Tendencia (0-20 pts) - simulado
    const trend = changePercent > 0 ? 'UP' : 'DOWN';
    if (trend === 'UP') {
      score += 15;
      detalles.push({ factor: 'Tendencia alcista', puntos: 15 });
    }
    
    // 6. Momentum (0-20 pts) - basado en cambio
    if (changePercent > 3) {
      score += 20;
      detalles.push({ factor: 'Momentum fuerte (+3%)', puntos: 20 });
    } else if (changePercent > 1.5) {
      score += 12;
      detalles.push({ factor: 'Momentum positivo', puntos: 12 });
    }
    
    // 7. Penalidades (-30 pts)
    if (changePercent < -3) {
      score -= 20;
      detalles.push({ factor: 'Caída fuerte (<-3%)', puntos: -20 });
    }
    
    // Limitar score
    score = Math.max(0, Math.min(150, score));
    
    // Determinar recomendación
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
    
    // Calcular targets
    const entrada = stock.price;
    const target1 = entrada * 1.015; // +1.5%
    const target2 = entrada * 1.035; // +3.5%
    const stopLoss = entrada * 0.98; // -2%
    
    res.json({
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
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ENDPOINT 5: OBTENER MERCADO EUROPEO A UNA HORA
// ============================================================================

app.get('/api/market/europe/:hour', async (req, res) => {
  try {
    const hour = req.params.hour;
    
    console.log(`🌅 Analizando Europa a las ${hour}...`);
    
    // Stocks europeos recomendados
    const europeanStocks = [
      'SAP', 'ASML', 'LVMH', 'SIEMENS', 'UNILEVER',
      'HSBC', 'SHELL', 'SANOFI', 'DANONE', 'PRYSMIAN'
    ];
    
    // Obtener datos de todos
    const stocksData = await Promise.all(
      europeanStocks.map(ticker => 
        axios.get(`http://localhost:3000/api/analyze`, { 
          data: { ticker } 
        }).then(r => r.data).catch(e => null)
      )
    );
    
    // Filtrar válidos y ordenar por score
    const validos = stocksData.filter(s => s && s.success);
    validos.sort((a, b) => b.score - a.score);
    
    // Top 10
    const top10 = validos.slice(0, 10);
    
    res.json({
      success: true,
      hour: hour,
      market: 'Europe',
      timestamp: new Date().toISOString(),
      total: validos.length,
      top10: top10,
      recommendations: top10.map(s => ({
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

// ============================================================================
// ENDPOINT 6: OBTENER MERCADO USA A UNA HORA
// ============================================================================

app.get('/api/market/usa/:hour', async (req, res) => {
  try {
    const hour = req.params.hour;
    
    console.log(`🌙 Analizando USA a las ${hour}...`);
    
    // Stocks USA recomendados
    const usaStocks = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA',
      'TSLA', 'META', 'NFLX', 'AMD', 'ADBE'
    ];
    
    // Obtener datos de todos
    const stocksData = await Promise.all(
      usaStocks.map(ticker => 
        axios.post(`http://localhost:3000/api/analyze`, { ticker })
          .then(r => r.data).catch(e => null)
      )
    );
    
    // Filtrar válidos y ordenar por score
    const validos = stocksData.filter(s => s && s.success);
    validos.sort((a, b) => b.score - a.score);
    
    // Top 10
    const top10 = validos.slice(0, 10);
    
    res.json({
      success: true,
      hour: hour,
      market: 'USA',
      timestamp: new Date().toISOString(),
      total: validos.length,
      top10: top10,
      recommendations: top10.map(s => ({
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

// ============================================================================
// ENDPOINT 7: HEALTH CHECK
// ============================================================================

app.get('/api/health', (req, res) => {
  res.json({
    status: '✅ Sistema operativo',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/stock/:ticker',
      'POST /api/stocks',
      'GET /api/news/:ticker',
      'POST /api/analyze',
      'GET /api/market/europe/:hour',
      'GET /api/market/usa/:hour'
    ]
  });
});

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

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

// ============================================================================
// INICIAR SERVIDOR
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 SERVIDOR DE TRADING - DATOS REALES EN VIVO');
  console.log('='.repeat(80));
  console.log(`\n✅ Servidor iniciado en http://localhost:${PORT}`);
  console.log('\n📍 Endpoints disponibles:');
  console.log(`   GET  /api/health                      - Estado del sistema`);
  console.log(`   GET  /api/stock/:ticker               - Datos de un stock (ej: AAPL)`);
  console.log(`   POST /api/stocks                      - Múltiples stocks`);
  console.log(`   GET  /api/news/:ticker                - Noticias`);
  console.log(`   POST /api/analyze                     - Análisis con scoring`);
  console.log(`   GET  /api/market/europe/:hour         - Análisis mercado europeo`);
  console.log(`   GET  /api/market/usa/:hour            - Análisis mercado USA`);
  console.log('\n🌐 Abre: http://localhost:3000 en tu navegador\n');
  console.log('='.repeat(80) + '\n');
});
