const { addonBuilder } = require('stremio-addon-sdk');
const { fetchVideoSource } = require('./scraper');
const { searchSubtitles, enabled: subsEnabled } = require('./subtitles');

const ADDON_URL = process.env.ADDON_URL
  || process.env.RENDER_EXTERNAL_URL
  || `http://localhost:${process.env.PORT || 7000}`;

const manifest = {
  id: 'org.local.streamimdb',
  version: '1.2.0',
  name: 'StreamIMDb Connector',
  description: 'Stream movies and series via streamimdb.me natively inside Stremio.',
  logo: 'https://raw.githubusercontent.com/F100Pilot/stremio-addon-streamimdb/main/icon.png',
  types: ['movie', 'series'],
  catalogs: [],
  resources: [
    'stream',
    { name: 'subtitles', types: ['movie', 'series'], idPrefixes: ['tt'] }
  ],
  idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
  try {
    const parts   = args.id.split(':');
    const imdbId  = parts[0];
    const type    = parts.length > 1 ? 'series' : 'movie';
    const season  = parts[1] || null;
    const episode = parts[2] || null;

    const fallbackUrl = type === 'series'
      ? `https://streamimdb.me/embed/${imdbId}/${season}/${episode}/`
      : `https://streamimdb.me/embed/${imdbId}/`;

    // Fetch video + subtitles in parallel
    const [result, subResults] = await Promise.all([
      fetchVideoSource(imdbId, type, season, episode).catch(e => {
        console.error(`[handler] Erro no scraper: ${e.message}`);
        return null;
      }),
      subsEnabled
        ? searchSubtitles(imdbId, season, episode).catch(() => [])
        : Promise.resolve([]),
    ]);

    // Subtitles embedded in stream — fetched fresh per episode, works with bingeGroup
    const subtitles = subResults.map(({ lang, fileId }) => ({
      id:   `opensubs-${lang}-${fileId}`,
      url:  `${ADDON_URL}/subs/${fileId}.srt`,
      lang,
    }));

    // bingeGroup enables auto-play; subtitles reload because defineStreamHandler runs per episode
    const behaviorHints = type === 'series'
      ? { bingeGroup: `streamimdb-${imdbId}` }
      : undefined;

    if (result && result.type === 'direct') {
      const stream = {
        url:   result.url,
        name:  'StreamIMDb',
        title: type === 'series' ? `S${season}E${episode}` : 'Stream direto',
      };
      if (subtitles.length) stream.subtitles    = subtitles;
      if (behaviorHints)    stream.behaviorHints = behaviorHints;
      return { streams: [stream] };
    }

    const stream = {
      externalUrl: fallbackUrl,
      name:  'StreamIMDb',
      title: 'No stream available',
    };
    if (subtitles.length) stream.subtitles    = subtitles;
    if (behaviorHints)    stream.behaviorHints = behaviorHints;
    return { streams: [stream] };

  } catch (err) {
    console.error(`[handler] Erro inesperado: ${err.message}`);
    return { streams: [] };
  }
});

// Fallback: chamado quando o utilizador abre manualmente um episódio
builder.defineSubtitlesHandler(async ({ id }) => {
  try {
    if (!subsEnabled) return { subtitles: [] };
    const parts   = id.split(':');
    const imdbId  = parts[0];
    const season  = parts[1] || null;
    const episode = parts[2] || null;

    const subResults = await searchSubtitles(imdbId, season, episode);
    const subtitles  = subResults.map(({ lang, fileId }) => ({
      id:   `opensubs-${lang}-${fileId}`,
      url:  `${ADDON_URL}/subs/${fileId}.srt`,
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
