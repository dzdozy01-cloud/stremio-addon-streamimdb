'use strict';
const axios = require('axios');

const API_KEY  = process.env.OPENSUBTITLES_API_KEY;
const BASE_URL = 'https://api.opensubtitles.com/api/v1';
const HEADERS  = () => ({
  'Api-Key': API_KEY,
  'Content-Type': 'application/json',
  'User-Agent': 'StreamIMDbConnector/1.1.1',
});

const enabled = !!API_KEY;

// Busca subtítulos por IMDb ID + season/episode; retorna [{lang, fileId}]
async function searchSubtitles(imdbId, season, episode) {
  if (!enabled) return [];

  const params = { imdb_id: imdbId.replace('tt', ''), languages: 'en,pt,es,fr' };
  if (season)  { params.season_number = season; params.episode_number = episode; }

  try {
    const res = await axios.get(`${BASE_URL}/subtitles`, {
      params,
      headers: HEADERS(),
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
    console.log(`[subs] ${found.length} legenda(s) encontrada(s) para ${imdbId}`);
    return found;
  } catch (e) {
    console.log('[subs] Erro na pesquisa:', e.message);
    return [];
  }
}

// Obtém URL de download fresca para um fileId (chamado pelo proxy /subs/:fileId)
async function getDownloadUrl(fileId) {
  if (!enabled) return null;

  try {
    const res = await axios.post(`${BASE_URL}/download`,
      { file_id: Number(fileId) },
      { headers: HEADERS(), timeout: 5000 }
    );
    return res.data?.link || null;
  } catch (e) {
    console.log('[subs] Erro ao obter URL de download:', e.message);
    return null;
  }
}

module.exports = { searchSubtitles, getDownloadUrl, enabled };
