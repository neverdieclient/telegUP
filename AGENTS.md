# Правила проекта telegUP

- При каждом обновлении сайта (веб-код, ассеты, конфиг, влияющий на прод) обязательно пересобирать и обновлять APK: `npx cap sync android`, сборка debug (`android/gradlew.bat assembleDebug` с JDK 21 и Android SDK), затем копировать свежий `app-debug.apk` в `public/telegUP.apk`, `telegUP-debug.apk` (корень проекта) и `C:\Users\User\Downloads\telegUP-debug.apk`.
- APK грузит удалённый сайт `https://telegup.mooo.com`, поэтому веб-фиксы попадают в приложение только после деплоя сайта (Publish telegUP) — после веб-изменений напоминать о деплое; нативные изменения требуют установки обновлённого APK.
- Работать в `C:\Users\User\Downloads\asdasdasd`, отвечать на русском.
