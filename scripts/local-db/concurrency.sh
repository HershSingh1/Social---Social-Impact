#!/usr/bin/env bash
# Parallel-session checks that single-transaction pgTAP tests cannot show. Run after run-tests.sh
# (reuses its database, which has the migrations applied and no fixtures).
#   1. 10 concurrent send_plan calls with the same client_key -> exactly one plan, one RSVP per person
#   2. 6 members voting at once on the same option -> tally equals the number of votes (no lost updates)
#   3. 34 users joining a group at once -> exactly 30 members (limit holds under races)
set -euo pipefail
DB=sidequest_test
Q() { psql -X -q -At -d "$DB" "$@"; }
claims() { echo "{\"sub\":\"$1\",\"role\":\"authenticated\",\"is_anonymous\":${2:-false}}"; }
as() { # as <uuid> <anon> <sql>  (one session: claims + role + statement)
  psql -X -q -At -d "$DB" -c "select set_config('request.jwt.claims', '$(claims "$1" "$2")', false)" -c "set role authenticated" -c "$3" | tail -n 1
}
uid() { echo "$(printf '%s' "$1" | md5sum | cut -c1-32 | sed -E 's/(.{8})(.{4})(.{4})(.{4})(.{12})/\1-\2-\3-\4-\5/')"; }
mkuser() { Q -c "insert into auth.users (id, aud, role, email, is_anonymous) values ('$(uid "$1")','authenticated','authenticated','$1@x.test',${2:-false}) on conflict do nothing" \
              -c "insert into public.profiles (id, display_name, is_guest) values ('$(uid "$1")','$1',${2:-false}) on conflict do nothing"; }

fail=0; ok() { echo "ok   - $1"; }; bad() { echo "FAIL - $1"; fail=1; }

Q -c "insert into public.experiences (name, category, description, lat, lng, area, price_kind, price_min, price_max, timing_kind, hours_text, duration_min, meeting_point, source, checked_on)
      values ('Conc A','active','x',30.27,-97.74,'Downtown','free',0,0,'flexible','Daily',60,'Gate','PLACEHOLDER: concurrency','2026-11-02'),
             ('Conc B','active','x',30.27,-97.74,'Downtown','free',0,0,'flexible','Daily',60,'Gate','PLACEHOLDER: concurrency','2026-11-02')
      on conflict do nothing" >/dev/null 2>&1 || true
EA=$(Q -c "select id from public.experiences where name='Conc A'")
EB=$(Q -c "select id from public.experiences where name='Conc B'")

# ---- 1. same client_key, 10 parallel sends
mkuser cmaya; for i in 1 2 3 4 5; do mkuser cm$i; done
G=$(as "$(uid cmaya)" false "select public.create_group('Conc group') ->> 'group_id'")
CODE=$(Q -c "select code from public.join_codes where group_id='$G'")
for i in 1 2 3 4 5; do as "$(uid cm$i)" false "select public.join_group('$CODE')" >/dev/null; done
KEY=$(uid concurrent-key)
START=$(Q -c "select to_char((now() at time zone 'America/Chicago') + interval '3 days', 'YYYY-MM-DD\"T\"15:00:00')")
END=$(Q -c "select to_char((now() at time zone 'America/Chicago') + interval '3 days', 'YYYY-MM-DD\"T\"17:00:00')")
rm -f /tmp/conc_send.*; for i in $(seq 1 10); do
  as "$(uid cmaya)" false "select public.send_plan('$KEY','$G','$EA','$START','$END','Gate')" > /tmp/conc_send.$i 2>&1 &
done; wait
[ "$(cat /tmp/conc_send.* | sort -u | grep -c .)" = 1 ] && ok "10 parallel sends returned the same plan id" || bad "parallel sends returned different results: $(cat /tmp/conc_send.* | sort -u | tr '\n' ' ')"
[ "$(Q -c "select count(*) from public.plans where client_key='$KEY'")" = 1 ] && ok "exactly one plan row" || bad "plan rows != 1"
[ "$(Q -c "select count(*) from public.rsvps r join public.plans p on p.id=r.plan_id where p.client_key='$KEY'")" = 6 ] && ok "one RSVP per person (6)" || bad "RSVP rows != 6"

# ---- 2. concurrent votes on one option
P=$(as "$(uid cmaya)" false "select public.create_pick('$G', '[{\"experience_id\":\"$EA\"},{\"experience_id\":\"$EB\"}]'::jsonb, now() + interval '24 hours')")
OPT=$(Q -c "select id from public.pick_options where pick_id='$P' order by position limit 1")
for u in cmaya cm1 cm2 cm3 cm4 cm5; do as "$(uid $u)" false "select public.cast_vote('$OPT','yes')" > /dev/null & done; wait
[ "$(Q -c "select yes from public.option_tallies where option_id='$OPT'")" = 6 ] && ok "6 concurrent votes -> tally 6 (no lost update)" || bad "tally $(Q -c "select yes from public.option_tallies where option_id='$OPT'") != 6"

# ---- 3. 34 concurrent joins into a 30-member group
G2=$(as "$(uid cmaya)" false "select public.create_group('Race group') ->> 'group_id'")
CODE2=$(Q -c "select code from public.join_codes where group_id='$G2'")
for i in $(seq 1 34); do mkuser rj$i; done
for i in $(seq 1 34); do as "$(uid rj$i)" false "select public.join_group('$CODE2') ->> 'status'" > /dev/null & done; wait
N=$(Q -c "select count(*) from public.group_members where group_id='$G2' and removed_at is null")
[ "$N" = 30 ] && ok "34 racing joins -> exactly 30 members" || bad "members = $N (expected 30)"
exit $fail
