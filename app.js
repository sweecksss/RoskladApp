const STORAGE_KEY = 'zvonok-demo-state';
const DAY_ORDER = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'];
const ANCHOR_WEEK_START = '2026-09-21';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const SECOND_SHIFT = [
  { start: '14:00', end: '14:45', breakAfter: 10 },
  { start: '14:55', end: '15:40', breakAfter: 10 },
  { start: '15:50', end: '16:35', breakAfter: 20 },
  { start: '16:55', end: '17:40', breakAfter: 10 },
  { start: '17:50', end: '18:35', breakAfter: 5 },
  { start: '18:40', end: '19:25', breakAfter: 5 },
  { start: '19:30', end: '20:15', breakAfter: 0 }
];

const SCHOOL_SCHEDULE = {
  Понедельник: ['Хімія', 'Історія', 'Геогр', 'Фізика', 'Укр літ', 'Фіз. Кул', 'Заруб літ'],
  Вторник: ['Навч/проф', 'Матем', 'Укр/англ', 'Укр/англ', 'Матем', 'Біологія', 'Історія'],
  Среда: ['Мистец', 'Фіз культ', 'Укр.літ', 'Фізика', 'Матем', 'Матем', 'Географ', 'Істор/гром'],
  Четверг: ['Фіз-ра', 'Інформатика', 'Хімія', 'Математика', 'ЗБД', 'Англ/укр', 'Англ/укр'],
  Пятница: ['Укр/англ', 'Англ/техн', 'Англ/техн', 'Укр/англ', 'Інформатика', 'Біологія', 'Біол/підпр']
};

const API_BASE_URL = (window.APP_CONFIG?.apiUrl || '').replace(/\/$/, '');
const LIVE_UPDATE_INTERVAL_MS = 30 * 1000;
let liveUpdateTimer;

function getToast() {
  return document.getElementById('toast');
}

