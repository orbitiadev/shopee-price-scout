create table if not exists public.price_scout_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  product_name text not null default 'iPhone 15 128GB' check (char_length(product_name) between 1 and 200),
  sort_by text not null default 'total' check (sort_by in ('total','price','rating','sold')),
  min_price numeric(12,2) check (min_price is null or min_price >= 0),
  max_price numeric(12,2) check (max_price is null or max_price >= 0),
  include_shipping boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint price_scout_profiles_price_range check (max_price is null or min_price is null or max_price >= min_price)
);

create table if not exists public.price_scout_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null check (char_length(product_name) between 1 and 200),
  title text not null check (char_length(title) between 1 and 500),
  seller text check (seller is null or char_length(seller) <= 200),
  price numeric(12,2) not null check (price >= 0),
  shipping numeric(12,2) not null default 0 check (shipping >= 0),
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  sold integer check (sold is null or sold >= 0),
  url text check (url is null or (char_length(url) <= 2000 and url ~ '^https://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists price_scout_offers_user_product_idx
  on public.price_scout_offers (user_id, product_name, created_at desc);

alter table public.price_scout_profiles enable row level security;
alter table public.price_scout_offers enable row level security;

revoke all on table public.price_scout_profiles from anon;
revoke all on table public.price_scout_offers from anon;
grant select, insert, update, delete on table public.price_scout_profiles to authenticated;
grant select, insert, update, delete on table public.price_scout_offers to authenticated;

create policy "price_scout_profiles_owner_all"
on public.price_scout_profiles for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "price_scout_offers_owner_all"
on public.price_scout_offers for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
