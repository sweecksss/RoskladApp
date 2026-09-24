# Backend и FCM

Backend хранит FCM-токены устройств, отдаёт расписание и каждую минуту проверяет события второй смены:

- уведомление за 5 минут до урока;
- уведомление за 2 минуты до конца урока, то есть перед переменой;
- формат урока учитывает чередование недель `5 очных → 6 очных`.

## Локальный запуск

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Проверка:

```bash
curl http://localhost:4000/api/health
curl 'http://localhost:4000/api/schedule?date=2026-09-24'
```

## Подключение Firebase

1. Создай Firebase project.
2. В Android-приложении добавь приложение с package name `com.rosklad.zvonok`.
3. Скачай `google-services.json` и положи его в `android/app/google-services.json`.
4. В Firebase Console включи Cloud Messaging API.
5. В Firebase → Project settings → Service accounts создай private key JSON.
6. Не коммить этот ключ. Локально укажи путь в `.env`:

```env
FCM_ENABLED=true
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/firebase-service-account.json
ADMIN_API_KEY=длинный-случайный-ключ
```

7. В `api-config.js` укажи доступный из телефона URL backend и пересобери APK:

```js
window.APP_CONFIG = { apiUrl: 'https://api.example.com' };
```

Для телефона URL `localhost` не подходит: это сам телефон. Для локальной сети используй IP компьютера, например `http://192.168.1.10:4000`, а для production — HTTPS-домен.

## Admin API

Все admin endpoints требуют заголовок `x-admin-key`.

```bash
curl -X POST http://localhost:4000/api/admin/push/test \
  -H 'content-type: application/json' \
  -H 'x-admin-key: YOUR_KEY' \
  -d '{"title":"Тест","body":"FCM работает"}'
```

Firebase Admin SDK работает на доверенном сервере и не должен попадать в мобильное приложение. Сервисный ключ также нельзя хранить в APK или репозитории.
