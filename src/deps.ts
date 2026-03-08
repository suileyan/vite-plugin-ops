import fs from 'node:fs'
import path from 'node:path'

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
    const content = fs.readFileSync(pkgPath, 'utf8')
    const json: unknown = JSON.parse(content)

    if (!isValidPackageJson(json)) {
      console.warn('[vite-plugin-ops] Invalid package.json format: dependencies field is malformed')
      return new Set<string>()
    }

    return new Set(Object.keys(json.dependencies || {}))
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn('[vite-plugin-ops] Failed to parse package.json: Invalid JSON format')
    } else if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[vite-plugin-ops] package.json not found in:', cwd)
    } else if (process.env.DEBUG) {
      console.warn('[vite-plugin-ops] Failed to read package.json:', error)
    }
    return new Set<string>()
  }
}

/**
 * 检查模式列表是否匹配项目依赖
 * @param patterns 匹配模式列表
 * @param depsArray 依赖数组（避免重复转换）
 */
export function hasDependencyMatch(patterns: string[], depsArray: string[]): boolean {
  return patterns.some(p => {
    const pkgName = p.replace(/\//g, '')
    return depsArray.some(dep => dep.includes(pkgName))
  })
}
