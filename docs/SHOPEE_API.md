# Shopee — integração de busca automática

## Estado atual

O plugin da Shopee disponível no ChatGPT foi testado e retorna produtos reais, mas esse plugin é uma ferramenta do ambiente do ChatGPT e não pode ser chamado diretamente pelo JavaScript publicado no Vercel.

Por isso, o Price Scout mantém duas camadas separadas:

1. **Captura manual real** — funciona agora e registra histórico no Supabase.
2. **API oficial da Shopee** — preparada para ser adicionada quando houver `AppId` e `Secret` próprios.

## Regras para a integração futura

- usar somente API/documentação oficial permitida pela Shopee;
- manter `Secret` somente no backend/Edge Function;
- nunca colocar credencial secreta no navegador;
- não contornar CAPTCHA, anti-bot ou controles da plataforma;
- normalizar cada anúncio para `listing_key` e salvar a captura em `price_scout_price_history`;
- atualizar `price_scout_offers` sem apagar o histórico anterior;
- manter a origem como `shopee_api`.

## Dados esperados

Quando a API for ligada, o adaptador deve mapear, quando disponíveis:

- ID/link do anúncio;
- título;
- loja;
- preço atual;
- preço antigo/referência;
- avaliação;
- quantidade vendida;
- URL da oferta.

O restante do sistema — histórico, desconto, classificação, card, legenda e Telegram — já funciona sobre esse modelo de dados.
