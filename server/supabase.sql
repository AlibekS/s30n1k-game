-- Сервер RIDE на Supabase: уникальные ники и таблица лидеров.
-- Выполните этот файл целиком в SQL Editor своего проекта, затем впишите
-- Project URL и anon-ключ в src/online.config.ts.

create table if not exists ride_players (
  nick text primary key,
  nick_key text not null unique,            -- ник в нижнем регистре: уникальность без учёта регистра
  secret_hash text not null,                -- md5 от случайного кода профиля
  created_at timestamptz not null default now()
);

create table if not exists ride_scores (
  nick text not null references ride_players(nick) on delete cascade,
  level text not null,
  time_ms integer not null check (time_ms between 3000 and 3600000),
  stars smallint not null default 0 check (stars between 0 and 3),
  updated_at timestamptz not null default now(),
  primary key (nick, level)
);

alter table ride_players enable row level security;
alter table ride_scores enable row level security;
-- читать результаты может кто угодно, писать — только через функции ниже
drop policy if exists ride_scores_read on ride_scores;
create policy ride_scores_read on ride_scores for select using (true);

-- Страховка на сервере: формат и самые грубые слова (полный фильтр — в клиенте, src/nick.ts).
create or replace function ride_nick_ok(p_nick text) returns boolean language sql immutable as $$
  select p_nick ~ '^[A-Za-zА-Яа-яЁё0-9_-]{3,16}$'
     and p_nick ~ '[A-Za-zА-Яа-яЁё]'
     and lower(p_nick) !~* '(nigg|niger|negr|black|fuck|shit|bitch|cunt|hui|huy|pizd|blya|ebl|eban|suka|pidor|pidar|хуй|хуе|хуя|пизд|бля|ебл|еба|ебан|сука|пидор|пидар|ниггер|нигер|негр)'
$$;

-- 'ok' — ник занят этим игроком (или уже принадлежит ему), 'taken' — занят другим, 'bad' — не прошёл правила.
create or replace function ride_register(p_nick text, p_secret text) returns text
language plpgsql security definer set search_path = public as $$
declare h text;
begin
  if not ride_nick_ok(p_nick) or length(coalesce(p_secret, '')) < 16 then return 'bad'; end if;
  select secret_hash into h from ride_players where nick_key = lower(p_nick);
  if found then
    return case when h = md5(p_secret) then 'ok' else 'taken' end;
  end if;
  begin
    insert into ride_players (nick, nick_key, secret_hash) values (p_nick, lower(p_nick), md5(p_secret));
  exception when unique_violation then
    return 'taken';
  end;
  return 'ok';
end $$;

-- Сохраняет результат, если он лучше прежнего. Звёзды — максимум из собранных.
create or replace function ride_submit(p_nick text, p_secret text, p_level text, p_time_ms integer, p_stars integer) returns text
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  select nick into n from ride_players where nick_key = lower(p_nick) and secret_hash = md5(p_secret);
  if not found then return 'denied'; end if;
  if p_level !~ '^[a-z]+-[0-9]+$' or p_time_ms not between 3000 and 3600000 then return 'bad'; end if;
  insert into ride_scores (nick, level, time_ms, stars) values (n, p_level, p_time_ms, greatest(0, least(3, p_stars)))
  on conflict (nick, level) do update
    set time_ms = least(ride_scores.time_ms, excluded.time_ms),
        stars = greatest(ride_scores.stars, excluded.stars),
        updated_at = now();
  return 'ok';
end $$;

grant execute on function ride_register(text, text) to anon;
grant execute on function ride_submit(text, text, text, integer, integer) to anon;
grant select on ride_scores to anon;
