import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { ownerTelegramId } from "@/lib/bot/channel";

/** Dashboard is owner-only; an empty env fails closed. */
export async function isOwner(userId: number): Promise<boolean> {
  const owner = ownerTelegramId();
  if (owner === null) return false;

  const { db } = getDb();
  const [row] = await db
    .select({ telegramId: users.telegramId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.telegramId === owner;
}

function count(value: unknown): number {
  return Number(value ?? 0);
}

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const { db } = getDb();
  const result = await db.execute(query);
  return (result.rows ?? []) as T[];
}

export type DailyPoint = {
  day: string;
  users: number;
  opens: number;
  views: number;
  reveals: number;
};

export type Overview = {
  dau: number;
  wau: number;
  mau: number;
  opensToday: number;
  feedLoadedToday: number;
  uploadsWeek: number;
  photosTotal: number;
  avgViewsPerPhoto: number;
};

export type UploadFunnel = {
  stepPhoto: number;
  stepCaption: number;
  stepConfirm: number;
  questionGender: number;
  questionNsfw: number;
  published: number;
};

export type GateFunnel = { shown: number; passed: number };

export type TopPhoto = {
  id: number;
  slug: string;
  caption: string;
  isNsfw: boolean;
  views: number;
  viewers: number;
  reactions: number;
  ratings: number;
  comments: number;
};

export type RetentionRow = {
  day: string;
  cohort: number;
  d1: number;
  d7: number;
};

const WIB = "Asia/Jakarta";

/** 14 days of activity, one row per day that has events. */
export async function getDailySeries(): Promise<DailyPoint[]> {
  const list = await rows<{
    day: string;
    users: unknown;
    opens: unknown;
    views: unknown;
    reveals: unknown;
  }>(sql`
    select to_char((created_at at time zone ${WIB})::date, 'YYYY-MM-DD') as day,
           count(distinct user_id) filter (where name = 'app_open') as users,
           count(*) filter (where name = 'app_open') as opens,
           count(*) filter (where name = 'photo_view') as views,
           count(*) filter (where name = 'nsfw_reveal') as reveals
    from events
    where created_at >= now() - interval '14 days'
    group by 1
    order by 1
  `);

  return list.map((row) => ({
    day: row.day,
    users: count(row.users),
    opens: count(row.opens),
    views: count(row.views),
    reveals: count(row.reveals),
  }));
}

export async function getOverview(): Promise<Overview> {
  const [totals] = await rows<{
    dau: unknown;
    wau: unknown;
    mau: unknown;
    opens_today: unknown;
    feed_today: unknown;
  }>(sql`
    select
      count(distinct user_id) filter (
        where name = 'app_open'
          and created_at >= (date_trunc('day', now() at time zone ${WIB})) at time zone ${WIB}
      ) as dau,
      count(distinct user_id) filter (
        where name = 'app_open' and created_at >= now() - interval '7 days'
      ) as wau,
      count(distinct user_id) filter (
        where name = 'app_open' and created_at >= now() - interval '30 days'
      ) as mau,
      count(*) filter (
        where name = 'app_open'
          and created_at >= (date_trunc('day', now() at time zone ${WIB})) at time zone ${WIB}
      ) as opens_today,
      count(*) filter (
        where name = 'feed_loaded'
          and created_at >= (date_trunc('day', now() at time zone ${WIB})) at time zone ${WIB}
      ) as feed_today
    from events
  `);

  const [content] = await rows<{
    uploads_week: unknown;
    photos_total: unknown;
    views_week: unknown;
    viewed_photos: unknown;
  }>(sql`
    select
      (select count(*) from photos where created_at >= now() - interval '7 days') as uploads_week,
      (select count(*) from photos where is_active = true) as photos_total,
      (select count(*) from events
        where name = 'photo_view' and created_at >= now() - interval '7 days') as views_week,
      (select count(distinct photo_id) from events
        where name = 'photo_view' and created_at >= now() - interval '7 days') as viewed_photos
  `);

  const viewed = count(content?.viewed_photos);
  const views = count(content?.views_week);

  return {
    dau: count(totals?.dau),
    wau: count(totals?.wau),
    mau: count(totals?.mau),
    opensToday: count(totals?.opens_today),
    feedLoadedToday: count(totals?.feed_today),
    uploadsWeek: count(content?.uploads_week),
    photosTotal: count(content?.photos_total),
    avgViewsPerPhoto: viewed > 0 ? Math.round((views / viewed) * 10) / 10 : 0,
  };
}

export async function getUploadFunnel(): Promise<UploadFunnel> {
  const [row] = await rows<{
    step_photo: unknown;
    step_caption: unknown;
    step_confirm: unknown;
    q_gender: unknown;
    q_nsfw: unknown;
    published: unknown;
  }>(sql`
    select
      count(distinct session_id) filter (where meta->>'step' = 'photo') as step_photo,
      count(distinct session_id) filter (where meta->>'step' = 'caption') as step_caption,
      count(distinct session_id) filter (where meta->>'step' = 'confirm' and meta->>'question' is null) as step_confirm,
      count(distinct session_id) filter (where meta->>'question' = 'gender') as q_gender,
      count(distinct session_id) filter (where meta->>'question' = 'nsfw') as q_nsfw,
      count(distinct session_id) filter (where name = 'upload_published') as published
    from events
    where name in ('upload_step', 'upload_published')
      and created_at >= now() - interval '7 days'
  `);

  return {
    stepPhoto: count(row?.step_photo),
    stepCaption: count(row?.step_caption),
    stepConfirm: count(row?.step_confirm),
    questionGender: count(row?.q_gender),
    questionNsfw: count(row?.q_nsfw),
    published: count(row?.published),
  };
}

export async function getGateFunnel(): Promise<GateFunnel> {
  const [row] = await rows<{ shown: unknown; passed: unknown }>(sql`
    select
      count(*) filter (where name = 'gate_shown') as shown,
      count(*) filter (where name = 'gate_pass') as passed
    from events
    where created_at >= now() - interval '7 days'
  `);

  return { shown: count(row?.shown), passed: count(row?.passed) };
}

export async function getTopPhotos(): Promise<TopPhoto[]> {
  const list = await rows<{
    id: unknown;
    slug: string;
    caption: string;
    is_nsfw: boolean;
    views: unknown;
    viewers: unknown;
    reactions: unknown;
    ratings: unknown;
    comments: unknown;
  }>(sql`
    select p.id,
           p.slug,
           p.caption,
           p.is_nsfw,
           count(e.id) filter (where e.name = 'photo_view') as views,
           count(distinct e.session_id) filter (where e.name = 'photo_view') as viewers,
           (select count(*) from reactions r where r.photo_id = p.id) as reactions,
           (select count(*) from ratings ra where ra.photo_id = p.id) as ratings,
           (select count(*) from comments c where c.photo_id = p.id) as comments
    from photos p
    left join events e
      on e.photo_id = p.id and e.created_at >= now() - interval '7 days'
    group by p.id
    order by views desc, p.id desc
    limit 20
  `);

  return list.map((row) => ({
    id: count(row.id),
    slug: row.slug,
    caption: row.caption,
    isNsfw: row.is_nsfw,
    views: count(row.views),
    viewers: count(row.viewers),
    reactions: count(row.reactions),
    ratings: count(row.ratings),
    comments: count(row.comments),
  }));
}

export async function getRetention(): Promise<RetentionRow[]> {
  const list = await rows<{
    day: string;
    cohort: unknown;
    d1: unknown;
    d7: unknown;
  }>(sql`
    with first_seen as (
      select user_id,
             min((created_at at time zone ${WIB})::date) as d0
      from events
      where name = 'app_open' and user_id is not null
      group by 1
    ), activity as (
      select distinct user_id, (created_at at time zone ${WIB})::date as day
      from events
      where name = 'app_open' and user_id is not null
    )
    select to_char(f.d0, 'YYYY-MM-DD') as day,
           count(*) as cohort,
           count(*) filter (
             where exists (
               select 1 from activity a
               where a.user_id = f.user_id and a.day = f.d0 + 1
             )
           ) as d1,
           count(*) filter (
             where exists (
               select 1 from activity a
               where a.user_id = f.user_id and a.day = f.d0 + 7
             )
           ) as d7
    from first_seen f
    where f.d0 >= (now() at time zone ${WIB})::date - 30
    group by 1
    order by 1 desc
    limit 14
  `);

  return list.map((row) => ({
    day: row.day,
    cohort: count(row.cohort),
    d1: count(row.d1),
    d7: count(row.d7),
  }));
}
