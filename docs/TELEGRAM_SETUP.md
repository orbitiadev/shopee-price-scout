# Telegram — configuração do Price Scout

O backend de publicação já existe em `supabase/functions/price-scout-telegram/index.ts` e está implantado no projeto Supabase.

## Segredos necessários

Configure no ambiente da Edge Function:

- `TELEGRAM_BOT_TOKEN`: token criado pelo BotFather.
- `TELEGRAM_CHAT_ID`: ID numérico ou `@username` do canal/grupo onde o bot pode publicar.
- `PRICE_SCOUT_OWNER_USER_ID`: UUID copiado pelo botão **Copiar meu ID Supabase** no Price Scout.

Nunca coloque `TELEGRAM_BOT_TOKEN` no JavaScript público, GitHub ou `product-config.js`.

## Segurança

A Edge Function exige JWT válido e compara o usuário autenticado com `PRICE_SCOUT_OWNER_USER_ID`. Se não for exatamente o proprietário configurado, retorna `403`.

## Fluxo

1. Crie o bot no BotFather.
2. Adicione o bot ao canal/grupo e permita publicar mensagens.
3. Abra o Price Scout com Supabase ativo e copie seu ID.
4. Configure os três segredos no Supabase.
5. Gere uma promoção no Promo Studio.
6. Clique em **Publicar no Telegram**.

O app envia o card PNG e a legenda/hashtags para a Edge Function; a função publica usando a API do Telegram.
