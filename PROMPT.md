# StreamIMDb Connector — Estado (v1.2.0)

## Deploy
Render (`stremio-addon-streamimdb.onrender.com`) · branch `Experimental`
Landing page em `/` — donativo paypal.me/F100Pilot · reporte pflm.bet@gmail.com

## Stack
`axios` + `adm-zip` + `stremio-addon-sdk` + `express` · sem browser/Puppeteer

## Fluxo actual
1. Stremio envia IMDb ID → `defineStreamHandler` em `addon.js`
2. `scraper.js` chama `streamdata.vaplayer.ru/api.php` com headers `Referer/Origin` de `brightpathsignals.com`
3. JSON → `data.stream_urls[]` testados em paralelo; primeiro verificado devolvido
4. Cache 2h + deduplicação + rejeição por sobrecarga (`MAX_QUEUE=3`)
5. Legendas desactivadas (OpenSubtitles bloqueado por Cloudflare em datacenter IPs)

## Implementado
- Puppeteer eliminado → axios puro (<5s, ~5MB/pedido)
- Fallback CDN automático entre `stream_urls[]`
- `/health` endpoint (uptime, cache, memória)
- OpenSubtitles REST API integrado (search + login JWT) — download bloqueado no Render

## Em aberto

| Prioridade | Feature | Notas |
|---|---|---|
| Alta | **Legendas via proxy doméstico** | OpenSubtitles `/download` bloqueado por Cloudflare no Render; solução: endpoint proxy no servidor doméstico (Node.js/Express) que faz o pedido a partir de IP residencial e devolve o link ao Render. Env vars novas: `SUBS_PROXY_URL`, `SUBS_PROXY_SECRET`. |
| Alta | **Auto-play + legendas** | `bingeGroup` activo — mas sem legendas a funcionar não é útil. Reactivar quando proxy estiver operacional. |
| Média | **Catalog básico** | Conteúdos populares para o add-on ser descobrível no Stremio |
| Baixa | **Qualidade selecionável** | Expor múltiplos streams (1080p, 720p…) |
