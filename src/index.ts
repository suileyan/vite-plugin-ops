import type { Plugin, UserConfig } from 'vite'
import type { OPSOptions, ResolvedOptions, ManualChunksOption, AssetFileNamesOption, GroupMatcher } from './types'
import { readProjectDependencies } from './deps'
import { normalizeId, buildGroupMatchers, logger } from './matcher'

export type { OPSPlugin, OPSOptions, SplitStrategy, ResolvedOptions, GroupMatcher } from './types'

// Extract types from Vite's UserConfig
type OutputOptions =
  NonNullable<NonNullable<UserConfig['build']>['rollupOptions']>['output'] extends infer O
  ? O extends any[]
  ? O[number]
  : O
  : never

/**
 * OPS - Optimized Packaging Strategy
 * 一个智能的 Vite 分包优化插件
 */
export default function OPS(opts: OPSOptions = {}): Plugin {
  const options: ResolvedOptions = {
    override: opts.override ?? false,
    strategy: opts.strategy ?? 'balanced',
    minSize: opts.minSize ?? 50,
    ...(opts.groups ? { groups: opts.groups } : {}),
  }

  let groupsRef: GroupMatcher[] = []

  const manualChunks: ManualChunksOption = (id: string): string | undefined => {
    try {
      const nid = normalizeId(id)
      if (!/\/node_modules\//.test(nid)) return undefined

      // Check matchers in priority order
      for (const g of groupsRef) {
        if (g.test(nid)) return g.name
      }

      return 'vendor'
    } catch (error) {
      logger.warn(`Error in manualChunks for ${id}: ${error}`)
      return 'vendor'
    }
  }

  const assetFileNamesFn: AssetFileNamesOption = (assetInfo) => {
    try {
      const name = assetInfo.name ?? ''
      const ext = name.split('.').pop()?.toLowerCase()
      
      if (ext === 'css') return 'css/[name]-[hash][extname]'
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'].includes(ext ?? ''))
        return 'img/[name]-[hash][extname]'
      if (['woff', 'woff2', 'eot', 'ttf', 'otf'].includes(ext ?? ''))
        return 'fonts/[name]-[hash][extname]'
      
      return 'assets/[name]-[hash][extname]'
    } catch (error) {
      logger.warn(`Error in assetFileNames: ${error}`)
      return 'assets/[name]-[hash][extname]'
    }
  }

  return {
    name: 'vite-plugin-ops',
    enforce: 'post',
    config(userConfig, _env) {
      const existingOutput = userConfig.build?.rollupOptions?.output
      const outputIsArray = Array.isArray(existingOutput)
      const shouldMerge = !options.override && existingOutput && !outputIsArray

      const injected = {
        entryFileNames: 'js/[name]-[hash].js' as const,
        chunkFileNames: 'js/[name]-[hash].js' as const,
        assetFileNames: assetFileNamesFn,
        manualChunks,
      }

      let output: typeof injected
      
      if (shouldMerge && existingOutput) {
        // 安全合并：只填充用户未提供的字段
        const existing = existingOutput as OutputOptions
        output = {
          entryFileNames: existing?.entryFileNames as typeof injected.entryFileNames ?? injected.entryFileNames,
          chunkFileNames: existing?.chunkFileNames as typeof injected.chunkFileNames ?? injected.chunkFileNames,
          assetFileNames: existing?.assetFileNames as typeof injected.assetFileNames ?? injected.assetFileNames,
          manualChunks: existing?.manualChunks as typeof injected.manualChunks ?? injected.manualChunks,
        }
      } else {
        output = injected
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

      // Log chunking strategy in build mode
      if (resolved.command === 'build') {
        const strategyDesc: Record<string, string> = {
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
