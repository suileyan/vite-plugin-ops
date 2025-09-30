# vite-plugin-ops

Vite 插件：规范打包产物命名，并按第三方依赖进行分包（支持自定义与自动回退）。

## 安装

```bash
npm i -D vite-plugin-ops
# 或 pnpm add -D vite-plugin-ops
# 或 yarn add -D vite-plugin-ops
```

## 使用

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import OPS from 'vite-plugin-ops'

export default defineConfig({
  plugins: [
    OPS({
      // 是否覆盖现有的 rollup output 配置（对象形态）
      override: false,
      // 自定义分组（可选）：字符串或正则匹配 node_modules 路径
      // groups: {
      //   lodash: ['lodash'],
      //   react: ['react', 'react-dom'],
      //   lodashCore: [/node_modules\/(?:\.pnpm\/)?lodash(?=\/|@|$)/],
      // },
    }),
  ],
})
```

## 行为说明

- 输出命名规范（注入到 rollupOptions.output）：
  - `entryFileNames: js/[name]-[hash].js`
  - `chunkFileNames: js/[name]-[hash].js`
  - `assetFileNames`: 按类型放入 `css/`、`img/`、`fonts/`、`assets/`
- 分包策略：
  - 若提供 `groups`，按自定义规则将 `node_modules` 模块归入对应分组；
  - 若未提供或传入空分组，自动读取 `package.json` 中 `dependencies`，对所有不以 `@` 开头的依赖生成同名分组；
  - 未匹配到的第三方依赖统一归入 `vendor`；
  - 会结合解析到的 Vite 插件名做轻量提示（例如存在 `vite:vue`/`vite:vue-jsx` 时提示 `vue`，存在 `unplugin-vue-components` 时提示 `@vueuse`）。
- 合并策略：
  - 当 `override=false` 且用户已有 `build.rollupOptions.output`（对象形态）时，仅为缺失项赋默认值；
  - 若 `output` 为数组形态，则不做合并，直接提供插件的对象形态默认值。
- 路径处理：
  - 仅对 `node_modules` 路径进行分组判断；同时对 Windows 路径分隔符做了标准化处理。

## 配置

```ts
export type OPSOptions = {
  // 是否强制覆盖现有 output.* 配置，默认 false
  override?: boolean
  // 自定义分组：键为分组名，值为字符串或正则，匹配 node_modules 路径
  groups?: Record<string, (string | RegExp)[]>
}
```

示例：

```ts
OPS({
  override: false,
  groups: {
    lodash: ['lodash'],
    ui: ['element-plus', 'naive-ui'],
    babel: [/\/@babel\//],
  },
})
```

## 产物结构示例

- JS 主入口与公共 chunk：`js/[name]-[hash].js`
- CSS：`css/[name]-[hash][extname]`
- 图片：`img/[name]-[hash][extname]`
- 字体：`fonts/[name]-[hash][extname]`
- 其他静态资源：`assets/[name]-[hash][extname]`

## 许可

本项目使用 MIT 许可证，详见 `LICENSE`。

