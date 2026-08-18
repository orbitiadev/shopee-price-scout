drop index if exists public.price_scout_offers_user_listing_key_uidx;
alter table public.price_scout_offers alter column listing_key set not null;
alter table public.price_scout_offers drop constraint if exists price_scout_offers_user_listing_key_key;
alter table public.price_scout_offers add constraint price_scout_offers_user_listing_key_key unique (user_id, listing_key);
