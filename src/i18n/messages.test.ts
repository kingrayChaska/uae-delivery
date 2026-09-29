import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TYPE, parse } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';

import en from '../../messages/en';
import ar from '../../messages/ar';

import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';

type Tree = { [key: string]: string | Tree };

const leaves = (tree: Tree, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  );

const lookup = (tree: Tree, key: string): string | Tree | undefined =>
  key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);

// The ICU arguments a message uses ({name}, {count, plural, …}) and its rich
// text tags (<strong>…</strong>), which must match across languages. Plural
// branches differ by language (Arabic has six), so only their contents count.
const placeholders = (message: string) => {
  const found = new Set<string>();
  const visit = (elements: MessageFormatElement[]) => {
    for (const element of elements) {
      if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
      found.add(element.type === TYPE.tag ? `<${element.value}>` : element.value);
      if (element.type === TYPE.tag) visit(element.children);
      if (element.type === TYPE.plural || element.type === TYPE.select)
        Object.values(element.options).forEach((option) => visit(option.value));
    }
  };
  visit(parse(message));
  return [...found].sort();
};

const enLeaves = leaves(en as Tree);
const arLeaves = new Map(leaves(ar as Tree));

describe('translation files', () => {
  it('has an Arabic message for every English one, and nothing extra', () => {
    expect(enLeaves.map(([key]) => key).filter((key) => !arLeaves.has(key))).toEqual([]);
    const enKeys = new Set(enLeaves.map(([key]) => key));
    expect([...arLeaves.keys()].filter((key) => !enKeys.has(key))).toEqual([]);
  });

  it('uses the same placeholders and tags in both languages', () => {
    const mismatched = enLeaves
      .filter(([key]) => arLeaves.has(key))
      .filter(([key, message]) => placeholders(message).join() !== placeholders(arLeaves.get(key)!).join())
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('has no empty messages', () => {
    expect(enLeaves.filter(([, message]) => !message.trim()).map(([key]) => key)).toEqual([]);
    expect([...arLeaves].filter(([, message]) => !message.trim()).map(([key]) => key)).toEqual([]);
  });

  it('defines every message key the source code refers to', () => {
    // Full literal keys only: 'booking.errors.createOneFailed', msg('…'), ref('…').
    const keyLiteral = new RegExp(`['"\`]@?((?:${Object.keys(en).join('|')})(?:\\.[A-Za-z_]\\w*)+)['"\`|]`, 'g');
    // Skipped: t('…') on a translator scoped to a namespace, and the dotted
    // audit-log actions and notification types, which aren't messages.
    const scopedCall = /(\bt\(|\bcase\s+)$/;
    const notAMessage = /^\s*(action|type)\s*:/;
    const missing = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name)) {
          const source = readFileSync(path, 'utf8');
          for (const match of source.matchAll(keyLiteral)) {
            const lineStart = source.lastIndexOf('\n', match.index) + 1;
            if (scopedCall.test(source.slice(lineStart, match.index)) || notAMessage.test(source.slice(lineStart))) continue;
            if (lookup(en as Tree, match[1]) === undefined) missing.add(`${match[1]} (${path})`);
          }
        }
      }
    };
    walk(join(__dirname, '..'));
    expect([...missing]).toEqual([]);
  });
});
