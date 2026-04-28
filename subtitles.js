'use strict';
const axios = require('axios');

const API_KEY  = process.env.OPENSUBTITLES_API_KEY;
const USERNAME = process.env.OPENSUBTITLES_USERNAME;
const PASSWORD = process.env.OPENSUBTITLES_PASSWORD;
const API_BASE = 'https://api.opensubtitles.com/api/v1';

const enabled = !!(API_KEY && USERNAME && PASSWORD);

// JWT token state
let jwtToken   = null;
let jwtExpires = 0; // epoch ms

// Cache: fileId → SRT string (permanent, cleared on restart)
const srtCache  = new Map();
// Cache: fileId → { link, fetchedAt } — links valid ~24h, we refresh after 20h
const linkCache = new Map();
const LINK_TTL  = 20 * 60 * 60 * 1000;
const TOKEN_TTL = 23 * 60 * 60 * 1000; // re-login after 23h

function baseHeaders() {
  return { 'Api-Key': API_KEY, 'User-Agent': 'StreamIMDbConnector/1.2', 'Content-Type': 'application/json' };
}

function authHeaders() {
  return { ...baseHeaders(), 'Authorization': `Bearer ${jwtToken}` };
}

async function ensureLogin() {
  if (jwtToken && Date.now() < jwtExpires) return true;
  try {
    const res = await axios.post(
      `${API_BASE}/login`,
      { username: USERNAME, password: PASSWORD },
      { headers: baseHeaders(), timeout: 8000 }
    );
    jwtToken   = res.data?.token;
    jwtExpires = Date.now() + TOKEN_TTL;
    console.log('[subs] Login OpenSubtitles OK');
    return !!jwtToken;
  } catch (e) {
    console.log('[subs] Erro no login:', e.message);
    return false;
  }
}

async function searchSubtitles(imdbId, season, episode) {
  if (!enabled) return [];

  const params = {
    imdb_id:         imdbId,
    order_by:        'download_count',
    order_direction: 'desc',
  };

  if (season && episode) {
    params.season_number  = Number(season);
    params.episode_number = Number(episode);
    params.type = 'episode';
  } else {
    params.type = 'movie';
  }

  try {
    const res  = await axios.get(`${API_BASE}/subtitles`, { params, headers: baseHeaders(), timeout: 6000 });
    const data = res.data?.data || [];

    // One entry per language — highest download_count first (API already sorted)
    const byLang = {};
    for (const item of data) {
      const lang   = item.attributes?.language;
      const fileId = item.attributes?.files?.[0]?.file_id;
      if (lang && fileId && !byLang[lang]) {
        byLang[lang] = String(fileId);
      }
    }

    const found = Object.entries(byLang).map(([lang, fileId]) => ({ lang, fileId }));
    console.log(`[subs] ${found.length} língua(s) — ${found.map(f => f.lang).join(',') || 'nenhuma'}`);
    return found;
  } catch (e) {
    console.log('[subs] Erro na pesquisa:', e.message);
    return [];
  }
}

async function getDownloadLink(fileId) {
  const cached = linkCache.get(fileId);
  if (cached && Date.now() - cached.fetchedAt < LINK_TTL) return cached.link;

  const ok = await ensureLogin();
  if (!ok) return null;

  try {
    const res  = await axios.post(
      `${API_BASE}/download`,
      { file_id: parseInt(fileId, 10) },
      { headers: authHeaders(), timeout: 8000 }
    );
    const link = res.data?.link;
    if (!link) return null;
    linkCache.set(fileId, { link, fetchedAt: Date.now() });
    return link;
  } catch (e) {
    const body = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    console.log(`[subs] Erro ao obter link (${e.response?.status}): ${body}`);
    return null;
  }
}

async function getSrtContent(fileId) {
  if (srtCache.has(fileId)) return srtCache.get(fileId);

  const link = await getDownloadLink(fileId);
  if (!link) return null;

  try {
    const res     = await axios.get(link, { timeout: 10000, responseType: 'text' });
    const content = typeof res.data === 'string' ? res.data : String(res.data);
    srtCache.set(fileId, content);
    return content;
  } catch (e) {
    console.log('[subs] Erro ao descarregar SRT:', e.message);
    return null;
  }
}

module.exports = { searchSubtitles, getSrtContent, enabled };
