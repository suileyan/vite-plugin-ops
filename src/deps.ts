import fs from 'node:fs'
import path from 'node:path'
import { logger } from './matcher'

/**
 * 安全限制常量
 */
const MAX_PACKAGE_JSON_SIZE = 1024 * 1024 // 1MB

/**
 * 运行时类型验证：检查 package.json 格式是否有效
 */
function isValidPackageJson(obj: unknown): obj is { dependencies?: Record<string, string> } {
  if (typeof obj !== 'object' || obj === null) return false
  const json = obj as Record<string, unknown>
  if (json.dependencies !== undefined) {
    if (typeof json.dependencies !== 'object' || json.dependencies === null) return false
    for (const val of Object.values(json.dependencies)) {
      if (typeof val !== 'string') return false
    }
  }
  return true
}

/**
 * 读取项目依赖列表
 * @param cwd 项目根目录
 * @returns 依赖名称集合
 */
export function readProjectDependencies(cwd: string): Set<string> {
  try {
    const pkgPath = path.join(cwd, 'package.json')
    
    // 安全检查：限制文件大小，防止内存溢出攻击
    const stats = fs.statSync(pkgPath)
    if (stats.size > MAX_PACKAGE_JSON_SIZE) {
      logger.warn(`package.json too large (${stats.size} bytes), skipping`)
      return new Set<string>()
    }
    
    const content = fs.readFileSync(pkgPath, 'utf8')
    const json: unknown = JSON.parse(content)

    if (!isValidPackageJson(json)) {
      logger.warn('Invalid package.json format: dependencies field is malformed')
      return new Set<string>()
    }

    return new Set(Object.keys(json.dependencies || {}))
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.warn('Failed to parse package.json: Invalid JSON format')
    } else if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.warn(`package.json not found in: ${cwd}`)
    } else if (process.env.DEBUG) {
      logger.debug(`Failed to read package.json: ${error}`)
    }
    return new Set<string>()
  }
}

/**
 * 检查模式列表是否匹配项目依赖
 * 改进的匹配逻辑：避免误匹配（如 vue 匹配到 vuex）
 * @param patterns 匹配模式列表
 * @param depsArray 依赖数组
 */
export function hasDependencyMatch(patterns: string[], depsArray: string[]): boolean {
  const depsSet = new Set(depsArray)
  
  return patterns.some(pattern => {
    // 对于带作用域的包（如 @vueuse/），使用前缀匹配
    if (pattern.includes('/')) {
      return depsArray.some(dep => dep.startsWith(pattern))
    }
    
    // 对于普通包名，使用精确匹配或前缀匹配
    // 例如：'vue' 匹配 'vue' 或 '@vue/compiler-core'
    return depsSet.has(pattern) || depsArray.some(dep => {
      // 精确匹配
      if (dep === pattern) return true
      // 作用域包匹配：vue -> @vue/xxx
      if (dep.startsWith(`@${pattern}/`)) return true
      return false
    })
  })
}
