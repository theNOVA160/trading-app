const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));

axios.defaults.headers.common['Expect'] = '';
axios.defaults.timeout = 8000;

// ===== SECTORES =====
const SECTORES = {
  tech: { stocks: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'ASML', 'NFLX', 'AMD'], descripcion: 'Tecnología de alto crecimiento. Empresas líderes en software, semiconductores e IA.', market: 'usa' },
  banks: { stocks: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'BBVA', 'SANTANDER', 'ING'], descripcion: 'Sector bancario. Instituciones financieras globales con volumen alto.', market: 'mixed' },
  energy: { stocks: ['XOM', 'CVX', 'COP', 'MPC', 'SHELL', 'BP', 'TTE', 'ENB'], descripcion: 'Energía e hidrocarburos. Productores de petróleo y gas con dividendos.', market: 'mixed' },
  pharma: { stocks: ['JNJ', 'PFE', 'AZN', 'MRK', 'RHHBY', 'SANOFI', 'NOVARTIS', 'GSK'], descripcion: 'Farmacéutica. Empresas de healthcare con investigación innovadora.', market: 'mixed' },
  retail: { stocks: ['AMZN', 'WMT', 'COST', 'TJX', 'INDITEX', 'ALLP', 'MC', 'ASAI'], descripcion: 'Retail y consumo. Minoristas con presencia omnicanal.', market: 'mixed' },
  industrial: { stocks: ['CAT', 'BA', 'HON', 'ITM', 'SIEMENS', 'ABB', 'EOAN', 'BMCE'], descripcion: 'Industrial y manufactura. Empresas de maquinaria e infraestructura.', market: 'mixed' }
};

// ===== STOCKS GLOBALES PARA SCANNER =====
const STOCKS_GLOBALES = {
  tech_big: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'ASML', 'NFLX', 'AMD', 'QCOM', 'TSLA'],
  tech_mid: ['CRSR', 'ORCL', 'CRM', 'ADBE', 'INTC', 'SQ', 'PYPL', 'NOW', 'SNOW', 'PTON'],
  banks: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'BBVA', 'SANTANDER', 'ING', 'BCS', 'RBS'],
  energy: ['XOM', 'CVX', 'COP', 'MPC', 'SHELL', 'BP', 'TTE', 'ENB', 'MRO', 'EOG'],
  pharma: ['JNJ', 'PFE', 'AZN', 'MRK', 'RHHBY', 'SANOFI', 'NOVARTIS', 'GSK', 'ELI', 'ABBV'],
  retail: ['AMZN', 'WMT', 'COST', 'TJX', 'INDITEX', 'ALLP', 'MC', 'ASAI', 'HD', 'LMT'],
  industrial: ['CAT', 'BA', 'HON', 'ITM', 'SIEMENS', 'ABB', 'EOAN', 'BMCE', 'GE', 'CSL'],
  europe_blue: ['SAP', 'ASML', 'LVMH', 'SIEMENS', 'UNILEVER', 'HSBC', 'SHELL', 'SANOFI', 'NOVO', 'RELX']
};

// ===== FUNCIONES TÉCNICAS =====
function calculateRSI(prices, period = 14) {
  if (prices.length < period) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period, avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function detectTrend(prices, period = 5) {
  if (prices.length < period) return 'neutral';
  const recent = prices.slice(-period).reduce((a, b) => a + b) / period;
  const before = prices.slice(-period * 2, -period).reduce((a, b) => a + b) / period;
  if (recent > before * 1.02) return 'bullish';
  if (recent < before * 0.98) return 'bearish';
  return 'neutral';
}

function detectReversal(prices) {
  if (prices.length < 3) return null;
  const last3 = prices.slice(-3);
  if (last3 > last3 && last3 > last3 && last3 > last3) return 'upside_reversal';
  return null;
}

// ===== OBTENER DATOS DE STOCK =====
async function getStockData(ticker) {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
      params: { interval: '1d', range: '1y' },
      headers: { 'User-Agent': 'Mozilla/5.0', 'Expect': '' },
      timeout: 8000
    });
    
    const data = response.data.chart.result;
    const quote = data.meta;
    const closes = data.indicators.quote.close;
    const volumes = data.indicators.quote.volume;
    
    const currentPrice = closes[closes.length - 1];
    const previousClose = closes[closes.length - 2] || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    const rsi = calculateRSI(closes);
    const trend = detectTrend(closes);
    const reversal = detectReversal(closes);
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b) / 20;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = currentVolume / avgVolume;
    
    return {
      success: true,
      ticker: ticker,
      price: currentPrice,
      change: change.toFixed(2),
      changePercent: changePercent.toFixed(2),
      volume: currentVolume,
      avgVolume: avgVolume,
      volumeRatio: volumeRatio.toFixed(2),
      rsi: rsi,
      trend: trend,
      reversal: reversal,
      pe: (quote.regularMarketPrice / (quote.epsCurrentYear || 1)).toFixed(2),
      timestamp: new Date(quote.regularMarketTime * 1000).toISOString(),
      prices: closes.slice(-30)
    };
  } catch (error) {
    return null;
  }
}

