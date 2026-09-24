import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { DAY_ORDER, getScheduleForDate } from './schedule.js';
import { getState, updateState, upsertDevice } from './store.js';
import { sendPush } from './push.js';
import { startScheduler } from './scheduler.js';

const app = express();
const port = Number(process.env.PORT || 4000);
app.use(cors());
app.use(express.json({ limit: '100kb' }));

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || req.header('x-admin-key') !== expected) return res.status(401).json({ error: 'admin_auth_required' });
  next();
}

function dateParam(value) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'zvonok-backend', fcmEnabled: process.env.FCM_ENABLED === 'true' }));

app.get('/api/schedule', (req, res) => res.json(getScheduleForDate(dateParam(req.query.date), getState().scheduleOverrides)));

app.get('/api/week', (req, res) => {
  const date = dateParam(req.query.date);
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  const overrides = getState().scheduleOverrides;
  res.json({ days: DAY_ORDER.map((_day, index) => { const current = new Date(monday); current.setDate(monday.getDate() + index); return getScheduleForDate(current, overrides); }) });
});

app.post('/api/devices', (req, res) => {
  const schema = z.object({ token: z.string().min(20), platform: z.enum(['android', 'ios', 'web']).default('android'), userId: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_device', details: parsed.error.flatten() });
  upsertDevice(parsed.data);
  res.status(201).json({ ok: true });
});

app.post('/api/admin/push/test', requireAdmin, async (req, res) => {
  const result = await sendPush({ title: req.body.title || 'Звонок', body: req.body.body || 'Тестовое уведомление работает', data: { type: 'test' } });
  res.json(result);
});

app.post('/api/admin/announcement', requireAdmin, async (req, res) => {
  const text = z.string().min(1).max(140).parse(req.body.text);
  updateState((state) => { state.announcements.push({ text, createdAt: new Date().toISOString() }); return state; });
  const result = await sendPush({ title: 'Сообщение школы', body: text, data: { type: 'announcement' } });
  res.status(201).json({ ok: true, push: result });
});

app.post('/api/admin/schedule', requireAdmin, (req, res) => {
  const schema = z.object({ day: z.enum(DAY_ORDER), lessons: z.array(z.object({ start: z.string(), end: z.string(), subject: z.string().min(1), teacher: z.string().optional(), room: z.string().optional() })) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_schedule', details: parsed.error.flatten() });
  updateState((state) => { state.scheduleOverrides[parsed.data.day] = { subjects: parsed.data.lessons.map((lesson) => lesson.subject), times: parsed.data.lessons.map((lesson, index) => ({ start: lesson.start, end: lesson.end, breakAfter: index < 6 ? [10, 10, 20, 10, 5, 5][index] : 0 })) }; return state; });
  res.json({ ok: true, day: parsed.data.day });
});

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
  startScheduler();
});
