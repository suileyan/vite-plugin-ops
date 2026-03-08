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

export type ResolvedOptions = Required<Pick<OPSOptions, 'override' | 'strategy' | 'minSize'>> & {
  groups?: OPSOptions['groups']
}

export type GroupMatcher = {
  name: string
  test: (id: string) => boolean
  priority: number
}

// Extract types from Vite's UserConfig
type OutputOptions =
  NonNullable<NonNullable<UserConfig['build']>['rollupOptions']>['output'] extends infer O
  ? O extends any[]
  ? O[number]
  : O
  : never

export type ManualChunksOption = NonNullable<OutputOptions>['manualChunks']
export type AssetFileNamesOption = NonNullable<OutputOptions>['assetFileNames']

// 导出 Plugin 类型供用户使用
export type { Plugin as OPSPlugin }
