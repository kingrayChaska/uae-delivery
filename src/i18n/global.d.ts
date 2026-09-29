import type { Messages } from '@/i18n/messages';

// Typed translation keys: a key that doesn't exist in messages/en is a
// type error, in server and client components alike.
declare module 'next-intl' {
  interface AppConfig {
    Messages: Messages;
  }
}
