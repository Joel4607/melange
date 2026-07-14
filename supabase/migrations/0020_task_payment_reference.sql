-- Optional mobile-money reference the buyer can attach to an errand.
alter table tasks add column if not exists payment_reference text;
