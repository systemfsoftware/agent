import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

// The house preset targets repositories written to its architecture. This tree predates it, and each rule below would
// force a rewrite of behaviour, exported declarations or test names rather than a toolchain change, so it is disabled
// here with its reason. Everything else the preset ships stays on. Three mechanisms need three treatments: preset
// `categories` are deleted, per-glob `overrides` lose the keys, and nested-extends rules are beaten by explicit
// top-level offs.
const disabledWithReasons: Record<string, string> = {
  'eslint/complexity':
    "the runtime's interpreter functions are intentionally dense; splitting them risks behaviour in a toolchain-only change",
  '@systemfsoftware/effect-schema/schema-declaration-location':
    'schemas are declared beside the module that owns them across the whole tree; relocating them is a restructure, not a toolchain change',
  '@systemfsoftware/cell-architecture/no-direct-tag-access':
    'the code branches on `_tag` directly across the whole tree; rewriting to matchers risks behaviour',
  'effecttsgo/schema-class-missing-brand':
    'adding a brand type argument to every Schema class changes exported declarations',
  '@systemfsoftware/cell-architecture/ban-unknown':
    '`unknown` is the boundary type for wire records, decoded payloads and Tool parameters',
  'typescript/no-unnecessary-condition':
    'flags defensive checks that guard values crossing package and storage boundaries',
  '@systemfsoftware/cell-architecture/internal-export-jsdoc':
    'internal exports are documented where they are public; adding docs to every internal export is a docs change',
  'effecttsgo/schema-sync': 'synchronous Schema calls are deliberate in pure decoders',
  '@systemfsoftware/test-discipline/damp-test-naming':
    'existing test names predate the house naming rule; renaming 206 tests is a test rewrite',
  'typescript/no-non-null-assertion': 'assertions follow explicit length and presence checks',
  'effecttsgo/missing-pipeable-signature': 'the public API is data-first constructors, not pipeable exports',
  'typescript/no-misused-spread': 'spreads copy plain records typed as classes; changing them risks behaviour',
  'effecttsgo/global-json-in-effect':
    'JSON is parsed and written at record boundaries whose error behaviour is specified',
  '@systemfsoftware/cell-architecture/no-either-tag-assertions': 'tests assert Either and Exit tags directly',
  'typescript/no-unnecessary-type-assertion': 'assertions pin types that tsgo and tsc infer differently',
  '@systemfsoftware/effect-schema/no-manual-tag-member':
    'tagged members are declared by hand across the record schemas',
  'effecttsgo/strict-boolean-expressions': 'boolean-coercing conditions are intentional',
  'effecttsgo/schema-class-object-literal': 'object literals are checked against Schema classes in tests and fixtures',
  'typescript/no-unsafe-assignment': 'typed-row generics over SQL results are follow-up work',
  'effecttsgo/missed-pipeable-opportunity': 'style suggestion over existing call chains',
  '@systemfsoftware/test-discipline/tests-import-public-api': 'tests import internal modules to exercise them directly',
  'typescript/strict-boolean-expressions': 'boolean-coercing conditions are intentional',
  '@systemfsoftware/test-discipline/vitest-from-systemfsoftware-vitest':
    'this repository runs stock vitest and @effect/vitest',
  '@systemfsoftware/test-discipline/test-suffix-outside-src':
    'tests live in a test/ tree beside src/ and use the .test.ts suffix',
  '@systemfsoftware/test-discipline/test-file-outside-tests-dir': 'tests live in a test/ tree, not tests/',
  '@systemfsoftware/effect-schema/tagged-error-requires-message':
    'error messages are derived from tagged fields; adding message fields changes the wire shape',
  'typescript/no-unsafe-argument': 'typed-row generics over SQL results are follow-up work',
  'typescript/consistent-type-assertions': 'assertion style matches the codebase',
  'typescript/no-unsafe-member-access': 'typed-row generics over SQL results are follow-up work',
  '@systemfsoftware/effect-platform/no-native-map-in-effect':
    'native Map is used for in-process indexes inside the in-memory stores',
  'jsdoc/require-yields': 'generator doc comments describe the result, not each yield',
  '@systemfsoftware/effect-platform/no-native-set-in-effect':
    'native Set is used for in-process indexes inside the in-memory stores',
  '@systemfsoftware/effect-schema/schema-filter-constructive-generation':
    'filters are validators; adding generators changes arbitraries and tests',
  'typescript/no-unsafe-return': 'typed-row generics over SQL results are follow-up work',
  'vitest/valid-expect': 'Effect test helpers return assertions the rule cannot see',
  'typescript/switch-exhaustiveness-check': 'switches end in a deliberate default',
  '@systemfsoftware/test-discipline/tracing-test-requires-trace-suite':
    "span assertions are plain tests of the runtime's own spans",
  'vitest/no-standalone-expect': 'expectations run inside Effect test helpers',
  'effecttsgo/unnecessary-arrow-block': 'block bodies are kept for readability',
  '@systemfsoftware/cell-architecture/ban-classes':
    'Schema classes, tagged errors and Context services are declared as classes',
  '@systemfsoftware/effect-schema/schema-checked-element-named':
    'collection elements are anonymous checked schemas across the record schemas',
  'typescript/unbound-method': 'methods are passed as callbacks on values with no `this` dependency',
  'effecttsgo/provide-merge-all-to-array':
    'layer composition is spelled with mergeAll; changing it changes layer construction order',
  '@systemfsoftware/cell-architecture/ban-error-string':
    'failure text is stringified for diagnostics where the cause is already recorded separately',
  '@systemfsoftware/effect-schema/no-manual-tag-property': 'internal control-flow signals carry a manual _tag',
  '@systemfsoftware/effect-platform/no-logging-in-catch':
    'the catch sites log a recovered failure; moving the log changes when it is emitted',
  'typescript/no-unsafe-call': 'two untyped storage callbacks and one test double',
  'eslint/require-yield': 'two generator bodies return without yielding by design',
  'typescript/only-throw-error': 'internal control flow throws a signal value',
  'typescript/restrict-template-expressions': 'template expressions format ids and counters',
  'import/namespace': 'a type-only test file probes a missing export on purpose',
  'eslint/no-restricted-imports': 'node:sqlite is the runtime surface of the Node platform tests',
  'vitest/no-conditional-in-test': 'one time-guard conditional in a schedule test',
  'effecttsgo/flat-map-provide-service-to-provide-service-effect': 'the explicit flatMap keeps acquisition ordering',
  'effecttsgo/for-loop-push-to-for-each': 'the loop short-circuits and orders effects explicitly',
  'typescript/require-array-sort-compare': 'a test sorts strings with the default order',
  'effecttsgo/global-date-in-effect': 'Date is read where the stored column type is Date',
  'effecttsgo/global-date': 'Date is read where the stored column type is Date',
}