function showToast(message) {
  const toast = getToast();
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function getLiveSchedulePlugin() {
  return window.Capacitor?.Plugins?.LiveSchedule || null;
}

function scheduleMinutes(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function dateAtTime(date, value) {
  const result = atNoon(date);
  const total = scheduleMinutes(value);
  if (total === null) return null;
  result.setHours(Math.floor(total / 60), total % 60, 0, 0);
  return result;
}

async function syncLiveSchedule() {
  const live = getLiveSchedulePlugin();
  if (!live) return;

  const now = new Date();
  const today = atNoon(now);
  const lessons = getLessons(dayName(today)).filter((lesson) => lesson.start && lesson.end);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const inSchoolCount = getInSchoolCount(today);
  let activity = null;

  for (let index = 0; index < lessons.length; index += 1) {
    const lesson = lessons[index];
    const start = scheduleMinutes(lesson.start);
    const end = scheduleMinutes(lesson.end);
    const nextStart = index < lessons.length - 1 ? scheduleMinutes(lessons[index + 1].start) : null;
    const format = getFormat(lesson, inSchoolCount);

    if (nowMinutes >= start && nowMinutes < end) {
      activity = {
        title: `Урок ${lesson.period} · ${lesson.subject}`,
        body: `${formatLabel(format)} · до ${lesson.end}`,
        kind: 'lesson',
        countdownAt: dateAtTime(today, lesson.end).getTime(),
        progress: ((nowMinutes - start) / Math.max(end - start, 1)) * 100
      };
      break;
    }

    if (nextStart !== null && nowMinutes >= end && nowMinutes < nextStart) {
      const nextLesson = lessons[index + 1];
      activity = {
        title: `Перемена · ${nextLesson.subject}`,
        body: `Следующий урок в ${nextLesson.start}`,
        kind: 'break',
        countdownAt: dateAtTime(today, nextLesson.start).getTime(),
        progress: ((nowMinutes - end) / Math.max(nextStart - end, 1)) * 100
      };
      break;
    }

    if (nowMinutes < start && start - nowMinutes <= 5) {
      activity = {
        title: `Через ${start - nowMinutes} мин · ${lesson.subject}`,
        body: `${formatLabel(format)} · начало в ${lesson.start}`,
        kind: 'lesson',
        countdownAt: dateAtTime(today, lesson.start).getTime(),
        progress: 0
      };
      break;
    }
  }

  try {
    if (activity) await live.show(activity);
    else await live.stop();
  } catch (error) {
    console.warn('[live] update failed', error);
  }
}

function startLiveSchedule() {
  syncLiveSchedule();
  window.clearInterval(liveUpdateTimer);
  liveUpdateTimer = window.setInterval(syncLiveSchedule, LIVE_UPDATE_INTERVAL_MS);
}

async function testLiveAlert() {
  const live = getLiveSchedulePlugin();
  if (!live) {
    showToast('Live Alert доступен только в Android APK');
    return;
  }
  try {
    await live.show({
      title: 'Тест Live Alert',
      body: 'Живая карточка · осталось 2 минуты',
      kind: 'lesson',
      countdownAt: Date.now() + 2 * 60 * 1000,
      progress: 0
    });
    showToast('Live Alert запущен');
    window.setTimeout(() => live.stop().catch(() => {}), 125000);
  } catch (error) {
    console.warn('[live] test failed', error);
    showToast('Не удалось запустить Live Alert');
  }
}

async function sendDeviceToken(token) {
  if (!API_BASE_URL || !token) return;
  try {
    const platform = window.Capacitor?.getPlatform?.() || 'android';
    await fetch(`${API_BASE_URL}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: platform === 'ios' ? 'ios' : 'android' })
    });
  } catch (error) {
    console.warn('[push] device registration failed', error);
  }
}

async function setupNativePush() {
  const push = window.Capacitor?.Plugins?.PushNotifications;
  const firebaseMessaging = window.Capacitor?.Plugins?.FirebaseMessaging;
  if (!push && !firebaseMessaging) return false;
  try {
    const channelPlugin = firebaseMessaging || push;
    if (channelPlugin?.createChannel) {
      await channelPlugin.createChannel({ id: 'zvonok', name: 'Звонок', description: 'Уроки и перемены', importance: 5, sound: 'default', vibration: true });
    }

    if (firebaseMessaging) {
      const permission = await firebaseMessaging.requestPermissions();
      if (permission.receive !== 'granted') {
        showToast('Разрешение на push не выдано');
        return true;
      }
      await firebaseMessaging.addListener('tokenReceived', ({ token }) => sendDeviceToken(token));
      await firebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
        if (notification?.data?.date) window.location.hash = 'todaySchedule';
      });
      const result = await firebaseMessaging.getToken();
      if (result?.token) await sendDeviceToken(result.token);
      showToast(API_BASE_URL ? 'Push включены' : 'Токен получен; укажи URL backend');
      return true;
    }

    const current = await push.checkPermissions();
    const permission = current.receive === 'granted' ? current : await push.requestPermissions();
    if (permission.receive !== 'granted') {
      showToast('Разрешение на push не выдано');
      return true;
    }
    await push.addListener('registration', ({ value }) => sendDeviceToken(value));
    await push.addListener('registrationError', (error) => console.warn('[push] registration error', error));
    await push.addListener('pushNotificationActionPerformed', ({ notification }) => {
      if (notification?.data?.date) window.location.hash = 'todaySchedule';
    });
    await push.register();
    showToast(API_BASE_URL ? 'Push включены' : 'Токен получен; укажи URL backend');
    return true;
  } catch (error) {
    console.warn('[push] native setup failed', error);
    showToast('Не удалось включить push');
    return true;
  }
}

async function requestNotifications() {
  if (await setupNativePush()) return;
  if (!('Notification' in window)) {
    showToast('Push подключим после настройки Firebase');
    return;
  }
  Notification.requestPermission().then((permission) => {
    if (permission === 'granted') {
      new Notification('Звонок', { body: 'Уведомления включены. Напомним перед уроком и переменой.' });
      showToast('Уведомления включены');
    } else {
      showToast('Разрешение на уведомления не выдано');
    }
  });
}

function atNoon(value) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  return date;
}

function getMonday(value) {
  const date = atNoon(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

function dateForWeekIndex(weekStart, index) {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + index);
  return atNoon(date);
}

function dayName(value) {
  const day = atNoon(value).getDay();
  return DAY_ORDER[day === 0 ? 6 : day - 1] || 'Понедельник';
}

function russianDate(value) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(atNoon(value));
}

function dateLabel(value, isToday = false) {
  return `${isToday ? 'Сегодня, ' : ''}${dayName(value)}, ${russianDate(value)}`;
}

function weekLabel(value) {
  const start = getMonday(value);
  const end = dateForWeekIndex(start, 6);
  const startMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(start).replace('.', '');
  const endMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(end).replace('.', '');
  return `${start.getDate()} ${startMonth} — ${end.getDate()} ${endMonth}`;
}

function getInSchoolCount(value) {
  const currentWeek = getMonday(value).getTime();
  const anchorWeek = getMonday(ANCHOR_WEEK_START).getTime();
  const weekNumber = Math.floor((currentWeek - anchorWeek) / WEEK_MS);
  return ((weekNumber % 2) + 2) % 2 === 0 ? 5 : 6;
}

function timeToMinutes(value) {
  if (!value || !value.includes(':')) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function lessonIcon(subject) {
  const text = subject.toLowerCase();
  if (text.includes('матем')) return ['math', '∑'];
  if (text.includes('фіз') || text.includes('физ')) return ['sport', '✦'];
  if (text.includes('інформ') || text.includes('информ')) return ['history', '⌘'];
  if (text.includes('англ') || text.includes('укр')) return ['english', 'Aa'];
  if (text.includes('хім') || text.includes('хим')) return ['russian', '⚗'];
  return ['history', '•'];
}

function getLessons(day) {
  return (SCHOOL_SCHEDULE[day] || []).map((subject, index) => ({
    period: index + 1,
    subject,
    ...(SECOND_SHIFT[index] || { start: '', end: '', breakAfter: 0 })
  }));
}

function getFormat(lesson, inSchoolCount) {
  return lesson.period <= inSchoolCount ? 'school' : 'online';
}

function formatLabel(format) {
  return format === 'school' ? 'В школе' : 'Онлайн';
}

function getNextLesson(value) {
  const selectedDate = atNoon(value);
  const selectedDay = dayName(selectedDate);
  const today = atNoon(new Date()).getTime() === selectedDate.getTime();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const lessons = getLessons(selectedDay);
  const nextToday = today ? lessons.find((lesson) => timeToMinutes(lesson.start) > nowMinutes) : lessons.find((lesson) => lesson.start);
  if (nextToday) return { lesson: nextToday, date: selectedDate, isToday: today, isSelected: true };

  for (let offset = 1; offset <= 7; offset += 1) {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + offset);
    const nextDay = dayName(nextDate);
    const next = getLessons(nextDay).find((lesson) => lesson.start);
    if (next) return { lesson: next, date: atNoon(nextDate), isToday: false, isSelected: false };
  }
  return null;
}

function renderNextCard(value) {
  const next = getNextLesson(value);
  if (!next) return;
  const lesson = next.lesson;
  const format = getFormat(lesson, getInSchoolCount(next.date));
  const [iconClass, iconText] = lessonIcon(lesson.subject);
  const icon = document.querySelector('.next-card .subject-icon');
  icon.className = `subject-icon ${iconClass}`;
  icon.textContent = iconText;
  document.getElementById('nextStatus').textContent = next.isToday ? 'Следующий урок' : next.isSelected ? 'План на день' : `Следующий учебный день · ${dayName(next.date)}`;
  document.getElementById('nextTime').textContent = lesson.start || '—';
  document.getElementById('nextLabel').textContent = `${lesson.period} урок · ${formatLabel(format)}`;
  document.getElementById('nextSubject').textContent = lesson.subject;
  document.getElementById('nextMode').textContent = `Вторая смена · ${format === 'school' ? 'очно' : 'дистанционно'}`;
  document.getElementById('nextBreak').textContent = lesson.breakAfter ? `Перемена ${lesson.breakAfter} минут` : 'Последний урок';
  document.getElementById('nextEnd').textContent = lesson.end || 'время уточняется';
  const now = new Date();
  const progress = next.isToday && lesson.start && lesson.end ? Math.max(0, Math.min(100, ((now.getHours() * 60 + now.getMinutes() - timeToMinutes(lesson.start)) / (timeToMinutes(lesson.end) - timeToMinutes(lesson.start))) * 100)) : 0;
  document.getElementById('nextProgress').style.width = `${progress}%`;
}

function lessonMarkup(lesson, value, inSchoolCount) {
  const format = getFormat(lesson, inSchoolCount);
  const [iconClass, iconText] = lessonIcon(lesson.subject);
  const today = atNoon(value).getTime() === atNoon(new Date()).getTime();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const isDone = today && lesson.end && timeToMinutes(lesson.end) <= nowMinutes;
  const isCurrent = today && lesson.start && lesson.end && timeToMinutes(lesson.start) <= nowMinutes && nowMinutes < timeToMinutes(lesson.end);
  const classes = ['lesson-row', format === 'online' ? 'is-online' : '', isDone ? 'is-done' : '', isCurrent ? 'is-current' : ''].filter(Boolean).join(' ');
  const time = lesson.start ? `<strong>${lesson.start}</strong><span>${lesson.end}</span>` : '<strong>—</strong><span>время уточняется</span>';
  return `<article class="${classes}">
    <div class="lesson-time">${time}</div>
    <div class="lesson-line"><span></span></div>
    <div class="lesson-info"><span class="lesson-type">${lesson.period} урок · <span class="lesson-format ${format}">${formatLabel(format)}</span></span><h3>${lesson.subject}</h3><p>Вторая смена</p></div>
    <span class="subject-icon ${iconClass}">${iconText}</span>
  </article>${lesson.breakAfter ? `<div class="break-row"><span>перемена</span><span>${lesson.breakAfter} мин</span></div>` : ''}`;
}

function renderWeekButtons(selectedDate) {
  const start = getMonday(selectedDate);
  document.getElementById('weekRange').textContent = weekLabel(selectedDate);
  document.querySelectorAll('.week-days button').forEach((button, index) => {
    const date = dateForWeekIndex(start, index);
    button.dataset.isoDate = date.toISOString();
    button.querySelector('span').textContent = DAY_SHORT[index];
    button.querySelector('strong').textContent = date.getDate();
    button.classList.toggle('selected', date.getTime() === atNoon(selectedDate).getTime());
  });
}

function renderStudentDay(value) {
  const date = atNoon(value);
  const day = dayName(date);
  const lessons = getLessons(day);
  const inSchoolCount = getInSchoolCount(date);
  const onlineCount = Math.max(lessons.length - inSchoolCount, 0);
  const isToday = date.getTime() === atNoon(new Date()).getTime();
  document.getElementById('dateLabel').textContent = dateLabel(date, isToday);
  document.getElementById('daySummary').textContent = `${isToday ? 'Сегодня ' : ''}${lessons.length} уроков · ${inSchoolCount} в школе, ${onlineCount} онлайн`;
  document.getElementById('dayHeading').textContent = day;
  document.getElementById('cycleTitle').textContent = `Эта неделя: ${inSchoolCount} уроков в школе`;
  document.getElementById('cycleText').textContent = onlineCount ? 'Остальные уроки проходят онлайн' : 'Все уроки проходят в школе';
  document.getElementById('cycleNext').textContent = `Следующая: ${inSchoolCount === 5 ? 6 : 5}`;
  document.getElementById('todaySchedule').innerHTML = lessons.map((lesson) => lessonMarkup(lesson, date, inSchoolCount)).join('');
  renderWeekButtons(date);
  renderNextCard(date);
}

function initStudentApp() {
  const notificationButton = document.getElementById('notificationButton');
  const tipButton = document.getElementById('tipNotificationButton');
  const liveTestButton = document.getElementById('liveTestButton');
  notificationButton?.addEventListener('click', requestNotifications);
  tipButton?.addEventListener('click', requestNotifications);
  liveTestButton?.addEventListener('click', testLiveAlert);
  document.querySelectorAll('.week-days button').forEach((button) => {
    button.addEventListener('click', () => {
      const date = new Date(button.dataset.isoDate);
      document.querySelectorAll('.week-days button').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      renderStudentDay(date);
      showToast(`Открыто расписание на ${dayName(date)}`);
    });
  });
  renderStudentDay(atNoon(new Date()));
  startLiveSchedule();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function getAdminState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function saveAdminState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function defaultAdminRows(day) {
  return getLessons(day).map((lesson) => [lesson.start, lesson.end, lesson.subject, '', '']);
}

function readAdminRows(body) {
  return [...body.querySelectorAll('tr')].map((row) => [...row.querySelectorAll('input')].map((input) => input.value));
}

function renderAdminDay(day, body, state) {
  const rows = state.schedules?.[day] || defaultAdminRows(day);
  const inSchoolCount = getInSchoolCount(new Date());
  body.innerHTML = rows.map((row, index) => {
    const format = index + 1 <= inSchoolCount ? 'in-school' : 'online';
    const formatText = format === 'in-school' ? 'В школе' : 'Онлайн';
    return `<tr><td>${index + 1}</td><td><input value="${row[0] || ''}" aria-label="Начало урока"><span>—</span><input value="${row[1] || ''}" aria-label="Конец урока"></td><td><input value="${row[2] || ''}" aria-label="Предмет"></td><td><span class="format-badge ${format}">${formatText}</span></td><td><input value="${row[3] || ''}" aria-label="Преподаватель"></td><td><input value="${row[4] || ''}" aria-label="Кабинет"></td><td><button class="row-menu" aria-label="Удалить урок">•••</button></td></tr>`;
  }).join('');
}

function initAdmin() {
  const state = getAdminState();
  const body = document.getElementById('adminScheduleBody');
  const saveButton = document.getElementById('saveScheduleButton');
  const saveState = document.getElementById('saveState');
  const announcement = document.getElementById('announcement');
  const charCount = document.getElementById('charCount');
  let selectedDay = 'Понедельник';

  const persistCurrentDay = () => {
    const nextState = getAdminState();
    nextState.schedules = { ...(nextState.schedules || {}), [selectedDay]: readAdminRows(body) };
    saveAdminState(nextState);
  };

  renderAdminDay(selectedDay, body, state);
  document.querySelectorAll('.admin-day-tabs button').forEach((tab) => {
    tab.addEventListener('click', () => {
      persistCurrentDay();
      document.querySelectorAll('.admin-day-tabs button').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      selectedDay = tab.dataset.day;
      renderAdminDay(selectedDay, body, getAdminState());
      showToast(`Редактирование: ${selectedDay}`);
    });
  });

  saveButton?.addEventListener('click', () => {
    persistCurrentDay();
    saveState.textContent = 'Только что сохранено';
    showToast('Расписание сохранено');
    window.setTimeout(() => { saveState.textContent = 'Все изменения сохранены'; }, 2200);
  });

  document.getElementById('addLessonButton')?.addEventListener('click', () => {
    const next = body.querySelectorAll('tr').length + 1;
    const format = next <= getInSchoolCount(new Date()) ? 'in-school' : 'online';
    const formatText = format === 'in-school' ? 'В школе' : 'Онлайн';
    body.insertAdjacentHTML('beforeend', `<tr><td>${next}</td><td><input value=""><span>—</span><input value=""></td><td><input value="Новый предмет"></td><td><span class="format-badge ${format}">${formatText}</span></td><td><input value=""></td><td><input value=""></td><td><button class="row-menu" aria-label="Удалить урок">•••</button></td></tr>`);
    showToast('Добавлен новый урок');
  });

  body.addEventListener('click', (event) => {
    const button = event.target.closest('.row-menu');
    if (!button) return;
    button.closest('tr')?.remove();
    [...body.querySelectorAll('tr')].forEach((row, index) => { row.firstElementChild.textContent = index + 1; });
    showToast('Урок удалён из текущего дня');
  });

  document.getElementById('exportButton')?.addEventListener('click', () => {
    persistCurrentDay();
    const currentState = getAdminState();
    const rows = DAY_ORDER.flatMap((day) => (currentState.schedules?.[day] || defaultAdminRows(day)).map((row, index) => [day, index + 1, row[0], row[1], row[2], index + 1 <= getInSchoolCount(new Date()) ? 'В школе' : 'Онлайн', row[3], row[4]]));
    const csv = ['День,№,Начало,Конец,Предмет,Формат,Преподаватель,Кабинет', ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'raspisanie-2-smena.csv'; link.click(); URL.revokeObjectURL(link.href);
    showToast('CSV-файл подготовлен');
  });

  announcement?.addEventListener('input', () => { charCount.textContent = announcement.value.length; });
  document.getElementById('publishButton')?.addEventListener('click', () => {
    if (!announcement.value.trim()) { showToast('Сначала напишите текст объявления'); return; }
    saveAdminState({ ...getAdminState(), announcement: announcement.value.trim() });
    announcement.value = ''; charCount.textContent = '0'; showToast('Объявление опубликовано');
  });
  document.getElementById('sendTestButton')?.addEventListener('click', () => showToast('Тестовое уведомление отправлено'));
}

if (document.getElementById('todaySchedule')) initStudentApp();
if (document.getElementById('adminScheduleBody')) initAdmin();
