# Shopee Price Scout

Comparador reutilizável de ofertas da Shopee, desenvolvido para a conta Orbit IA.

## Como usar

1. Abra o comparador.
2. Digite o produto que deseja comparar.
3. Use **Pesquisar na Shopee** para abrir a busca real.
4. Adicione as ofertas reais ao comparador.
5. O sistema calcula automaticamente menor preço total, média, maior preço e economia.

## Trocar somente o nome do produto

Edite o arquivo `product-config.js` e altere apenas:

```js
window.PRODUCT_NAME = "SEU NOVO PRODUTO";
```

Toda a lógica de filtros, ordenação, métricas e armazenamento continua igual.

## Recursos

- comparação por preço total;
- opção de considerar ou ignorar frete;
- filtros por faixa de preço;
- ordenação por preço, avaliação ou vendas;
- destaque automático da melhor oferta;
- cálculo de menor preço, média, maior preço e economia;
- armazenamento local das ofertas;
- layout responsivo para celular e desktop;
- links diretos para os anúncios;
- preparado para futura integração oficial com a Shopee.

## Segurança e dados

O projeto não tenta contornar CAPTCHA, anti-bot ou restrições da Shopee. Enquanto não houver integração oficial configurada, nenhum preço, avaliação ou quantidade vendida é inventado: as ofertas são adicionadas pelo usuário a partir de dados reais.

## Deploy

O projeto inclui `vercel.json` e pode ser publicado diretamente na Vercel como site estático.
