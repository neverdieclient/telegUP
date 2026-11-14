import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.telegup.app',
  appName: 'telegUP',
  // Минимальная оболочка для APK: само приложение грузится с сайта (server.url),
  // поэтому в пакет не кладём тяжёлые ассеты из dist/public.
  webDir: 'dist-apk',
  server: {
    url: 'https://telegup.mooo.com',
    cleartext: false,
  },
};

export default config;
