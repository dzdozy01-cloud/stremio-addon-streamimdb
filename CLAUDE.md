# StreamIMDb Connector v1.1.1

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
- `addon.js` — manifesto v1.1.1 + `defineStreamHandler` + `defineSubtitlesHandler`
- `scraper.js` — fetch API com cache, dedup e protecção de sobrecarga
- `subtitles.js` — pesquisa subdl, extrai SRT de ZIP, cache em memória

## Fluxo do Scraper
1. `GET streamdata.vaplayer.ru/api.php?imdb={id}&type=movie|tv[&season&episode]`
   - Headers: `Referer: https://brightpathsignals.com/embed/movie/{id}`, `Origin: https://brightpathsignals.com`, `X-Requested-With: XMLHttpRequest`
2. JSON → `data.stream_urls[]` testados em paralelo; usa primeiro verificado (200) ou acessível (4xx)
3. Fallback: `{ streams: [{ externalUrl, title: 'No stream available' }] }`

## Fluxo de Legendas (subdl.com)
1. `defineSubtitlesHandler` chamado pelo Stremio por episódio
2. `GET api.subdl.com/api/v1/subtitles?imdb_id={id}&season_number={s}&episode_number={e}&languages=en,pt`
3. ZIP descarregado de `dl.subdl.com`; SRT com `S##E##` extraído do interior
4. Servido via proxy `/subs/{fileId}.srt?s={s}&e={e}` com `Access-Control-Allow-Origin: *`

## Env Vars
| Variável | Default |
|---|---|
| `VAPLAYER_API_URL` | `https://streamdata.vaplayer.ru/api.php` |
| `SUBDL_API_KEY` | — (legendas desactivadas se ausente) |
| `ADDON_URL` | `http://localhost:7000` (deve ser URL público no Render) |
| `CACHE_TTL_MS` | `7200000` (2h) |
| `MAX_QUEUE` | `3` |

## Padrões
- CommonJS (`require`). `try/catch` em todos os handlers. Séries: `tt1234567:1:2` → split.
- Sem `bingeGroup` — Stremio pede legendas frescas por episódio via `defineSubtitlesHandler`.

## Branches
- `main` / `Experimental` — em sync, v1.1.1 em produção (Render)
- `backup/working-v1` — backup estável com Puppeteer

## Notas
- CDNs de séries bloqueiam `resolveStream` (403) — não afecta playback.
- Séries no Render: embed CDN bloqueia datacenter IPs — stream vaplayer funciona em cloud.
- Legendas PT-BR: código `pb` e `pt-BR` inválidos no subdl — investigar código correcto.
- Reinstalar addon no Stremio necessário após mudanças no manifesto (novo recurso `subtitles`).
