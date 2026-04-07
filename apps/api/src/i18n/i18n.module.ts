import { Module } from '@nestjs/common';
import {
  I18nModule as NestI18nModule,
  AcceptLanguageResolver,
  HeaderResolver,
} from 'nestjs-i18n';
import { join } from 'path';

@Module({
  imports: [
    NestI18nModule.forRoot({
      fallbackLanguage: 'zh-TW',
      loaderOptions: {
        path: join(__dirname, '/'),
        watch: process.env.NODE_ENV !== 'production',
      },
      resolvers: [
        new HeaderResolver(['x-lang']),
        AcceptLanguageResolver,
      ],
    }),
  ],
})
export class I18nConfigModule {}
