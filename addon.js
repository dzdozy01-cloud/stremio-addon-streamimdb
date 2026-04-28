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
  resources: ['stream'],
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

    // Busca stream e legendas em paralelo
    const [result, subResults] = await Promise.all([
      fetchVideoSource(imdbId, type, season, episode).catch(e => {
        console.error(`[handler] Erro no scraper: ${e.message}`);
        return null;
      }),
      subsEnabled
        ? searchSubtitles(imdbId, season, episode)
        : Promise.resolve([]),
    ]);

    const subtitles = subResults.map(({ lang, fileId }) => ({
      id: `${imdbId}-${lang}`,
      url: `${ADDON_URL}/subs/${fileId}`,
      lang,
    }));

    if (result && result.type === 'direct') {
      if (subtitles.length) console.log(`[handler] Legendas no stream: ${JSON.stringify(subtitles)}`);
      const stream = {
        url: result.url,
        name: 'StreamIMDb',
        title: 'Stream direto',
        behaviorHints: { bingeGroup: `streamimdb|${imdbId}` },
      };
      if (subtitles.length) stream.subtitles = subtitles;
      return { streams: [stream] };
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

module.exports = builder.getInterface();
