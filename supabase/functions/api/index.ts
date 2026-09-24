import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DAY_ORDER = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];
const ANCHOR_WEEK_START = "2026-09-21";
const TIME_ZONE = "Europe/Kyiv";
const LESSON_LEAD_MINUTES = 5;
const BREAK_LEAD_MINUTES = 2;
const SECOND_SHIFT = [
  { start: "14:00", end: "14:45", breakAfter: 10 },
  { start: "14:55", end: "15:40", breakAfter: 10 },
  { start: "15:50", end: "16:35", breakAfter: 20 },
  { start: "16:55", end: "17:40", breakAfter: 10 },
  { start: "17:50", end: "18:35", breakAfter: 5 },
  { start: "18:40", end: "19:25", breakAfter: 5 },
  { start: "19:30", end: "20:15", breakAfter: 0 },
];
const SCHOOL_SCHEDULE: Record<string, string[]> = {
  Понедельник: ["Хімія", "Історія", "Геогр", "Фізика", "Укр літ", "Фіз. Кул", "Заруб літ"],
  Вторник: ["Навч/проф", "Матем", "Укр/англ", "Укр/англ", "Матем", "Біологія", "Історія"],
  Среда: ["Мистец", "Фіз культ", "Укр.літ", "Фізика", "Матем", "Матем", "Географ", "Істор/гром"],
  Четверг: ["Фіз-ра", "Інформатика", "Хімія", "Математика", "ЗБД", "Англ/укр", "Англ/укр"],
  Пятница: ["Укр/англ", "Англ/техн", "Англ/техн", "Укр/англ", "Інформатика", "Біологія", "Біол/підпр"],
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key, x-scheduler-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Lesson = {
  period: number;
  subject: string;
  start: string;
  end: string;
  breakAfter: number;
  format?: "school" | "online";
};

type OverrideRow = { day: string; lessons: Array<Partial<Lesson> & { subject: string }> };
type Overrides = Record<string, { lessons: OverrideRow["lessons"] }>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : kyivNow().date;
}

function utcNoon(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function monday(date: string) {
  const result = utcNoon(date);
  const day = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - day + 1);
  return result;
}

function dayName(date: string) {
  const day = utcNoon(date).getUTCDay();
  return DAY_ORDER[day === 0 ? 6 : day - 1] ?? "Понедельник";
}

function inSchoolCount(date: string) {
  const weekNumber = Math.floor((monday(date).getTime() - monday(ANCHOR_WEEK_START).getTime()) / (7 * 24 * 60 * 60 * 1000));
  return ((weekNumber % 2) + 2) % 2 === 0 ? 5 : 6;
}

function kyivNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

function getLessons(day: string, overrides: Overrides): Lesson[] {
  const override = overrides[day]?.lessons;
  if (Array.isArray(override) && override.length) {
    return override.map((lesson, index) => ({
      period: index + 1,
      subject: String(lesson.subject || "Новый предмет"),
      start: String(lesson.start || SECOND_SHIFT[index]?.start || ""),
      end: String(lesson.end || SECOND_SHIFT[index]?.end || ""),
      breakAfter: Number(lesson.breakAfter ?? SECOND_SHIFT[index]?.breakAfter ?? 0),
    }));
  }
  return (SCHOOL_SCHEDULE[day] ?? []).map((subject, index) => ({
    period: index + 1,
    subject,
    ...SECOND_SHIFT[index],
  }));
}

function scheduleForDate(date: string, overrides: Overrides) {
  const day = dayName(date);
  const count = inSchoolCount(date);
  const lessons = getLessons(day, overrides).map((lesson) => ({
    ...lesson,
    format: lesson.period <= count ? "school" : "online",
  }));
  return {
    date,
    day,
    shift: "second",
    inSchoolCount: count,
    nextWeekInSchoolCount: count === 5 ? 6 : 5,
    lessons,
  };
}

