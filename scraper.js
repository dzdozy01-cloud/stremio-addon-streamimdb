'use strict';
const axios = require('axios');
const { searchSubtitles } = require('./subtitles');

const ADDON_URL = process.env.ADDON_URL
  || process.env.RENDER_EXTERNAL_URL
  || `http://localhost:${process.env.PORT || 7000}`;

const VAPLAYER_API_URL = process.env.VAPLAYER_API_URL || 'https://streamdata.vaplayer.ru/api.php';
const BRIGHTPATH_BASE  = 'https://brightpathsignals.com/embed';

const CACHE_TTL = parseInt(process.env.CACHE_TTL_MS) || 2 * 60 * 60 * 1000; // 2h
const MAX_QUEUE = parseInt(process.env.MAX_QUEUE)    || 3;

const cache   = new Map();
const pending = new Map();
let activeScrapes = 0;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function cacheKey(imdbId, type, season, episode) {
  return `${imdbId}:${type}:${season || ''}:${episode || ''}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { cache.delete(key); return null; }
  return { url: entry.url, subtitles: entry.subtitles };
}

function setCached(key, { url, subtitles }) {
  cache.set(key, { url, subtitles, timestamp: Date.now() });
  console.log(`[cache] Guardado: ${key} — ${subtitles.length} legenda(s) (cache size: ${cache.size})`);
}

// Testa um stream_url:
//   verified=true  → CDN respondeu 200 com playlist HLS válida
//   verified=false → CDN respondeu 4xx (stream provavelmente funciona)
//   null           → CDN inacessível (timeout / 5xx)
async function resolveStream(m3u8Url, referer) {
  for (const headers of [{ 'User-Agent': UA, Referer: referer }, { 'User-Agent': UA }]) {
    try {
      const res = await axios.get(m3u8Url, {
        headers,
        timeout: 6000,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: s => s < 500,
      });
      if (res.status === 200) {
        const body = typeof res.data === 'string' ? res.data : '';
        if (body.trimStart().startsWith('#EXTM3U'))
          return { url: m3u8Url, verified: true };
      }
      return { url: m3u8Url, verified: false };
    } catch { /* timeout ou erro de rede — tenta sem Referer */ }
  }
  return null;
}

async function doFetch(imdbId, type, season, episode) {
  const referer = type === 'series'
    ? `${BRIGHTPATH_BASE}/tv/${imdbId}/${season}/${episode}`
    : `${BRIGHTPATH_BASE}/movie/${imdbId}`;

  const params = { imdb: imdbId, type: type === 'series' ? 'tv' : 'movie' };
  if (type === 'series') { params.season = season; params.episode = episode; }

  let apiRes;
  try {
    apiRes = await axios.get(VAPLAYER_API_URL, {
      params,
      headers: {
        'User-Agent': UA,
        'Referer': referer,
        'Origin': 'https://brightpathsignals.com',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 10000,
      maxRedirects: 5,
    });
  } catch (e) {
    console.error('[scraper] Erro na chamada API:', e.message);
    return null;
  }

  const body = apiRes.data;
  console.log(`[scraper] API ${apiRes.status} — ${JSON.stringify(body).substring(0, 200)}`);

  if (apiRes.status !== 200 || !body || !body.data) {
    console.log('[scraper] Resposta inválida ou erro da API');
    return null;
  }

  const streamUrls = body.data.stream_urls;
  if (!Array.isArray(streamUrls) || !streamUrls.length) {
    console.log('[scraper] Nenhum stream_url na resposta');
    return null;
  }

  const [results, subResults] = await Promise.all([
    Promise.all(streamUrls.map(u => resolveStream(u, referer))),
    searchSubtitles(imdbId, season, episode),
  ]);

  // Constrói URLs do proxy local para cada fileId (URL fresca gerada em cada play)
  const subtitles = subResults.map(({ lang, fileId }) => ({
    id: lang, url: `${ADDON_URL}/subs/${fileId}`, lang,
  }));

  const verified = results.find(r => r?.verified);
  if (verified) {
    console.log(`[scraper] Fonte verificada (200)`);
    return { url: verified.url, subtitles };
  }

  const fallback = results.find(r => r && !r.verified);
  if (fallback) {
    console.log('[scraper] Fonte acessível (CDN bloqueou pré-fetch)');
    return { url: fallback.url, subtitles };
  }

  console.log('[scraper] Todas as fontes inacessíveis — a usar primeira como último recurso');
  return { url: streamUrls[0], subtitles };
}

async function fetchVideoSource(imdbId, type = 'movie', season = null, episode = null) {
  if (!imdbId || !imdbId.startsWith('tt')) throw new Error(`ID IMDb inválido: ${imdbId}`);

  const key = cacheKey(imdbId, type, season, episode);

  // 1. Cache hit
  const cached = getCached(key);
  if (cached) { console.log(`[cache] Hit: ${key}`); return { ...cached, type: 'direct' }; }

  // 2. Deduplicação
  if (pending.has(key)) {
    console.log(`[cache] Dedup: aguardando fetch em curso para ${key}`);
    const result = await pending.get(key);
    return result ? { ...result, type: 'direct' } : null;
  }

  // 3. Rejeição por sobrecarga
  if (activeScrapes >= MAX_QUEUE) {
    console.log(`[scraper] Sobrecarga (${activeScrapes} pedidos activos) — a rejeitar`);
    return null;
  }

  // 4. Novo fetch
  activeScrapes++;
  const fetchPromise = doFetch(imdbId, type, season, episode)
    .then(result => {
      if (result) setCached(key, result);
      pending.delete(key);
      activeScrapes = Math.max(0, activeScrapes - 1);
      return result;
    })
    .catch(err => {
      console.error('[scraper] Erro:', err.message);
      pending.delete(key);
      activeScrapes = Math.max(0, activeScrapes - 1);
      return null;
    });

  pending.set(key, fetchPromise);
  const result = await fetchPromise;
  return result ? { ...result, type: 'direct' } : null;
}

function getStatus() {
  const now = Date.now();
  const entries = [];
  for (const [key, entry] of cache.entries()) {
    entries.push({ key, ageSeconds: Math.floor((now - entry.timestamp) / 1000), subtitles: entry.subtitles.length });
  }
  return {
    activeScrapes,
    maxQueue: MAX_QUEUE,
    cache: { size: cache.size, ttlSeconds: Math.floor(CACHE_TTL / 1000), entries },
  };
}

module.exports = { fetchVideoSource, getStatus };
