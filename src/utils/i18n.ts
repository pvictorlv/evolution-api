import { ConfigService, Language } from '@config/env.config';
import fs from 'fs';
import i18next from 'i18next';
import path from 'path';

const configService: ConfigService = new ConfigService();

const resources: any = {};

i18next.init({
  resources,
  fallbackLng: 'en',
  lng: configService.get<Language>('LANGUAGE'),
  debug: false,

  interpolation: {
    escapeValue: false,
  },
});
export default i18next;