async function loadOverrides(): Promise<Overrides> {
  const { data, error } = await supabase.from("schedule_overrides").select("day, lessons");
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as OverrideRow[]).map((row) => [row.day, { lessons: row.lessons }]));
}

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let firebaseAccessToken = "";
let firebaseAccessTokenExpiresAt = 0;

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function privateKeyBuffer(pem: string) {
  const content = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
  return bytes.buffer;
}

async function getFirebaseAccessToken(account: ServiceAccount) {
  if (firebaseAccessToken && Date.now() < firebaseAccessTokenExpiresAt) return firebaseAccessToken;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const assertion = `${header}.${claim}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Firebase OAuth failed: ${await response.text()}`);
  const payload = await response.json();
  firebaseAccessToken = payload.access_token;
  firebaseAccessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 120) * 1000;
  return firebaseAccessToken;
}

function getFirebaseAccount(): ServiceAccount | null {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    const account = JSON.parse(raw) as ServiceAccount;
    if (!account.project_id || !account.client_email || !account.private_key) return null;
    return account;
  } catch {
    return null;
  }
}

async function sendPush(input: { title: string; body: string; data?: Record<string, unknown> }) {
  const { data: devices, error } = await supabase.from("devices").select("id, token");
  if (error) throw error;
  if (!devices?.length) return { sent: 0, failed: 0, skipped: 0, reason: "no-devices" };
  const account = getFirebaseAccount();
  if (!account) return { sent: 0, failed: 0, skipped: devices.length, reason: "fcm-not-configured" };
  const accessToken = await getFirebaseAccessToken(account);
  const invalidIds: string[] = [];
  let sent = 0;
  let failed = 0;
  await Promise.all(devices.map(async (device: { id: string; token: string }) => {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: device.token,
          notification: { title: input.title, body: input.body },
          data: Object.fromEntries(Object.entries(input.data ?? {}).map(([key, value]) => [key, String(value)])),
          android: { priority: "HIGH", notification: { channel_id: "zvonok" } },
        },
      }),
    });
    const text = await response.text();
    if (response.ok) sent += 1;
    else {
      failed += 1;
      if (text.includes("UNREGISTERED") || text.includes("registration-token-not-registered")) invalidIds.push(device.id);
    }
  }));
  if (invalidIds.length) await supabase.from("devices").delete().in("id", invalidIds);
  return { sent, failed, skipped: 0, removedInvalidTokens: invalidIds.length };
}

async function markEventOnce(eventKey: string) {
  const { data, error } = await supabase.from("sent_events").insert({ event_key: eventKey }).select("event_key").maybeSingle();
  if (error && error.code !== "23505") throw error;
  return Boolean(data);
}

async function runScheduleNotifications() {
  const now = kyivNow();
  const overrides = await loadOverrides();
  const schedule = scheduleForDate(now.date, overrides);
  const results: unknown[] = [];
  for (const lesson of schedule.lessons) {
    if (!lesson.start) continue;
    const lessonEvent = `${schedule.date}:lesson:${lesson.period}:${lesson.start}`;
    if (now.minute === minutes(lesson.start) - LESSON_LEAD_MINUTES && await markEventOnce(lessonEvent)) {
      results.push(await sendPush({
        title: `Через ${LESSON_LEAD_MINUTES} минут урок`,
        body: `${lesson.period}. ${lesson.subject} · ${lesson.format === "school" ? "в школе" : "онлайн"} · начало в ${lesson.start}`,
        data: { type: "lesson", date: schedule.date, period: lesson.period },
      }));
    }
    if (lesson.breakAfter && lesson.end) {
      const breakEvent = `${schedule.date}:break:${lesson.period}:${lesson.end}`;
      if (now.minute === minutes(lesson.end) - BREAK_LEAD_MINUTES && await markEventOnce(breakEvent)) {
        results.push(await sendPush({
          title: "Скоро перемена",
          body: `Через ${BREAK_LEAD_MINUTES} минуты начнётся перемена · после ${lesson.subject}`,
          data: { type: "break", date: schedule.date, period: lesson.period },
        }));
      }
    }
  }
  return { ok: true, date: now.date, time: now.time, events: results.length, results };
}

