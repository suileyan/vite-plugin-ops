import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, UserConfig } from 'vite'

export type SplitStrategy = 'aggressive' | 'balanced' | 'conservative'

export type OPSOptions = {
  /**
   * If true, overwrite existing `build.rollupOptions.output.*` fields.
   * If false, only fill in fields that are not already provided by the user.
   * Default: false
   */
  override?: boolean
  /**
   * Chunking strategy:
   * - 'aggressive': Split almost all dependencies into separate chunks
   * - 'balanced': Split large dependencies and common frameworks (default)
   * - 'conservative': Minimal splitting, only very large dependencies
   * Default: 'balanced'
   */
  strategy?: SplitStrategy
  /**
   * Minimum size (in KB) for a dependency to be split into its own chunk.
   * Only applies when strategy is 'balanced' or 'conservative'.
   * Default: 50
   */
  minSize?: number
  /**
   * Additional custom chunk groups. Keys are chunk names; values are string or RegExp
   * matchers to detect a module path in node_modules. Example:
   * { three: ['three'], lodash: [/node_modules\\/lodash(?!-)/] }
   */
  groups?: Record<string, (string | RegExp)[]>
}

type GroupMatcher = { name: string; test: (id: string) => boolean; priority: number }

// Common large libraries that should typically be split
const COMMON_LARGE_LIBS = {
  // UI Frameworks
  react: ['react', 'react-dom'],
  vue: ['vue', '@vue/'],
  angular: ['@angular/'],
  svelte: ['svelte'],

  // State Management
  redux: ['redux', 'react-redux', '@reduxjs/toolkit'],
  mobx: ['mobx', 'mobx-react'],
  zustand: ['zustand'],
  pinia: ['pinia'],

  // Routing
  'react-router': ['react-router', 'react-router-dom'],
  'vue-router': ['vue-router'],

  // UI Libraries
  antd: ['antd', '@ant-design/'],
  'element-plus': ['element-plus'],
  'element-ui': ['element-ui'],
  'naive-ui': ['naive-ui'],
  'arco-design': ['@arco-design/'],
  'material-ui': ['@mui/', '@material-ui/'],
  chakra: ['@chakra-ui/'],

  // Utility Libraries
  lodash: ['lodash', 'lodash-es'],
  moment: ['moment'],
  dayjs: ['dayjs'],
  axios: ['axios'],

  // Rich Text / Charts
  echarts: ['echarts'],
  'd3': ['d3'],
  'chart.js': ['chart.js'],
  quill: ['quill'],

  // 3D / Game
  three: ['three'],
  babylon: ['@babylonjs/'],
}

// Medium-sized libraries that should be grouped together
const MEDIUM_LIB_GROUPS = {
  'utils': ['@vueuse/', 'ahooks', 'react-use'],
  'icons': ['@iconify/', '@ant-design/icons', '@heroicons/', 'lucide-react'],
  'form': ['react-hook-form', 'formik', 'async-validator'],
  'i18n': ['i18next', 'react-i18next', 'vue-i18n'],
}

type ResolvedOptions = {
  override: boolean
  strategy: SplitStrategy
  minSize: number
  groups?: Record<string, (string | RegExp)[]>
}

function normalizeId(id: string): string {
  return id.replace(/\\/g, '/').replace(/%5C/g, '/')
}

function makeNodeModulesPattern(pkg: string | RegExp): (id: string) => boolean {
  if (pkg instanceof RegExp) {
    return (id: string) => pkg.test(id)
  }
  // Scoped packages like @vueuse
  const scoped = pkg.startsWith('@')
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const base = scoped ? escaped : `(?:@[^/]+/)?${escaped}`
  const re = new RegExp(`/node_modules/(?:[.]pnpm/)?(?:${base})(?:/|@|$)`, 'i')
  return (id: string) => re.test(id)
}

