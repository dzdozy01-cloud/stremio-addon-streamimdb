# StreamIMDb Connector — Estado (v1.1.1)

## Deploy
Render (`stremio-addon-streamimdb.onrender.com`) · branch `main`
Landing page em `/` — donativo paypal.me/F100Pilot · reporte pflm.bet@gmail.com

## Stack
`axios` + `adm-zip` + `stremio-addon-sdk` + `express` · sem browser/Puppeteer

## Fluxo actual
1. Stremio envia IMDb ID → `defineStreamHandler` em `addon.js`
2. `scraper.js` chama `streamdata.vaplayer.ru/api.php` com headers `Referer/Origin` de `brightpathsignals.com`
3. JSON → `data.stream_urls[]` testados em paralelo; primeiro verificado devolvido
4. Cache 2h + deduplicação + rejeição por sobrecarga (`MAX_QUEUE=3`)
5. Legendas via `defineSubtitlesHandler` → subdl.com API → ZIP extraído → SRT servido em `/subs/:fileId`

## Implementado
- Puppeteer eliminado → axios puro (<5s, ~5MB/pedido)
- Fallback CDN automático entre `stream_urls[]`
- `/health` endpoint (uptime, cache, memória)
- `defineSubtitlesHandler` com subdl.com (en, pt) — sem bingeGroup para legendas correctas por episódio

## Em aberto

| Prioridade | Feature | Notas |
|---|---|---|
| Alta | **PT-BR no subdl** | Códigos `pb` e `pt-BR` inválidos na API — descobrir código correcto |
| Alta | **Séries no Render** | CDN bloqueia IPs de datacenter; funciona localmente |
| Média | **Auto-play + legendas** | `bingeGroup` impede reload de legendas — limitação do Stremio cliente |
| Média | **Catalog básico** | Conteúdos populares para o add-on ser descobrível no Stremio |
| Baixa | **Qualidade selecionável** | Expor múltiplos streams (1080p, 720p…) |
