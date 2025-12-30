create table if not exists public.ai_usage_logs (
    id uuid default gen_random_uuid() primary key,
    tenant_id uuid references public.tenants(id) on delete cascade,
    ai_provider_id uuid references public.ai_providers(id) on delete set null,
    model text,
    tokens_input integer default 0,
    tokens_output integer default 0,
    status text check (status in ('success', 'error')),
    error_message text,
    created_at timestamptz default now()
);

-- Add indexes for performance
create index if not exists idx_ai_usage_logs_tenant_created on public.ai_usage_logs(tenant_id, created_at);
create index if not exists idx_ai_usage_logs_provider_created on public.ai_usage_logs(ai_provider_id, created_at);

-- RLS
alter table public.ai_usage_logs enable row level security;

create policy "Admins can view their tenant's usage logs"
    on public.ai_usage_logs for select
    using (
        exists (
            select 1 from public.memberships
            where memberships.user_id = auth.uid()
            and memberships.tenant_id = ai_usage_logs.tenant_id
            and memberships.role in ('owner', 'admin')
        )
    );

create policy "System can insert usage logs"
    on public.ai_usage_logs for insert
    with check (true); -- In a real app, we might restrict this to service role only, but for now allow authenticated users to log via server actions

-- Function to check rate limits
create or replace function public.check_ai_rate_limit(
    p_tenant_id uuid,
    p_provider_id uuid,
    p_limit_min integer,
    p_limit_hour integer,
    p_limit_day integer
) returns boolean as $$
declare
    v_count_min integer;
    v_count_hour integer;
    v_count_day integer;
begin
    -- Check minute limit
    if p_limit_min > 0 then
        select count(*) into v_count_min
        from public.ai_usage_logs
        where tenant_id = p_tenant_id
        and ai_provider_id = p_provider_id
        and created_at > now() - interval '1 minute';
        
        if v_count_min >= p_limit_min then
            return false;
        end if;
    end if;

    -- Check hour limit
    if p_limit_hour > 0 then
        select count(*) into v_count_hour
        from public.ai_usage_logs
        where tenant_id = p_tenant_id
        and ai_provider_id = p_provider_id
        and created_at > now() - interval '1 hour';
        
        if v_count_hour >= p_limit_hour then
            return false;
        end if;
    end if;

    -- Check day limit
    if p_limit_day > 0 then
        select count(*) into v_count_day
        from public.ai_usage_logs
        where tenant_id = p_tenant_id
        and ai_provider_id = p_provider_id
        and created_at > now() - interval '24 hours';
        
        if v_count_day >= p_limit_day then
            return false;
        end if;
    end if;

    return true;
end;
$$ language plpgsql security definer set search_path = public;
