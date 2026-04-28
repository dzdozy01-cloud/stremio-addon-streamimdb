'use strict';
const axios  = require('axios');
const AdmZip = require('adm-zip');

const API_KEY = process.env.SUBDL_API_KEY;
const API_URL = 'https://api.subdl.com/api/v1/subtitles';
const DL_BASE = 'https://dl.subdl.com';

const enabled = !!API_KEY;

// Mapa de nomes subdl → ISO 639-1
const LANG_MAP = {
  english: 'en', portuguese: 'pt', 'brazilian-portuguese': 'pt',
  spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  dutch: 'nl', arabic: 'ar', turkish: 'tr', russian: 'ru',
};

// Cache em memória: sdId → conteúdo SRT (evita redownload)
const srtCache = new Map();

// Busca subtítulos por IMDb ID + season/episode; retorna [{lang, fileId}]
async function searchSubtitles(imdbId, season, episode) {
  if (!enabled) return [];

  const params = { api_key: API_KEY, imdb_id: imdbId, languages: 'en,pt' };
  if (season) { params.season_number = season; params.episode_number = episode; }

  try {
    const res = await axios.get(API_URL, { params, timeout: 5000 });
    const subs = res.data?.subtitles || [];

    const byLang = {};
    for (const sub of subs) {
      const rawLang = (sub.lang || '').toLowerCase();
      const lang    = LANG_MAP[rawLang] || rawLang.slice(0, 2);
      // fileId = filename do ZIP, ex: "3417823-8341324.zip"
      const fileId  = sub.url ? sub.url.split('/').pop() : null;
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

// Descarrega ZIP do subdl, extrai SRT e devolve o conteúdo em texto
// fileId = filename do ZIP, ex: "3417823-8341324.zip"
async function getSrtContent(fileId) {
  if (srtCache.has(fileId)) return srtCache.get(fileId);

  try {
    const res = await axios.get(`${DL_BASE}/subtitle/${fileId}`, {
      responseType: 'arraybuffer',
      timeout: 10000,
    });

    const zip    = new AdmZip(Buffer.from(res.data));
    const entry  = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.srt'));
    if (!entry) return null;

    const content = entry.getData().toString('utf8');
    srtCache.set(fileId, content);
    return content;
  } catch (e) {
    console.log('[subs] Erro ao descarregar subtítulo:', e.message);
    return null;
  }
}

module.exports = { searchSubtitles, getSrtContent, enabled };
