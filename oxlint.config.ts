import { readFileSync } from 'node:fs'

import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

// The house preset stays fully on. `oxlint.baseline.json` lists, per rule, the files that already violated it when
// this repository adopted the preset. A rule is switched off only for those files, so a new file faces every rule, and
// each follow-up that cleans a package deletes its entries. Nothing here weakens a rule for new code.
const baseline: Record<string, ReadonlyArray<string>> = JSON.parse(
  readFileSync(new URL('./oxlint.baseline.json', import.meta.url), 'utf8'),
)

// The preset spells one rule several ways: plugin rules as `@systemfsoftware/<plugin>/<rule>` or
// `@systemfsoftware/oxlint-plugin-<plugin>/<rule>`, core rules bare or prefixed. Switch off every spelling.
function spellings(key: string): ReadonlyArray<string> {
  const segments = key.split('/')
  if (key.startsWith('@systemfsoftware/')) {
    const plugin = segments[1]!
    const rule = segments.slice(2).join('/')
    const bare = plugin.replace(/^oxlint-plugin-/, '')
    return [`@systemfsoftware/${bare}/${rule}`, `@systemfsoftware/oxlint-plugin-${bare}/${rule}`]
  }
  return segments.length > 1 ? [key, segments[1]!] : [key]
}

export default defineConfig({
  extends: [recommended],
  ignorePatterns: ['.agents/**', '.claude/**', '**/dist/**'],
  overrides: Object.entries(baseline).map(([key, files]) => ({
    files: [...files],
    rules: Object.fromEntries(spellings(key).map((name) => [name, 'off' as const])),
  })),
})
