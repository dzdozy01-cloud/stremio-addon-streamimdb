'use strict';
const axios  = require('axios');
const AdmZip = require('adm-zip');

const API_KEY = process.env.SUBDL_API_KEY;
const API_URL = 'https://api.subdl.com/api/v1/subtitles';
const DL_BASE = 'https://dl.subdl.com';

const enabled = !!API_KEY;

// Línguas aceites → código ISO devolvido ao Stremio
const LANG_MAP = {
  english: 'en',
  portuguese: 'pt',
  'brazilian-portuguese': 'pt-BR',
  'pt-br': 'pt-BR',
  'portuguese (brazil)': 'pt-BR',
  'portuguese brazil': 'pt-BR',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
};

const WANTED_LANGS = new Set(['en', 'pt', 'pt-BR']);

// Cache: "fileId:season:episode" → SRT content
const srtCache = new Map();

async function searchSubtitles(imdbId, season, episode) {
  if (!enabled) return [];

  const params = { api_key: API_KEY, imdb_id: imdbId };
  if (season)  { params.season_number  = season;  }
  if (episode) { params.episode_number = episode; }

  try {
    const res = await axios.get(API_URL, { params, timeout: 5000 });
    const subs = res.data?.subtitles || [];
    console.log(`[subs] Raw langs: ${[...new Set(subs.map(s => s.lang))].join(', ') || 'nenhum'}`);

    const byLang = {};
    for (const sub of subs) {
      const rawLang = (sub.lang || '').toLowerCase();
      const lang    = LANG_MAP[rawLang];
      const fileId  = sub.url ? sub.url.split('/').pop() : null;
      if (lang && fileId && WANTED_LANGS.has(lang) && !byLang[lang]) byLang[lang] = fileId;
    }

    const found = Object.entries(byLang).map(([lang, fileId]) => ({ lang, fileId }));
    console.log(`[subs] ${found.length} pack(s) para S${season}E${episode} — langs: ${found.map(f=>f.lang).join(',') || 'nenhum'}`);
    return found;
  } catch (e) {
    console.log('[subs] Erro na pesquisa:', e.message);
    return [];
  }
}

// Descarrega ZIP, procura SRT do episódio específico dentro do pack
async function getSrtContent(fileId, season, episode) {
  const cacheKey = `${fileId}:${season}:${episode}`;
  if (srtCache.has(cacheKey)) return srtCache.get(cacheKey);

  try {
    const res = await axios.get(`${DL_BASE}/subtitle/${fileId}`, {
      responseType: 'arraybuffer',
      timeout: 10000,
    });

    const zip     = new AdmZip(Buffer.from(res.data));
    const entries = zip.getEntries().filter(e => e.entryName.toLowerCase().endsWith('.srt'));

    let entry = null;

    // 1. Procura SRT com S##E## exacto
    if (season && episode) {
      const s = String(season).padStart(2, '0');
      const e = String(episode).padStart(2, '0');
      const re = new RegExp(`S${s}E${e}`, 'i');
      entry = entries.find(en => re.test(en.entryName));
    }

    // 2. Fallback: primeiro SRT disponível
    if (!entry) entry = entries[0];
    if (!entry) return null;

    console.log(`[subs] A servir: ${entry.entryName}`);
    const content = entry.getData().toString('utf8');
    srtCache.set(cacheKey, content);
    return content;
  } catch (e) {
    console.log('[subs] Erro ao descarregar:', e.message);
    return null;
  }
}

module.exports = { searchSubtitles, getSrtContent, enabled };
