# vite-plugin-ops

**O**ptimized **P**ackaging **S**trategy - 一个智能的 Vite 分包优化插件

[![npm version](https://img.shields.io/npm/v/vite-plugin-ops.svg)](https://www.npmjs.com/package/vite-plugin-ops)
[![License](https://img.shields.io/npm/l/vite-plugin-ops.svg)](https://github.com/suileyan/vite-plugin-ops/blob/main/LICENSE)

## 特性

- **智能分包策略** - 三种预设策略适配不同场景
- **自动识别依赖** - 无需手动配置，自动读取 package.json
- **框架预设** - 内置主流框架和库的最佳分包方案
- **高度可配置** - 支持自定义分包规则
- **优先级系统** - 灵活的匹配优先级机制
- **资源分类** - 自动将 CSS、图片、字体分类存放
- **零配置可用** - 开箱即用，合理的默认配置

## 安装

```bash
npm install vite-plugin-ops -D
# 或
pnpm add vite-plugin-ops -D
# 或
yarn add vite-plugin-ops -D
```

## 快速开始

### 基础使用

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import OPS from 'vite-plugin-ops'

export default defineConfig({
  plugins: [
    vue(),
    OPS() // 使用默认配置
  ]
})
```

插件会自动：
- 将 node_modules 中的依赖智能分包
- 将 CSS 文件放入 `css/` 目录
- 将图片放入 `img/` 目录
- 将字体放入 `fonts/` 目录
- 将其他资源放入 `assets/` 目录

## 分包策略

插件提供三种分包策略，适用于不同场景：

### 1. Balanced（平衡 - 默认推荐）

适合大多数生产环境，平衡构建速度和加载性能。

```typescript
OPS({
  strategy: 'balanced' // 默认值，可省略
})
```

**特点：**
- 大型库独立分包（React、Vue、Antd、Echarts 等）
- 中型库按类型分组（工具库、图标库、表单库等）
- 小型库合并到 vendor
- 典型输出：5-15 个 chunk

**适用场景：** 生产环境、中大型项目

### 2. Aggressive（激进）

每个依赖都独立分包，适合开发调试。

```typescript
OPS({
  strategy: 'aggressive'
})
```

**特点：**
- 每个依赖独立成一个 chunk
- 便于查看单个依赖的体积
- 可能产生大量小文件
- 典型输出：20-50+ 个 chunk

**适用场景：** 开发环境、依赖分析

### 3. Conservative（保守）

最小化分包，减少 HTTP 请求。

```typescript
OPS({
  strategy: 'conservative'
})
```

**特点：**
- 只分离超大型库（React、Vue、Antd、Echarts 等）
- 其他库合并到 vendor
- 减少 HTTP 请求数量
- 典型输出：3-8 个 chunk

**适用场景：** 小型项目、HTTP/1.x 环境

## 配置选项

### 完整配置示例

```typescript
OPS({
  // 分包策略
  strategy: 'balanced', // 'aggressive' | 'balanced' | 'conservative'
  
  // 是否覆盖用户已有的 rollupOptions.output 配置
  override: false,
  
  // 最小分包大小（KB），仅在 balanced 和 conservative 策略下生效
  minSize: 50,
  
  // 自定义分组规则
  groups: {
    // 将 lodash 相关库独立分包
    'lodash': ['lodash', 'lodash-es'],
    
    // 使用正则匹配
    'my-ui': [/my-ui-library/],
    
    // 将多个相关库分到一组
    'charts': ['echarts', 'chart.js', 'd3']
  }
})
```

### 配置项说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `strategy` | `'aggressive' \| 'balanced' \| 'conservative'` | `'balanced'` | 分包策略 |
| `override` | `boolean` | `false` | 是否覆盖已有配置 |
| `minSize` | `number` | `50` | 最小分包大小（KB） |
| `groups` | `Record<string, (string \| RegExp)[]>` | - | 自定义分组规则 |

## 内置预设

插件内置了主流框架和库的分包预设：

### UI 框架
- **React**: react, react-dom
- **Vue**: vue, @vue/*
- **Angular**: @angular/*
- **Svelte**: svelte

### UI 组件库
- **Ant Design**: antd, @ant-design/*
- **Element Plus**: element-plus
- **Element UI**: element-ui
- **Naive UI**: naive-ui
- **Arco Design**: @arco-design/*
- **Material-UI**: @mui/*, @material-ui/*
- **Chakra UI**: @chakra-ui/*

### 工具库
- **Lodash**: lodash, lodash-es
- **Axios**: axios
- **Moment**: moment
- **Day.js**: dayjs

### 可视化库
- **Echarts**: echarts
- **D3**: d3
- **Chart.js**: chart.js

### 3D/游戏引擎
- **Three.js**: three
- **Babylon.js**: @babylonjs/*

### 其他分组
- **工具组**: @vueuse/*, ahooks, react-use
- **图标组**: @iconify/*, @ant-design/icons, lucide-react
- **表单组**: react-hook-form, formik, async-validator
- **国际化**: i18next, react-i18next, vue-i18n

## 输出结构

构建后的文件结构：

```
dist/
├── js/
│   ├── index-[hash].js          # 入口文件
│   ├── vendor-[hash].js         # 通用依赖
│   ├── vue-[hash].js            # Vue 相关
│   ├── antd-[hash].js           # Ant Design
│   └── echarts-[hash].js        # Echarts
├── css/
│   └── index-[hash].css         # 样式文件
├── img/
│   └── logo-[hash].png          # 图片资源
├── fonts/
│   └── roboto-[hash].woff2      # 字体文件
└── assets/
    └── data-[hash].json         # 其他资源
```

## 使用场景

### 场景 1: React + Ant Design 项目

```typescript
import OPS from 'vite-plugin-ops'

export default {
  plugins: [
    react(),
    OPS({
      strategy: 'balanced',
      groups: {
        // 将 Ant Design 图标单独分包
        'antd-icons': ['@ant-design/icons']
      }
    })
  ]
}
```

### 场景 2: Vue 3 + Element Plus 项目

```typescript
import OPS from 'vite-plugin-ops'

export default {
  plugins: [
    vue(),
    OPS({
      strategy: 'balanced'
      // 插件会自动检测 Vue 并创建 vue 分组
    })
  ]
}
```

### 场景 3: 数据可视化项目

```typescript
import OPS from 'vite-plugin-ops'

export default {
  plugins: [
    OPS({
      strategy: 'balanced',
      groups: {
        // 将所有图表库分到一组
        'charts': ['echarts', 'd3', 'chart.js', '@antv/g2']
      }
    })
  ]
}
```

### 场景 4: 多页面应用

```typescript
import OPS from 'vite-plugin-ops'

export default {
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html'
      }
    }
  },
  plugins: [
    OPS({
      strategy: 'conservative', // 减少公共依赖重复
      override: false // 不覆盖多入口配置
    })
  ]
}
```

## 高级用法

### 自定义分组优先级

插件使用优先级系统来处理分组匹配：

1. **优先级 100**: 自定义 `groups` 配置
2. **优先级 90**: 插件自动检测（如 Vue）
3. **优先级 80**: 大型库预设
4. **优先级 70**: 中型库分组
5. **优先级 50**: aggressive 策略的单独依赖
6. **默认**: vendor 组

### 与现有配置合并

```typescript
export default {
  build: {
    rollupOptions: {
      output: {
        // 你的自定义配置
        entryFileNames: 'my-entry-[hash].js'
      }
    }
  },
  plugins: [
    OPS({
      override: false // 保留你的 entryFileNames 配置
    })
  ]
}
```

### 正则表达式匹配

```typescript
OPS({
  groups: {
    // 匹配所有 @babel 开头的包
    'babel': [/\/@babel\//],
    
    // 匹配 lodash 但不包括 lodash-es
    'lodash': [/\/lodash(?!-es)/],
    
    // 组合字符串和正则
    'ui-libs': ['antd', /element-/]
  }
})
```

## 最佳实践

### 1. 开发环境使用 aggressive

```typescript
export default defineConfig(({ mode }) => ({
  plugins: [
    OPS({
      strategy: mode === 'development' ? 'aggressive' : 'balanced'
    })
  ]
}))
```

### 2. 分析构建产物

使用 `rollup-plugin-visualizer` 查看分包效果：

```typescript
import { visualizer } from 'rollup-plugin-visualizer'
import OPS from 'vite-plugin-ops'

export default {
  plugins: [
    OPS({ strategy: 'balanced' }),
    visualizer({ open: true })
  ]
}
```

### 3. 监控构建信息

插件会在构建时输出分包信息：

```bash
📦 OPS Chunking Strategy: Balanced (split large libraries)
📊 Detected 12 chunk groups
```

### 4. 针对性能优化

根据实际加载性能调整策略：

- **首屏加载慢** → 使用 `conservative` 减少请求数
- **大依赖更新频繁** → 使用 `balanced` 独立缓存
- **需要精细控制** → 使用 `aggressive` + 自定义 `groups`

## 注意事项

1. **仅适用于 Vite 项目** - 此插件基于 Vite 插件系统
2. **不支持 Webpack** - 需要 Webpack 版本请使用其他工具
3. **Type 类型包** - 自动忽略 `@types/*` 包
4. **Monorepo** - 确保在正确的 package.json 位置读取依赖

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可

MIT License

## 相关链接

- [Vite 官方文档](https://vitejs.dev/)
- [Rollup 文档](https://rollupjs.org/)
- [问题反馈](https://github.com/yourusername/vite-plugin-ops/issues)

---

Made with by suileyan
