create table if not exists bank_transaction_matches (
  id uuid default gen_random_uuid() primary key,
  bank_transaction_id uuid references bank_transactions(id) on delete cascade not null,
  transaction_id uuid references transactions(id) on delete cascade not null,
  match_type text check (match_type in ('EXACT', 'PARTIAL', 'MANUAL')) default 'MANUAL',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(bank_transaction_id, transaction_id)
);

-- Add index for performance
create index if not exists idx_bank_transaction_matches_bank_id on bank_transaction_matches(bank_transaction_id);
create index if not exists idx_bank_transaction_matches_trans_id on bank_transaction_matches(transaction_id);

-- We keep matched_transaction_id in bank_transactions for backward compatibility or primary match, 
-- but for multi-match we rely on this table. 
-- Ideally, we would migrate data and drop matched_transaction_id, but let's keep it as a "primary" link or just unused.
