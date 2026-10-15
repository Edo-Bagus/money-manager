-- Test helpers, loaded after the migrations. Lives in its own schema `tests`,
-- which exists only in the throwaway test database.

create schema tests;
grant usage on schema tests to anon, authenticated;

-- Fixed users, so test files can refer to them by literal id.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.test');

-- Act as a logged-in user for the rest of the transaction, the way PostgREST
-- does it: switch to role authenticated and expose the JWT claims.
create function tests.login_as(p_user_id uuid) returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
end
$$;

-- Act as a visitor with only the publishable key.
create function tests.login_as_anon() returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end
$$;

-- Back to the session user (postgres, which bypasses RLS as table owner).
create function tests.logout() returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- Runs the deferred constraint triggers now, as COMMIT would, then defers
-- them again so the test can keep going in the same transaction.
create function tests.run_deferred_checks() returns void
language plpgsql
as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end
$$;

-- Fails unless p_sql raises an error with the given SQLSTATE (and, if given, a
-- message matching p_message_like). Whatever p_sql changed is rolled back.
create function tests.assert_raises(
  p_sql text,
  p_sqlstate text,
  p_message_like text default null
) returns void
language plpgsql
as $$
declare
  v_state text;
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    if v_state <> p_sqlstate then
      raise exception 'expected SQLSTATE % but got % (%) from: %', p_sqlstate, v_state, v_message, p_sql;
    end if;
    if p_message_like is not null and v_message not like p_message_like then
      raise exception 'expected message like "%" but got "%" from: %', p_message_like, v_message, p_sql;
    end if;
    return;
  end;
  raise exception 'expected SQLSTATE % but no error was raised by: %', p_sqlstate, p_sql;
end
$$;

grant execute on all functions in schema tests to anon, authenticated;
