-- Subset of the pgTAP API used by supabase/tests: no_plan, ok, is, isnt, throws_ok (4-arg), lives_ok, finish.
create or replace function no_plan() returns setof boolean language sql as $$ select true where false $$;

create or replace function _tap_next(p_pass boolean) returns int language plpgsql as $$
declare n int := coalesce(nullif(current_setting('pgtap.n', true), ''), '0')::int + 1;
begin
  perform set_config('pgtap.n', n::text, true);
  if not p_pass then
    perform set_config('pgtap.f', (coalesce(nullif(current_setting('pgtap.f', true), ''), '0')::int + 1)::text, true);
  end if;
  return n;
end $$;

create or replace function ok(boolean, text default '') returns text language plpgsql as $$
declare n int := _tap_next(coalesce($1, false));
begin
  return case when coalesce($1, false) then 'ok ' else 'not ok ' end || n || ' - ' || coalesce($2, '');
end $$;

create or replace function is(anyelement, anyelement, text default '') returns text language plpgsql as $$
declare pass boolean := $1 is not distinct from $2; n int := _tap_next(pass);
begin
  return case when pass then 'ok ' else 'not ok ' end || n || ' - ' || coalesce($3, '')
    || case when pass then '' else E'\n#         have: ' || coalesce($1::text, 'NULL') || E'\n#         want: ' || coalesce($2::text, 'NULL') end;
end $$;

create or replace function isnt(anyelement, anyelement, text default '') returns text language plpgsql as $$
declare pass boolean := $1 is distinct from $2; n int := _tap_next(pass);
begin
  return case when pass then 'ok ' else 'not ok ' end || n || ' - ' || coalesce($3, '');
end $$;

create or replace function throws_ok(p_sql text, p_errcode char(5), p_errmsg text, p_desc text default '')
returns text language plpgsql as $$
declare n int; v_state text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if (p_errcode is null or v_state = p_errcode) and (p_errmsg is null or v_msg = p_errmsg) then
      n := _tap_next(true); return 'ok ' || n || ' - ' || coalesce(p_desc, '');
    end if;
    n := _tap_next(false);
    return 'not ok ' || n || ' - ' || coalesce(p_desc, '') || E'\n#     caught: ' || v_state || ': ' || v_msg
      || E'\n#     wanted: ' || coalesce(p_errcode, '*') || ': ' || coalesce(p_errmsg, '*');
  end;
  n := _tap_next(false);
  return 'not ok ' || n || ' - ' || coalesce(p_desc, '') || E'\n#     no exception thrown';
end $$;

create or replace function lives_ok(p_sql text, p_desc text default '') returns text language plpgsql as $$
declare n int; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    n := _tap_next(false);
    return 'not ok ' || n || ' - ' || coalesce(p_desc, '') || E'\n#     died: ' || v_msg;
  end;
  n := _tap_next(true);
  return 'ok ' || n || ' - ' || coalesce(p_desc, '');
end $$;

create or replace function finish() returns setof text language plpgsql as $$
declare n int := coalesce(nullif(current_setting('pgtap.n', true), ''), '0')::int;
        f int := coalesce(nullif(current_setting('pgtap.f', true), ''), '0')::int;
begin
  return next '1..' || n;
  if f > 0 then return next '# Looks like you failed ' || f || ' test(s) of ' || n; end if;
end $$;

grant execute on all functions in schema @extschema@ to public;
