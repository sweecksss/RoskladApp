# План production-версии

## Роли

- **Администратор** — меняет расписание, звонки, классы, объявления и подписки.
- **Ученик** — видит своё расписание и получает уведомления.
- **Родитель** — видит расписание выбранного ребёнка и важные объявления.
- **Учитель** — видит свои уроки и может сообщить о замене.

## Минимальная модель данных

```text
School(id, name, timezone)
Class(id, school_id, name, grade)
User(id, role, name, email, class_id)
Lesson(id, class_id, weekday, ordinal, starts_at, ends_at, subject, teacher, room)
Break(id, school_id, weekday, starts_at, ends_at, label)
DeviceToken(id, user_id, platform, token, enabled)
Announcement(id, school_id, author_id, text, published_at)
```

## Поведение уведомлений

1. Администратор сохраняет расписание и настройки: напоминание до урока `N` минут, до перемены `M` минут.
2. Сервер получает часовой пояс школы и строит задания на ближайшие сутки.
3. Планировщик отправляет push по `DeviceToken` через FCM/APNs.
4. При переносе урока старые задания отменяются, новые создаются, подписчики получают отдельное уведомление об изменении.

Это важно делать на сервере: локальный таймер приложения не гарантирует доставку, если приложение закрыто или выгружено системой.

## Предлагаемый стек

- мобильное приложение: React Native + Expo;
- админка: Next.js;
- backend: Supabase (Auth + Postgres + Edge Functions) или Firebase;
- push: Expo Notifications / FCM / APNs;
- сборка: EAS Build (`.aab/.apk` для Android, `.ipa` для iOS).