function readProjectDependencies(cwd: string): Set<string> {
  try {
    const pkgPath = path.join(cwd, 'package.json')
    const json = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    return new Set(Object.keys(json.dependencies || {}))
  } catch {
    return new Set<string>()
  }
}

function buildGroupMatchers(
  options: Pick<OPSOptions, 'groups' | 'strategy' | 'minSize'>,
  projectDeps: Set<string>,
  pluginHints: Set<string>
): GroupMatcher[] {
  const matchers: GroupMatcher[] = []
  const strategy = options.strategy || 'balanced'

  // Priority: higher number = checked first
  // Custom groups (priority 100)
  if (options.groups) {
    for (const [name, patterns] of Object.entries(options.groups)) {
      if (patterns && patterns.length) {
        const sorted = patterns.slice().sort((a, b) => {
          const la = typeof a === 'string' ? a.length : 0
          const lb = typeof b === 'string' ? b.length : 0
          return lb - la
        })
        const testers = sorted.map(makeNodeModulesPattern)
        matchers.push({
          name,
          test: (id) => testers.some((t) => t(id)),
          priority: 100
        })
      }
    }
  }

  // Plugin-detected groups (priority 90)
  const detectedGroups: Record<string, string[]> = {}
  if (pluginHints.has('vue')) {
    detectedGroups['vue'] = ['vue', '@vue/']
  }
  if (pluginHints.has('vueuse')) {
    detectedGroups['vueuse'] = ['@vueuse/']
  }

  for (const [name, patterns] of Object.entries(detectedGroups)) {
    const testers = patterns.map(makeNodeModulesPattern)
    matchers.push({
      name,
      test: (id) => testers.some((t) => t(id)),
      priority: 90
    })
  }

  // Strategy-based splitting
  if (strategy === 'aggressive') {
    // Split all dependencies individually (priority 50)
    for (const dep of projectDeps) {
      if (!dep.startsWith('@types/')) {
        matchers.push({
          name: dep,
          test: makeNodeModulesPattern(dep),
          priority: 50
        })
      }
    }
  } else if (strategy === 'balanced') {
    // Split common large libraries (priority 80)
    for (const [groupName, patterns] of Object.entries(COMMON_LARGE_LIBS)) {
      const hasAny = patterns.some(p => {
        const pkgName = p.replace(/\//g, '')
        return Array.from(projectDeps).some(dep => dep.includes(pkgName))
      })
      if (hasAny) {
        const testers = patterns.map(makeNodeModulesPattern)
        matchers.push({
          name: groupName,
          test: (id) => testers.some((t) => t(id)),
          priority: 80
        })
      }
    }

    // Group medium libraries together (priority 70)
    for (const [groupName, patterns] of Object.entries(MEDIUM_LIB_GROUPS)) {
      const hasAny = patterns.some(p => {
        return Array.from(projectDeps).some(dep =>
          dep.includes(p.replace(/\//g, '').replace(/\*/g, ''))
        )
      })
      if (hasAny) {
        const testers = patterns.map(makeNodeModulesPattern)
        matchers.push({
          name: groupName,
          test: (id) => testers.some((t) => t(id)),
          priority: 70
        })
      }
    }
  } else if (strategy === 'conservative') {
    // Only split very large libraries (priority 80)
    const veryLargeLibs = ['react', 'vue', 'angular', 'antd', 'element-plus', 'echarts', 'three']
    for (const [groupName, patterns] of Object.entries(COMMON_LARGE_LIBS)) {
      if (veryLargeLibs.includes(groupName)) {
        const hasAny = patterns.some(p => {
          const pkgName = p.replace(/\//g, '')
          return Array.from(projectDeps).some(dep => dep.includes(pkgName))
        })
        if (hasAny) {
          const testers = patterns.map(makeNodeModulesPattern)
          matchers.push({
            name: groupName,
            test: (id) => testers.some((t) => t(id)),
            priority: 80
          })
        }
      }
    }
  }

  // Sort by priority (descending)
  return matchers.sort((a, b) => b.priority - a.priority)
}

// Extract types from Vite's UserConfig
type OutputOptions =
  NonNullable<NonNullable<UserConfig['build']>['rollupOptions']>['output'] extends infer O
  ? O extends any[]
  ? O[number]
  : O
  : never

type ManualChunksOption = NonNullable<OutputOptions>['manualChunks']
type AssetFileNamesOption = NonNullable<OutputOptions>['assetFileNames']

export default function OPS(opts: OPSOptions = {}): Plugin {
  const options: ResolvedOptions = {
    override: opts.override ?? false,
    strategy: opts.strategy ?? 'balanced',
    minSize: opts.minSize ?? 50,
    ...(opts.groups ? { groups: opts.groups } : {}),
  }

  let groupsRef: GroupMatcher[] = []

  const manualChunks: ManualChunksOption = (id: string): string | undefined => {
    const nid = normalizeId(id)
    if (!/\/node_modules\//.test(nid)) return undefined

    // Check matchers in priority order
    for (const g of groupsRef) {
      if (g.test(nid)) return g.name
    }

    return 'vendor'
  }

  const assetFileNamesFn: AssetFileNamesOption = (assetInfo) => {
    const name = assetInfo.name ?? ''
    const ext = name.split('.').pop()?.toLowerCase()
    if (ext === 'css') return 'css/[name]-[hash][extname]'
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'].includes(ext ?? ''))
      return 'img/[name]-[hash][extname]'
    if (['woff', 'woff2', 'eot', 'ttf', 'otf'].includes(ext ?? ''))
      return 'fonts/[name]-[hash][extname]'
    return 'assets/[name]-[hash][extname]'
  }

  return {
    name: 'vite-plugin-ops',
    enforce: 'post',
    config(userConfig, _env) {
      const existingOutput = userConfig.build?.rollupOptions?.output
      const outputIsArray = Array.isArray(existingOutput)
      const shouldMerge = !options.override && existingOutput && !outputIsArray

      const injected = {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: assetFileNamesFn,
        manualChunks,
      } as const

      let output: OutputOptions
      if (shouldMerge) {
        const base = existingOutput as Record<string, any>
        const merged: Record<string, any> = { ...base }
        if (!('entryFileNames' in merged)) merged['entryFileNames'] = injected.entryFileNames
        if (!('chunkFileNames' in merged)) merged['chunkFileNames'] = injected.chunkFileNames
        if (!('assetFileNames' in merged)) merged['assetFileNames'] = injected.assetFileNames
        if (!('manualChunks' in merged)) merged['manualChunks'] = injected.manualChunks
        output = merged as OutputOptions
      } else {
        output = injected as OutputOptions
      }

      return {
        build: {
          rollupOptions: {
            output,
          },
        },
      }
    },
    configResolved(resolved) {
      const cwd = resolved.root || process.cwd()
      const projectDeps = readProjectDependencies(cwd)

      // Detect framework from plugins
      const pluginNames = new Set(resolved.plugins.map((p) => p.name))
      const hints = new Set<string>()
      if (pluginNames.has('vite:vue') || pluginNames.has('vite:vue-jsx')) {
        hints.add('vue')
      }
      if (pluginNames.has('unplugin-vue-components')) {
        hints.add('vueuse')
      }

      groupsRef = buildGroupMatchers(options, projectDeps, hints)

      // Log chunking strategy in dev mode
      if (resolved.command === 'build') {
        const strategyDesc = {
          aggressive: 'Aggressive (split most dependencies)',
          balanced: 'Balanced (split large libraries)',
          conservative: 'Conservative (minimal splitting)'
        }
        console.log(`\n📦 OPS Chunking Strategy: ${strategyDesc[options.strategy]}`)
        console.log(`📊 Detected ${groupsRef.length} chunk groups`)
      }
    },
  }
}
