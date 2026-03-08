/**
 * 预设配置：大型库分组
 * Common large libraries that should typically be split
 */
export const COMMON_LARGE_LIBS: Record<string, string[]> = {
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

/**
 * 预设配置：中型库分组
 * Medium-sized libraries that should be grouped together
 */
export const MEDIUM_LIB_GROUPS: Record<string, string[]> = {
  'utils': ['@vueuse/', 'ahooks', 'react-use'],
  'icons': ['@iconify/', '@ant-design/icons', '@heroicons/', 'lucide-react'],
  'form': ['react-hook-form', 'formik', 'async-validator'],
  'i18n': ['i18next', 'react-i18next', 'vue-i18n'],
}

/**
 * 保守策略下只分离的超大型库
 */
export const VERY_LARGE_LIBS = ['react', 'vue', 'angular', 'antd', 'element-plus', 'echarts', 'three'] as const
