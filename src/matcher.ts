import type { GroupMatcher, ResolvedOptions } from './types'
import { COMMON_LARGE_LIBS, MEDIUM_LIB_GROUPS, VERY_LARGE_LIBS } from './presets'
import { hasDependencyMatch } from './deps'

// ============ 常量定义 ============

/**
 * 优先级常量：确保分组匹配的优先级顺序
 */
export const PRIORITIES = {
  CUSTOM: 100,      // 用户自定义分组
  DETECTED: 90,     // 插件检测到的框架
  LARGE_LIB: 80,    // 大型库
  MEDIUM_LIB: 70,   // 中型库
  ALL_DEPS: 50      // 所有依赖（aggressive 模式）
} as const

/**
 * 安全限制常量
 */
const MAX_PATH_LENGTH = 2000
const MAX_CACHE_SIZE = 100

// ============ 缓存系统 ============

/**
 * 缓存：存储编译后的正则表达式
 */
const patternCache = new Map<string, RegExp>()
const cacheKeys: string[] = []

/**
 * 统一的日志系统
 */
const logger = {
  warn: (msg: string) => console.warn(`[vite-plugin-ops] ${msg}`),
  error: (msg: string) => console.error(`[vite-plugin-ops] ERROR: ${msg}`),
  debug: (msg: string) => process.env.DEBUG && console.log(`[vite-plugin-ops] DEBUG: ${msg}`)
}

// ============ 工具函数 ============

/**
 * 路径标准化：统一使用正斜杠
 */
export function normalizeId(id: string): string {
  return id.replace(/\\/g, '/').replace(/%5C/g, '/')
}

/**
 * 检查并限制缓存大小（LRU 策略）
 */
function manageCache(): void {
  while (cacheKeys.length >= MAX_CACHE_SIZE) {
    const oldestKey = cacheKeys.shift()
    if (oldestKey) {
      patternCache.delete(oldestKey)
    }
  }
}

/**
 * 创建 node_modules 匹配函数
 * @param pkg 包名或正则表达式
 * @returns 匹配函数
 */
export function makeNodeModulesPattern(pkg: string | RegExp): (id: string) => boolean {
  if (pkg instanceof RegExp) {
    // ReDoS 防护：限制输入长度
    return (id: string) => {
      if (id.length > MAX_PATH_LENGTH) {
        logger.warn(`Path too long (${id.length} chars), skipping: ${id.slice(0, 50)}...`)
        return false
      }
      return pkg.test(id)
    }
  }

  // 检查缓存
  let re = patternCache.get(pkg)
  if (!re) {
    manageCache() // LRU 管理

    // Scoped packages like @vueuse
    const scoped = pkg.startsWith('@')
    // 转义特殊字符，包括 /
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    const base = scoped ? escaped : `(?:@[^/]+/)?${escaped}`
    
    // 优化：Windows 系统需要不区分大小写，其他系统可以区分大小写以提升性能
    const flags = process.platform === 'win32' ? 'i' : ''
    re = new RegExp(`/node_modules/(?:[.]pnpm/)?(?:${base})(?:/|@|$)`, flags)
    
    patternCache.set(pkg, re)
    cacheKeys.push(pkg)
  }

  // ReDoS 防护：限制输入长度
  return (id: string) => {
    if (id.length > MAX_PATH_LENGTH) {
      logger.warn(`Path too long (${id.length} chars), skipping: ${id.slice(0, 50)}...`)
      return false
    }
    return re!.test(id)
  }
}

/**
 * 构建分组匹配器
 * @param options 插件选项
 * @param projectDeps 项目依赖集合
 * @param pluginHints 插件检测提示
 * @returns 排序后的匹配器数组
 */
export function buildGroupMatchers(
  options: Pick<ResolvedOptions, 'groups' | 'strategy' | 'minSize'>,
  projectDeps: Set<string>,
  pluginHints: Set<string>
): GroupMatcher[] {
  const matchers: GroupMatcher[] = []
  const strategy = options.strategy

  // 性能优化：只转换一次
  const depsArray = Array.from(projectDeps)

  // Priority CUSTOM: Custom groups (用户自定义分组)
  if (options.groups) {
    for (const [name, patterns] of Object.entries(options.groups)) {
      if (patterns && patterns.length) {
        // 按长度排序（长的先匹配，更精确）
        const sorted = patterns.slice().sort((a, b) => {
          const la = typeof a === 'string' ? a.length : 0
          const lb = typeof b === 'string' ? b.length : 0
          return lb - la
        })
        const testers = sorted.map(makeNodeModulesPattern)
        matchers.push({
          name,
          test: (id) => testers.some((t) => t(id)),
          priority: PRIORITIES.CUSTOM
        })
      }
    }
  }

  // Priority DETECTED: Plugin-detected groups (插件检测到的框架)
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
      priority: PRIORITIES.DETECTED
    })
  }

  // Strategy-based splitting (基于策略的分组)
  if (strategy === 'aggressive') {
    // Priority ALL_DEPS: Split all dependencies individually
    for (const dep of depsArray) {
      if (!dep.startsWith('@types/')) {
        matchers.push({
          name: dep,
          test: makeNodeModulesPattern(dep),
          priority: PRIORITIES.ALL_DEPS
        })
      }
    }
  } else if (strategy === 'balanced') {
    // Priority LARGE_LIB: Split common large libraries
    for (const [groupName, patterns] of Object.entries(COMMON_LARGE_LIBS)) {
      if (hasDependencyMatch(patterns, depsArray)) {
        const testers = patterns.map(makeNodeModulesPattern)
        matchers.push({
          name: groupName,
          test: (id) => testers.some((t) => t(id)),
          priority: PRIORITIES.LARGE_LIB
        })
      }
    }

    // Priority MEDIUM_LIB: Group medium libraries together
    for (const [groupName, patterns] of Object.entries(MEDIUM_LIB_GROUPS)) {
      if (hasDependencyMatch(patterns, depsArray)) {
        const testers = patterns.map(makeNodeModulesPattern)
        matchers.push({
          name: groupName,
          test: (id) => testers.some((t) => t(id)),
          priority: PRIORITIES.MEDIUM_LIB
        })
      }
    }
  } else if (strategy === 'conservative') {
    // Priority LARGE_LIB: Only split very large libraries
    for (const [groupName, patterns] of Object.entries(COMMON_LARGE_LIBS)) {
      if (VERY_LARGE_LIBS.includes(groupName as typeof VERY_LARGE_LIBS[number])) {
        if (hasDependencyMatch(patterns, depsArray)) {
          const testers = patterns.map(makeNodeModulesPattern)
          matchers.push({
            name: groupName,
            test: (id) => testers.some((t) => t(id)),
            priority: PRIORITIES.LARGE_LIB
          })
        }
      }
    }
  }

  // Sort by priority (descending)
  return matchers.sort((a, b) => b.priority - a.priority)
}

/**
 * 清除缓存（用于测试）
 */
export function clearCache(): void {
  patternCache.clear()
  cacheKeys.length = 0
}

// 导出日志系统供其他模块使用
export { logger }
