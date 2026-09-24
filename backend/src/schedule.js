export const DAY_ORDER = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
export const ANCHOR_WEEK_START = '2026-09-21';
export const SECOND_SHIFT = [
  { start: '14:00', end: '14:45', breakAfter: 10 },
  { start: '14:55', end: '15:40', breakAfter: 10 },
  { start: '15:50', end: '16:35', breakAfter: 20 },
  { start: '16:55', end: '17:40', breakAfter: 10 },
  { start: '17:50', end: '18:35', breakAfter: 5 },
  { start: '18:40', end: '19:25', breakAfter: 5 },
  { start: '19:30', end: '20:15', breakAfter: 0 }
];

export const SCHOOL_SCHEDULE = {
  Понедельник: ['Хімія', 'Історія', 'Геогр', 'Фізика', 'Укр літ', 'Фіз. Кул', 'Заруб літ'],
  Вторник: ['Навч/проф', 'Матем', 'Укр/англ', 'Укр/англ', 'Матем', 'Біологія', 'Історія'],
  Среда: ['Мистец', 'Фіз культ', 'Укр.літ', 'Фізика', 'Матем', 'Матем', 'Географ', 'Істор/гром'],
  Четверг: ['Фіз-ра', 'Інформатика', 'Хімія', 'Математика', 'ЗБД', 'Англ/укр', 'Англ/укр'],
  Пятница: ['Укр/англ', 'Англ/техн', 'Англ/техн', 'Укр/англ', 'Інформатика', 'Біологія', 'Біол/підпр']
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function atNoon(value) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function getMonday(value) {
  const date = atNoon(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

export function dayName(value) {
  const day = atNoon(value).getDay();
  return DAY_ORDER[day === 0 ? 6 : day - 1] || 'Понедельник';
}

export function getInSchoolCount(value) {
  const weekNumber = Math.floor((getMonday(value).getTime() - getMonday(ANCHOR_WEEK_START).getTime()) / WEEK_MS);
  return ((weekNumber % 2) + 2) % 2 === 0 ? 5 : 6;
}

export function getLessons(day, overrides = {}) {
  const subjects = overrides.subjects || SCHOOL_SCHEDULE[day] || [];
  const times = overrides.times || SECOND_SHIFT;
  return subjects.map((subject, index) => ({
    period: index + 1,
    subject,
    ...(times[index] || { start: '', end: '', breakAfter: 0 })
  }));
}

export function getScheduleForDate(value, overrides = {}) {
  const date = atNoon(value);
  const lessons = getLessons(dayName(date), overrides[dayName(date)] || {});
  const inSchoolCount = getInSchoolCount(date);
  return {
    date: date.toISOString().slice(0, 10),
    day: dayName(date),
    shift: 'second',
    inSchoolCount,
    nextWeekInSchoolCount: inSchoolCount === 5 ? 6 : 5,
    lessons: lessons.map((lesson) => ({ ...lesson, format: lesson.period <= inSchoolCount ? 'school' : 'online' }))
  };
}
