-- The hard guarantee behind "status changes only through Machine" (src/core/db.ts).
-- Machine runs `set_config('app.transition','on',true)` inside its transaction and resets it
-- before returning. Any other INSERT, or UPDATE that changes a guarded column, raises.
create or replace function guard_status() returns trigger language plpgsql as $$
declare col text := tg_argv[0];
begin
  if coalesce(current_setting('app.transition', true), 'off') <> 'on' then
    if tg_op = 'INSERT' or (to_jsonb(old) -> col) is distinct from (to_jsonb(new) -> col) then
      raise exception 'STATUS_WRITE_OUTSIDE_MACHINE %.%', tg_table_name, col using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- One line per machine. test/invariants.test.ts asserts this set matches the machines in code.
create trigger guard_status before insert or update on users               for each row execute function guard_status('status');
create trigger guard_status before insert or update on students            for each row execute function guard_status('academic_standing');
create trigger guard_status before insert or update on opportunities       for each row execute function guard_status('status');
create trigger guard_status before insert or update on applications        for each row execute function guard_status('status');
create trigger guard_status before insert or update on events              for each row execute function guard_status('status');
create trigger guard_status before insert or update on event_registrations for each row execute function guard_status('status');

-- Audit log is append-only.
create or replace function audit_append_only() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_append_only before update or delete on audit_log for each row execute function audit_append_only();

-- Domain checks the schema language cannot express.
alter table users add constraint company_users_have_company check ((role = 'company') = (company_id is not null));
alter table events add constraint registration_window check (registration_opens_at < registration_closes_at);
alter table events add constraint chargeable_has_fee check (not chargeable or fee is not null);
alter table university_profile add constraint singleton check (id = 1);
