import type { GroupMatcher, ResolvedOptions } from './types'
import { COMMON_LARGE_LIBS, MEDIUM_LIB_GROUPS, VERY_LARGE_LIBS } from './presets'
import { hasDependencyMatch } from './deps'

// 安全限制常量
const MAX_PATH_LENGTH = 2000
const MAX_CACHE_SIZE = 100

// 缓存：存储编译后的正则表达式
const patternCache = new Map<string, RegExp>()
// LRU 缓存键顺序
const cacheKeys: string[] = []

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
        console.warn(`[vite-plugin-ops] Path too long (${id.length} chars), skipping: ${id.slice(0, 50)}...`)
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
    re = new RegExp(`/node_modules/(?:[.]pnpm/)?(?:${base})(?:/|@|$)`, 'i')
    
    patternCache.set(pkg, re)
    cacheKeys.push(pkg)
  }

  // ReDoS 防护：限制输入长度
  return (id: string) => {
    if (id.length > MAX_PATH_LENGTH) {
      console.warn(`[vite-plugin-ops] Path too long (${id.length} chars), skipping: ${id.slice(0, 50)}...`)
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

  // Priority 100: Custom groups (用户自定义分组)
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
          priority: 100
        })
      }
    }
  }

  // Priority 90: Plugin-detected groups (插件检测到的框架)
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

  // Strategy-based splitting (基于策略的分组)
  if (strategy === 'aggressive') {
    // Priority 50: Split all dependencies individually
    for (const dep of depsArray) {
      if (!dep.startsWith('@types/')) {
        matchers.push({
          name: dep,
          test: makeNodeModulesPattern(dep),
          priority: 50
        })
      }
    }
  } else if (strategy === 'balanced') {
    // Priority 80: Split common large libraries
    for (const [groupName, patterns] of Object.entries(COMMON_LARGE_LIBS)) {
      if (hasDependencyMatch(patterns, depsArray)) {
        const testers = patterns.map(makeNodeModulesPattern)
        matchers.push({
          name: groupName,
          test: (id) => testers.some((t) => t(id)),
          priority: 80
        })
      }
    }

    // Priority 70: Group medium libraries together
    for (const [groupName, patterns] of Object.entries(MEDIUM_LIB_GROUPS)) {
      if (hasDependencyMatch(patterns, depsArray)) {
        const testers = patterns.map(makeNodeModulesPattern)
        matchers.push({
          name: groupName,
          test: (id) => testers.some((t) => t(id)),
          priority: 70
        })
      }
    }
  } else if (strategy === 'conservative') {
    // Priority 80: Only split very large libraries
    for (const [groupName, patterns] of Object.entries(COMMON_LARGE_LIBS)) {
      if (VERY_LARGE_LIBS.includes(groupName as typeof VERY_LARGE_LIBS[number])) {
        if (hasDependencyMatch(patterns, depsArray)) {
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

/**
 * 清除缓存（用于测试）
 */
export function clearCache(): void {
  patternCache.clear()
  cacheKeys.length = 0
}