// ===== ANALIZAR STOCK (MOTOR PRINCIPAL) =====
async function analyzeStock(ticker) {
  try {
    const stock = await getStockData(ticker);
    if (!stock || !stock.success) return { success: false, error: 'Stock no encontrado' };
    
    let score = 0;
    const razones = [];
    const changePercent = parseFloat(stock.changePercent);
    
    // RSI (Sobrevendido = entrada)
    const rsi = stock.rsi;
    if (rsi && rsi < 30) {
      score += 35;
      razones.push({ tipo: 'rsi_oversold', texto: `RSI ${rsi.toFixed(0)}: SOBREVENDIDO - Buena oportunidad`, puntos: 35, icon: '🎯' });
    } else if (rsi && rsi > 40 && rsi < 60) {
      score += 20;
      razones.push({ tipo: 'rsi_neutral', texto: `RSI ${rsi.toFixed(0)}: Neutral`, puntos: 20, icon: '✓' });
    } else if (rsi && rsi > 70) {
      score -= 20;
      razones.push({ tipo: 'rsi_overbought', texto: `RSI ${rsi.toFixed(0)}: SOBRECOMPRADO`, puntos: -20, icon: '⛔' });
    }
    
    // Momentum
    if (changePercent > 5) {
      score += 25;
      razones.push({ tipo: 'momentum_fuerte', texto: `Subida fuerte (+${changePercent.toFixed(2)}%)`, puntos: 25, icon: '🚀' });
    } else if (changePercent > 2) {
      score += 15;
      razones.push({ tipo: 'momentum_positivo', texto: `Subida moderada (+${changePercent.toFixed(2)}%)`, puntos: 15, icon: '📈' });
    } else if (changePercent > 0) {
      score += 5;
      razones.push({ tipo: 'momentum_neutral', texto: `Pequeña ganancia (+${changePercent.toFixed(2)}%)`, puntos: 5, icon: '➡️' });
    }
    
    // Reversión
    if (stock.reversal === 'upside_reversal') {
      score += 30;
      razones.push({ tipo: 'reversal', texto: '🔄 Señal de reversión alcista', puntos: 30, icon: '💡' });
    }
    
    // Volumen
    if (stock.volumeRatio > 1.5) {
      score += 25;
      razones.push({ tipo: 'volumen_alto', texto: `Volumen ${stock.volumeRatio}x - Confirmado`, puntos: 25, icon: '📊' });
    } else if (stock.volumeRatio > 1.2) {
      score += 12;
      razones.push({ tipo: 'volumen_moderado', texto: `Volumen ${stock.volumeRatio}x`, puntos: 12, icon: '📉' });
    }
    
    // P/E
    const pe = parseFloat(stock.pe);
    if (pe < 20) {
      score += 15;
      razones.push({ tipo: 'pe_bajo', texto: `P/E ${pe.toFixed(1)}: Subvalorado`, puntos: 15, icon: '💰' });
    } else if (pe < 35) {
      score += 8;
      razones.push({ tipo: 'pe_moderado', texto: `P/E ${pe.toFixed(1)}: Valuación justa`, puntos: 8, icon: '✓' });
    } else if (pe > 50) {
      score -= 15;
      razones.push({ tipo: 'pe_alto', texto: `P/E ${pe.toFixed(1)}: Sobrevalorado`, puntos: -15, icon: '⛔' });
    }
    
    // Tendencia
    if (stock.trend === 'bullish') {
      score += 20;
      razones.push({ tipo: 'trend_bullish', texto: '📈 Tendencia alcista', puntos: 20, icon: '✅' });
    } else if (stock.trend === 'bearish') {
      score -= 20;
      razones.push({ tipo: 'trend_bearish', texto: '📉 Tendencia bajista', puntos: -20, icon: '❌' });
    }
    
    score = Math.max(0, Math.min(150, score));
    
    let recomendacion, accion, urgencia, probabilidad;
    if (score >= 120) {
      recomendacion = '🟢 COMPRA INMEDIATA';
      accion = 'ENTRA AHORA - Múltiples señales alcistas';
      urgencia = 'MÁXIMA - Ventana abierta';
      probabilidad = '85%+';
    } else if (score >= 100) {
      recomendacion = '🟢 COMPRA FUERTE';
      accion = 'ENTRA en dips';
      urgencia = 'Alta - Buena oportunidad';
      probabilidad = '75-85%';
    } else if (score >= 80) {
      recomendacion = '🟡 CONSIDERAR';
      accion = 'ESPERA confirmación';
      urgencia = 'Media - Observa';
      probabilidad = '65-75%';
    } else if (score >= 60) {
      recomendacion = '🟡 NEUTRAL';
      accion = 'ESPERA señal clara';
      urgencia = 'Baja - Sin prisa';
      probabilidad = '50-65%';
    } else {
      recomendacion = '🔴 NO ENTRAR';
      accion = 'ESPERA - Señales negativas';
      urgencia = 'Muy baja';
      probabilidad = '<50%';
    }
    
    const entrada = stock.price;
    const target1 = entrada * 1.02;
    const target2 = entrada * 1.05;
    const stopLoss = entrada * 0.97;
    
    return {
      success: true,
      ticker: stock.ticker,
      precio: stock.price,
      cambio: changePercent,
      score: score,
      recomendacion: recomendacion,
      accion: accion,
      urgencia: urgencia,
      probabilidad: probabilidad,
      confianza: (score / 150 * 100).toFixed(1),
      razones: razones,
      entrada: entrada.toFixed(2),
      target1: target1.toFixed(2),
      target2: target2.toFixed(2),
      stopLoss: stopLoss.toFixed(2),
      rsi: rsi?.toFixed(2),
      pe: stock.pe,
      volume: stock.volume,
      trend: stock.trend,
      reversal: stock.reversal,
      volumeRatio: stock.volumeRatio
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ===== ENDPOINTS =====
app.get('/api/health', (req, res) => {
  res.json({ status: '✅ Operativo', timestamp: new Date().toISOString() });
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

app.get('/api/market/europe/:hour', async (req, res) => {
  try {
    const europeanStocks = ['SAP', 'ASML', 'LVMH', 'SIEMENS', 'UNILEVER', 'HSBC', 'SHELL', 'SANOFI'];
    const results = await Promise.all(europeanStocks.map(t => analyzeStock(t)));
    const validos = results.filter(s => s && s.success).sort((a, b) => b.score - a.score);
    
    res.json({
      success: true,
      hour: req.params.hour,
      market: 'Europe',
      timestamp: new Date().toISOString(),
      total: validos.length,
      recommendations: validos.slice(0, 10).map(s => ({ ticker: s.ticker, score: s.score, recomendacion: s.recomendacion, entrada: s.entrada, target: s.target2, stopLoss: s.stopLoss }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/market/usa/:hour', async (req, res) => {
  try {
    const usaStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'NFLX'];
    const results = await Promise.all(usaStocks.map(t => analyzeStock(t)));
    const validos = results.filter(s => s && s.success).sort((a, b) => b.score - a.score);
    
    res.json({
      success: true,
      hour: req.params.hour,
      market: 'USA',
      timestamp: new Date().toISOString(),
      total: validos.length,
      recommendations: validos.slice(0, 10).map(s => ({ ticker: s.ticker, score: s.score, recomendacion: s.recomendacion, entrada: s.entrada, target: s.target2, stopLoss: s.stopLoss }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/market/sector/:sector/:hour', async (req, res) => {
  try {
    const { sector } = req.params;
    const sectorKey = sector.toLowerCase();
    if (!SECTORES[sectorKey]) return res.status(400).json({ success: false, error: 'Sector no encontrado' });
    
    const stocks = SECTORES[sectorKey].stocks;
    const results = await Promise.all(stocks.map(t => analyzeStock(t)));
    const validos = results.filter(s => s && s.success).sort((a, b) => b.score - a.score);
    
    res.json({
      success: true,
      sector: sectorKey,
      sectorInfo: SECTORES[sectorKey],
      timestamp: new Date().toISOString(),
      total: validos.length,
      recommendations: validos.slice(0, 10).map(s => ({ ticker: s.ticker, score: s.score, recomendacion: s.recomendacion, accion: s.accion, entrada: s.entrada, target: s.target2, stopLoss: s.stopLoss, urgencia: s.urgencia }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/market/custom/:hour', async (req, res) => {
  try {
    let { stocks } = req.body;
    if (!stocks || stocks.length === 0) return res.status(400).json({ success: false, error: 'Se requieren stocks' });
    if (typeof stocks === 'string') stocks = stocks.split(',').map(s => s.trim().toUpperCase());
    
    const results = await Promise.all(stocks.map(t => analyzeStock(t)));
    const validos = results.filter(s => s && s.success).sort((a, b) => b.score - a.score);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      total: validos.length,
      recommendations: validos.map(s => ({ ticker: s.ticker, score: s.score, recomendacion: s.recomendacion, accion: s.accion, entrada: s.entrada, target: s.target2, stopLoss: s.stopLoss, urgencia: s.urgencia }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/sectores', (req, res) => {
  const info = Object.keys(SECTORES).map(key => ({
    id: key,
    nombre: key.charAt(0).toUpperCase() + key.slice(1),
    descripcion: SECTORES[key].descripcion,
    stocks: SECTORES[key].stocks.length
  }));
  res.json({ success: true, sectores: info });
});

// ===== SCANNER ENDPOINTS =====
app.get('/api/scanner/quick', async (req, res) => {
  try {
    const topStocks = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'TSLA', 'NFLX', 'AMD', 'JPM', 'BAC', 'WFC', 'BBVA', 'SANTANDER', 'XOM', 'CVX', 'SHELL', 'BP', 'JNJ', 'PFE', 'AZN', 'SANOFI', 'AMZN', 'WMT', 'COST', 'INDITEX', 'SAP', 'ASML', 'LVMH', 'SIEMENS', 'UNILEVER', 'CRSR', 'ORCL', 'CRM', 'SQ', 'PYPL', 'BA', 'HON', 'ABB', 'GS', 'MS', 'ING', 'ENB', 'MRO', 'EOG', 'MRK', 'RHHBY', 'NOVARTIS', 'GSK'];
    
    const results = await Promise.all(topStocks.map(t => analyzeStock(t)));
    const validos = results.filter(r => r && r.success);
    const opportunities = validos.filter(r => r.score >= 100).sort((a, b) => b.score - a.score).slice(0, 15);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      total_scanned: topStocks.length,
      opportunities_found: opportunities.length,
      recommendations: opportunities.map(s => ({ ticker: s.ticker, score: s.score, recomendacion: s.recomendacion, accion: s.accion, entrada: s.entrada, target: s.target2, stopLoss: s.stopLoss, urgencia: s.urgencia }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/scanner/by-criteria/:criteria', async (req, res) => {
  try {
    const { criteria } = req.params;
    const topStocks = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'TSLA', 'NFLX', 'AMD', 'JPM', 'BAC', 'WFC', 'BBVA', 'SANTANDER', 'XOM', 'CVX', 'SHELL', 'BP', 'JNJ', 'PFE', 'AZN', 'SANOFI', 'AMZN', 'WMT', 'COST', 'INDITEX', 'SAP', 'ASML', 'LVMH', 'SIEMENS'];
    
    const results = await Promise.all(topStocks.map(t => analyzeStock(t)));
    const validos = results.filter(r => r && r.success);
    
    let filtered;
    switch(criteria.toLowerCase()) {
      case 'rsi_oversold': filtered = validos.filter(r => r.rsi && parseFloat(r.rsi) < 30); break;
      case 'high_volume': filtered = validos.filter(r => r.volumeRatio && parseFloat(r.volumeRatio) > 1.8); break;
      case 'reversal': filtered = validos.filter(r => r.reversal === 'upside_reversal'); break;
      case 'bullish_trend': filtered = validos.filter(r => r.trend === 'bullish'); break;
      case 'undervalued': filtered = validos.filter(r => r.pe && parseFloat(r.pe) < 20); break;
      case 'momentum': filtered = validos.filter(r => parseFloat(r.cambio) > 3); break;
      default: filtered = validos;
    }
    
    const opportunities = filtered.sort((a, b) => b.score - a.score).slice(0, 15);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      criteria: criteria,
      total_scanned: topStocks.length,
      matching: opportunities.length,
      recommendations: opportunities.map(s => ({ ticker: s.ticker, score: s.score, recomendacion: s.recomendacion, accion: s.accion, entrada: s.entrada, target: s.target2, stopLoss: s.stopLoss, urgencia: s.urgencia, rsi: s.rsi, pe: s.pe, trend: s.trend, volumeRatio: s.volumeRatio }))
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
  console.log('🚀 TRADING DASHBOARD v4 - OPERATIVO');
  console.log('='.repeat(60));
  console.log(`✅ Servidor en puerto ${PORT}`);
  console.log('='.repeat(60) + '\n');
});