const config = recommended

// The preset spells one rule several ways: plugin rules as `@systemfsoftware/<plugin>/<rule>` or
// `@systemfsoftware/oxlint-plugin-<plugin>/<rule>`, core rules bare or `eslint/`-prefixed. Every spelling of a
// disabled rule is stripped from every level of the extends chain and set off at the top.
function spellings(key: string): ReadonlyArray<string> {
  const segments = key.split('/')
  if (key.startsWith('@systemfsoftware/')) {
    const plugin = segments[1]!
    const rule = segments.slice(2).join('/')
    const bare = plugin.replace(/^oxlint-plugin-/, '')
    return [`@systemfsoftware/${bare}/${rule}`, `@systemfsoftware/oxlint-plugin-${bare}/${rule}`]
  }
  return segments.length === 2 ? [key, segments[1]!] : [key]
}

const disabledKeys = new Set(Object.keys(disabledWithReasons).flatMap(spellings))

function stripDisabled(rules: unknown): void {
  if (!rules || typeof rules !== 'object') return
  const map = rules as Record<string, unknown>
  for (const key of Object.keys(map)) {
    if (disabledKeys.has(key)) delete map[key]
  }
}

function sanitize(node: unknown, seen: Set<object>): void {
  if (Array.isArray(node)) {
    for (const entry of node) sanitize(entry, seen)
    return
  }
  if (node === null || typeof node !== 'object') return
  if (seen.has(node)) return
  seen.add(node)
  const object = node as Record<string, unknown>
  if (Array.isArray(object.extends)) sanitize(object.extends, seen)
  stripDisabled(object.rules)
  if (Array.isArray(object.overrides)) {
    for (const override of object.overrides) {
      if (override && typeof override === 'object') stripDisabled(override.rules)
    }
  }
}

sanitize(config, new Set())

const offs: Record<string, 'off'> = {}
for (const key of disabledKeys) offs[key] = 'off'

export default defineConfig({
  extends: [config],
  rules: offs,
  ignorePatterns: ['.agents/**', '.claude/**', 'docs/**', '**/dist/**'],
})
