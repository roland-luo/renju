/**
 * Vitest 全局 setup：
 * @tarojs/runtime 的 dom-external 在运行时读取一组 ENABLE_* 全局常量
 * （正常由 Taro webpack DefinePlugin 注入）。Node 测试环境没有这些注入，
 * 这里补齐，值对齐 config 默认（见 webpack5-runner MiniWebpackPlugin）。
 */
const g = globalThis as Record<string, unknown>;

g.ENABLE_INNER_HTML = true;
g.ENABLE_ADJACENT_HTML = false;
g.ENABLE_SIZE_APIS = false;
g.ENABLE_TEMPLATE_CONTENT = false;
g.ENABLE_CLONE_NODE = false;
g.ENABLE_CONTAINS = false;
g.ENABLE_MUTATION_OBSERVER = false;

export {};
