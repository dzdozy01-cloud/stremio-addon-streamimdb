'use strict';
const axios = require('axios');

const API_KEY = process.env.OPENSUBTITLES_API_KEY;
const BASE    = 'https://api.opensubtitles.com/api/v1';
const enabled = !!API_KEY;

const headers = () => ({
  'Api-Key': API_KEY,
  'Content-Type': 'application/json',
  'User-Agent': 'StreamIMDbConnector/1.1.1',
});

// Cache de pesquisa por episódio: "tt1234:2:3" → [{lang, fileId}]
// Não cacheamos download URLs — são temporárias; geradas frescas em cada play
const searchCache = new Map();

async function searchSubtitles(imdbId, season, episode) {
  if (!enabled) return [];

  const key = `${imdbId}:${season || ''}:${episode || ''}`;
  if (searchCache.has(key)) return searchCache.get(key);

  const params = { imdb_id: imdbId.replace('tt', ''), languages: 'en,pt' };
  if (season)  { params.season_number  = season; }
  if (episode) { params.episode_number = episode; }

  try {
    const res = await axios.get(`${BASE}/subtitles`, {
      params,
      headers: headers(),
      timeout: 5000,
    });

    const results = res.data?.data || [];
    const byLang = {};
    for (const item of results) {
      const lang   = item.attributes?.language;
      const fileId = item.attributes?.files?.[0]?.file_id;
      if (lang && fileId && !byLang[lang]) byLang[lang] = fileId;
    }

    const found = Object.entries(byLang).map(([lang, fileId]) => ({ lang, fileId }));
    console.log(`[subs] ${found.length} legenda(s) para ${key}`);
    searchCache.set(key, found);
    return found;
  } catch (e) {
    console.log('[subs] Erro na pesquisa:', e.message);
    return [];
  }
}

// Gera URL de download fresca (OpenSubtitles URLs expiram — nunca cacheadas)
async function getDownloadUrl(fileId) {
  if (!enabled) return null;
  try {
    const res = await axios.post(`${BASE}/download`,
      { file_id: Number(fileId) },
      { headers: headers(), timeout: 5000 }
    );
    return res.data?.link || null;
  } catch (e) {
    console.log('[subs] Erro ao obter download URL:', e.message);
    return null;
  }
}

module.exports = { searchSubtitles, getDownloadUrl, enabled };
