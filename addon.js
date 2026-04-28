const { addonBuilder } = require('stremio-addon-sdk');
const { fetchVideoSource } = require('./scraper');
const { searchSubtitles, enabled: subsEnabled } = require('./subtitles');

const ADDON_URL = process.env.ADDON_URL
  || process.env.RENDER_EXTERNAL_URL
  || `http://localhost:${process.env.PORT || 7000}`;

const manifest = {
  id: 'org.local.streamimdb',
  version: '1.1.1',
  name: 'StreamIMDb Connector',
  description: 'Stream movies and series via streamimdb.me natively inside Stremio.',
  logo: 'https://raw.githubusercontent.com/F100Pilot/stremio-addon-streamimdb/main/icon.png',
  types: ['movie', 'series'],
  catalogs: [],
  resources: ['stream', 'subtitles'],
  idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
  try {
    const parts = args.id.split(':');
    const imdbId = parts[0];
    const type = parts.length > 1 ? 'series' : 'movie';
    const season = parts[1] || null;
    const episode = parts[2] || null;

    const fallbackUrl = type === 'series'
      ? `https://streamimdb.me/embed/${imdbId}/${season}/${episode}/`
      : `https://streamimdb.me/embed/${imdbId}/`;

    let result = null;
    try {
      result = await fetchVideoSource(imdbId, type, season, episode);
    } catch (scraperErr) {
      console.error(`[handler] Erro no scraper: ${scraperErr.message}`);
    }

    if (result && result.type === 'direct') {
      return {
        streams: [{
          url: result.url,
          name: 'StreamIMDb',
          title: 'Stream direto',
          behaviorHints: { bingeGroup: `streamimdb|${imdbId}` }
        }]
      };
    }

    return {
      streams: [{
        externalUrl: fallbackUrl,
        name: 'StreamIMDb',
        title: 'No stream available'
      }]
    };
  } catch (err) {
    console.error(`[handler] Erro inesperado: ${err.message}`);
    return { streams: [] };
  }
});

// Handler dedicado — o Stremio chama-o por episódio, sem estado do bingeGroup
builder.defineSubtitlesHandler(async ({ id }) => {
  try {
    if (!subsEnabled) return { subtitles: [] };

    const parts = id.split(':');
    const imdbId = parts[0];
    const season  = parts[1] || null;
    const episode = parts[2] || null;

    const subResults = await searchSubtitles(imdbId, season, episode);
    const subtitles = subResults.map(({ lang, fileId }) => ({
      id: `${imdbId}-${lang}`,
      url: `${ADDON_URL}/subs/${fileId}`,
      lang,
    }));

    console.log(`[subs handler] ${subtitles.length} legenda(s) para ${id}`);
    return { subtitles };
  } catch (err) {
    console.error('[subs handler] Erro:', err.message);
    return { subtitles: [] };
  }
});

module.exports = builder.getInterface();
