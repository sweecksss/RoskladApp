import cron from 'node-cron';
import { getScheduleForDate } from './schedule.js';
import { getState, markEventSent, wasEventSent } from './store.js';
import { sendPush } from './push.js';

const LESSON_LEAD_MINUTES = Number(process.env.LESSON_LEAD_MINUTES || 5);
const BREAK_LEAD_MINUTES = Number(process.env.BREAK_LEAD_MINUTES || 2);

function minutes(value) {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

export async function runScheduleNotifications(now = new Date()) {
  const schedule = getScheduleForDate(now, getState().scheduleOverrides);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  for (const lesson of schedule.lessons) {
    if (!lesson.start) continue;
    const lessonEvent = `${schedule.date}:lesson:${lesson.period}:${lesson.start}`;
    if (currentMinutes === minutes(lesson.start) - LESSON_LEAD_MINUTES && !wasEventSent(lessonEvent)) {
      await sendPush({
        title: `Через ${LESSON_LEAD_MINUTES} минут урок`,
        body: `${lesson.period}. ${lesson.subject} · ${lesson.format === 'school' ? 'в школе' : 'онлайн'} · начало в ${lesson.start}`,
        data: { type: 'lesson', date: schedule.date, period: lesson.period }
      });
      markEventSent(lessonEvent);
    }
    if (lesson.breakAfter && lesson.end) {
      const breakEvent = `${schedule.date}:break:${lesson.period}:${lesson.end}`;
      if (currentMinutes === minutes(lesson.end) - BREAK_LEAD_MINUTES && !wasEventSent(breakEvent)) {
        await sendPush({
          title: 'Скоро перемена',
          body: `Через ${BREAK_LEAD_MINUTES} минуты начнётся перемена · после ${lesson.subject}`,
          data: { type: 'break', date: schedule.date, period: lesson.period }
        });
        markEventSent(breakEvent);
      }
    }
  }
}

export function startScheduler() {
  const timezone = process.env.TZ || 'Europe/Kyiv';
  cron.schedule('* * * * *', () => runScheduleNotifications().catch((error) => console.error('[scheduler]', error)), { timezone });
  console.log(`[scheduler] started, timezone=${timezone}, lessonLead=${LESSON_LEAD_MINUTES}m, breakLead=${BREAK_LEAD_MINUTES}m`);
}
