# Shopee Price Scout

Radar pessoal de promoções da Orbit IA para monitorar ofertas da Shopee, registrar histórico de preços e gerar conteúdo pronto para Telegram e TikTok.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Forbitiadev%2Fshopee-price-scout&project-name=shopee-price-scout&repository-name=shopee-price-scout)

## O que já existe

- comparação por preço + frete;
- filtros e ordenação por preço, desconto, avaliação e vendas;
- Supabase com RLS por `auth.uid()`;
- histórico de capturas por anúncio;
- atualização do mesmo anúncio sem perder o histórico;
- preço antigo/de referência e cálculo de economia;
- classificação automática:
  - 🔥 **Imperdível**: desconto >= 15%;
  - 🟢 **Boa oferta**: desconto >= 5%;
  - 🟡 **Preço normal**: desconto < 5%;
- Promo Studio com legenda e hashtags;
- card vertical **1080×1920** gerado no navegador;
- download do card em PNG;
- Edge Function `price-scout-telegram` já implantada no Supabase;
- fallback local quando o Auth/Supabase não estiver disponível;
- migrations versionadas no repositório.

## Fluxo

1. Pesquise um produto.
2. Abra a busca real na Shopee.
3. Capture a oferta com preço atual, preço antigo/referência, frete, loja, avaliação e URL.
4. Ao capturar novamente o mesmo anúncio, o app atualiza o preço e grava uma nova amostra no histórico.
5. Clique em **Gerar promoção**.
6. O app calcula desconto/economia, classifica a oferta e cria card + legenda + hashtags.
7. Baixe o card para TikTok ou publique no Telegram após configurar o bot.

## Supabase

Projeto conectado: `msjnvqwtguakmoaqlhvo`.

Tabelas do Price Scout:

- `price_scout_profiles`
- `price_scout_offers`
- `price_scout_price_history`
- `price_scout_promotions`

Todas as tabelas expostas usam RLS. O frontend usa somente chave **publishable**; nenhuma `service_role` é colocada no navegador.

### Telegram

A função `price-scout-telegram` exige:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `PRICE_SCOUT_OWNER_USER_ID`

O `PRICE_SCOUT_OWNER_USER_ID` deve ser o ID mostrado pelo app após uma sessão Supabase ser criada. A função recusa publicação quando o JWT não pertence exatamente a esse usuário.

Consulte `docs/TELEGRAM_SETUP.md`.

## TikTok

O fluxo atual gera card 1080×1920, legenda e hashtags para publicação manual. Isso permite começar sem depender de aprovação da API de publicação do TikTok.

Consulte `docs/TIKTOK_WORKFLOW.md`.

## Shopee

O plugin Shopee disponível dentro do ChatGPT foi testado e consegue retornar produtos reais, mas ele não pode ser embutido diretamente neste site. A automação do site deve usar a API oficial permitida pela Shopee com credenciais próprias.

Até essas credenciais serem configuradas, o Price Scout continua sem inventar dados: as capturas são manuais e o histórico é real.

Consulte `docs/SHOPEE_API.md`.

## Trocar produto padrão

Edite `product-config.js`:

```js
window.PRODUCT_NAME = "SEU NOVO PRODUTO";
```

## Deploy no Vercel

O projeto é estático no frontend e inclui `vercel.json`. O backend de Telegram roda como Supabase Edge Function.

Para uso pessoal, clique no botão **Deploy with Vercel** no topo deste README. O fluxo já aponta para `orbitiadev/shopee-price-scout` e sugere o nome `shopee-price-scout`. Depois da importação, a integração Git do Vercel pode publicar novamente a cada push na `main`.
