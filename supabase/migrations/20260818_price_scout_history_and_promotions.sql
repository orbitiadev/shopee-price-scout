alter table public.price_scout_offers
  add column if not exists listing_key text,
  add column if not exists reference_price numeric(12,2) check (reference_price is null or reference_price >= 0),
  add column if not exists source text not null default 'manual' check (source in ('manual','shopee_api','shopee_plugin')),
  add column if not exists last_seen_at timestamptz not null default now();

create table if not exists public.price_scout_price_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_key text not null,
  product_name text not null check (char_length(product_name) between 1 and 200),
  title text not null check (char_length(title) between 1 and 500),
  seller text check (seller is null or char_length(seller) <= 200),
  price numeric(12,2) not null check (price >= 0),
  shipping numeric(12,2) not null default 0 check (shipping >= 0),
  reference_price numeric(12,2) check (reference_price is null or reference_price >= 0),
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  sold integer check (sold is null or sold >= 0),
  url text check (url is null or (char_length(url) <= 2000 and url ~ '^https://')),
  source text not null default 'manual' check (source in ('manual','shopee_api','shopee_plugin')),
  captured_at timestamptz not null default now()
);

create index if not exists price_scout_history_user_listing_idx
  on public.price_scout_price_history (user_id, listing_key, captured_at desc);

create table if not exists public.price_scout_promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid references public.price_scout_offers(id) on delete set null,
  listing_key text not null,
  classification text not null check (classification in ('imperdivel','boa_oferta','preco_normal')),
  current_price numeric(12,2) not null check (current_price >= 0),
  reference_price numeric(12,2) check (reference_price is null or reference_price >= 0),
  discount_percent numeric(6,2) not null default 0 check (discount_percent >= 0),
  savings numeric(12,2) not null default 0 check (savings >= 0),
  caption text not null check (char_length(caption) <= 5000),
  hashtags text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists price_scout_promotions_user_created_idx
  on public.price_scout_promotions (user_id, created_at desc);

alter table public.price_scout_price_history enable row level security;
alter table public.price_scout_promotions enable row level security;

revoke all on table public.price_scout_price_history from anon;
revoke all on table public.price_scout_promotions from anon;
grant select, insert, update, delete on table public.price_scout_price_history to authenticated;
grant select, insert, update, delete on table public.price_scout_promotions to authenticated;

create policy "price_scout_history_owner_all"
on public.price_scout_price_history
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "price_scout_promotions_owner_all"
on public.price_scout_promotions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
