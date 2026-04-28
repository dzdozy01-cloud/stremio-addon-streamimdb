# StreamIMDb Connector v1.2.0

## Comandos
```
npm install
node server.js       # porta 7000 ou process.env.PORT (Render)
curl "http://localhost:7000/stream/movie/tt0076759.json"
curl "http://localhost:7000/health"
```
Porta ocupada: `powershell -Command "$c=Get-NetTCPConnection -LocalPort 7000 -EA SilentlyContinue; if($c){taskkill /F /PID $c.OwningProcess}"`

## Stack
`stremio-addon-sdk` · `express` · `axios` · `adm-zip`

## Estrutura
- `server.js` — express + `getRouter(addon)` + landing page + `/health` + `/subs/:fileId`
- `addon.js` — manifesto v1.2.0 + `defineStreamHandler` (subtitles embutidas + bingeGroup) + `defineSubtitlesHandler`
- `scraper.js` — fetch API com cache, dedup e protecção de sobrecarga
- `subtitles.js` — OpenSubtitles REST API; cache de links e conteúdo SRT

## Fluxo do Scraper
1. `GET streamdata.vaplayer.ru/api.php?imdb={id}&type=movie|tv[&season&episode]`
   - Headers: `Referer: https://brightpathsignals.com/embed/movie/{id}`, `Origin: https://brightpathsignals.com`, `X-Requested-With: XMLHttpRequest`
2. JSON → `data.stream_urls[]` testados em paralelo; usa primeiro verificado (200) ou acessível (4xx)
3. Fallback: `{ streams: [{ externalUrl, title: 'No stream available' }] }`

## Fluxo de Legendas (OpenSubtitles REST API)
1. `defineStreamHandler` faz fetch de vídeo + legendas em paralelo
2. `GET api.opensubtitles.com/api/v1/subtitles?imdb_id={id}&season_number={s}&episode_number={e}&languages=en,pt-BR,pt`
3. `POST api.opensubtitles.com/api/v1/download` com `file_id` → link directo SRT (cache 20h)
4. SRT servido via proxy `/subs/{fileId}.srt` com `Access-Control-Allow-Origin: *`
5. Legendas embutidas no stream (`stream.subtitles[]`) + `behaviorHints.bingeGroup` → auto-play funciona

## Env Vars
| Variável | Default |
|---|---|
| `VAPLAYER_API_URL` | `https://streamdata.vaplayer.ru/api.php` |
| `OPENSUBTITLES_API_KEY` | — (legendas desactivadas se ausente) |
| `ADDON_URL` | `http://localhost:7000` (deve ser URL público no Render) |
| `CACHE_TTL_MS` | `7200000` (2h) |
| `MAX_QUEUE` | `3` |

## Padrões
- CommonJS (`require`). `try/catch` em todos os handlers. Séries: `tt1234567:1:2` → split.
- `bingeGroup` activo — legendas embutidas no stream recarregam por episódio via `defineStreamHandler`.

## Branches
- `main` — v1.1.1 em produção (Render)
- `Experimental` — v1.2.0 com OpenSubtitles + auto-play
- `backup/working-v1` — backup estável com Puppeteer

## Notas
- CDNs de séries bloqueiam `resolveStream` (403) — não afecta playback.
- Séries no Render: embed CDN bloqueia datacenter IPs — stream vaplayer funciona em cloud.
- Reinstalar addon no Stremio necessário após mudança de versão no manifesto.
- OpenSubtitles: limite de downloads diários (~20/dia em conta gratuita) — mitigado por cache de SRT em memória.