function adminAuthorized(request: Request) {
  const expected = Deno.env.get("ADMIN_API_KEY");
  return Boolean(expected && request.headers.get("x-admin-key") === expected);
}

async function requestJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function routePath(request: Request) {
  const url = new URL(request.url);
  const marker = "/functions/v1/api";
  const index = url.pathname.indexOf(marker);
  return (index >= 0 ? url.pathname.slice(index + marker.length) : url.pathname) || "/";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(request.url);
    const path = routePath(request);
    if (path === "/api/health" || path === "/health") {
      return json({ ok: true, service: "zvonok-supabase", fcmEnabled: Boolean(getFirebaseAccount()) });
    }
    if ((path === "/" || path === "") && url.searchParams.get("route") === "scheduler") {
      if (request.headers.get("x-scheduler-secret") !== Deno.env.get("SCHEDULER_SECRET")) return json({ error: "scheduler_auth_required" }, 401);
      return json(await runScheduleNotifications());
    }
    if (path === "/api/schedule" || path === "/schedule") {
      const overrides = await loadOverrides();
      return json(scheduleForDate(isoDate(url.searchParams.get("date") ?? ""), overrides));
    }
    if (path === "/api/week" || path === "/week") {
      const start = monday(isoDate(url.searchParams.get("date") ?? ""));
      const overrides = await loadOverrides();
      const days = DAY_ORDER.map((_day, index) => {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index);
        return scheduleForDate(date.toISOString().slice(0, 10), overrides);
      });
      return json({ days });
    }
    if (path === "/api/devices" || path === "/devices") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const body = await requestJson(request);
      if (typeof body.token !== "string" || body.token.length < 20) return json({ error: "invalid_device" }, 400);
      const platform = ["android", "ios", "web"].includes(body.platform) ? body.platform : "android";
      const { error } = await supabase.from("devices").upsert({ token: body.token, platform, user_id: body.userId ?? null, updated_at: new Date().toISOString() }, { onConflict: "token" });
      if (error) throw error;
      return json({ ok: true }, 201);
    }
    if (path.startsWith("/api/admin/") || path.startsWith("/admin/")) {
      if (!adminAuthorized(request)) return json({ error: "admin_auth_required" }, 401);
      const body = await requestJson(request);
      if (path === "/api/admin/push/test" || path === "/admin/push/test") {
        return json(await sendPush({ title: body.title || "Звонок", body: body.body || "Тестовое уведомление работает", data: { type: "test" } }));
      }
      if (path === "/api/admin/announcement" || path === "/admin/announcement") {
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text || text.length > 140) return json({ error: "invalid_announcement" }, 400);
        const { error } = await supabase.from("announcements").insert({ text });
        if (error) throw error;
        return json({ ok: true, push: await sendPush({ title: "Сообщение школы", body: text, data: { type: "announcement" } }) }, 201);
      }
      if (path === "/api/admin/schedule" || path === "/admin/schedule") {
        if (!DAY_ORDER.includes(body.day) || !Array.isArray(body.lessons)) return json({ error: "invalid_schedule" }, 400);
        const lessons = body.lessons.map((lesson: Record<string, unknown>, index: number) => ({
          start: String(lesson.start || ""),
          end: String(lesson.end || ""),
          subject: String(lesson.subject || "Новый предмет"),
          teacher: lesson.teacher ? String(lesson.teacher) : "",
          room: lesson.room ? String(lesson.room) : "",
          breakAfter: SECOND_SHIFT[index]?.breakAfter ?? 0,
        }));
        const { error } = await supabase.from("schedule_overrides").upsert({ day: body.day, lessons, updated_at: new Date().toISOString() });
        if (error) throw error;
        return json({ ok: true, day: body.day });
      }
    }
    return json({ error: "not_found" }, 404);
  } catch (error) {
    console.error("[api]", error);
    return json({ error: "server_error", message: error instanceof Error ? error.message : "unknown_error" }, 500);
  }
});
