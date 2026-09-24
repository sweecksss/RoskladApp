# Сборка iOS

Проект iOS уже создан в `ios/App` и использует Firebase Messaging для FCM-токена.

## Что нужно сделать на Mac

1. В Firebase Console добавь iOS-приложение с Bundle ID `com.rosklad.zvonok`.
2. Скачай `GoogleService-Info.plist` и положи его в `ios/App/App/`.
3. Открой `ios/App/App.xcworkspace` в Xcode, добавь `GoogleService-Info.plist` в target `App`.
4. В Xcode включи для target `App` capabilities `Push Notifications` и `Background Modes → Remote notifications`.
5. Выбери свою Apple Developer Team и устройство/симулятор.
6. В терминале Mac выполни:

```bash
npm install
npx cap sync ios
cd ios/App
pod install
open App.xcworkspace
```

Для реальных push нужен Apple Developer аккаунт и APNs Key/Certificate, загруженный в Firebase Console.

Файл `GoogleService-Info.plist` не добавляется в репозиторий: он содержит настройки конкретного Firebase iOS-приложения.

## Сборка через GitHub Actions и Sideloadly

В проекте есть workflow `.github/workflows/ios-ipa.yml`. Он собирает unsigned IPA на облачном macOS без личного Mac.

1. Создай GitHub repository и загрузи проект.
2. В Settings → Secrets and variables → Actions добавь `GOOGLE_SERVICE_INFO_PLIST_BASE64` — результат команды `base64 -w 0 ios/App/App/GoogleService-Info.plist` на Linux.
3. Открой Actions → Build iOS IPA → Run workflow.
4. Скачай artifact `zvonok-ipa` и передай `Zvonok.ipa` в Sideloadly.

Бесплатный Apple ID обычно подписывает sideloaded-приложение на 7 дней; затем его нужно обновлять тем же Apple ID. Это ограничение Apple, а не проекта.
