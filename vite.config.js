import { defineConfig } from 'vite';

// GitHub Pages 部署时，base 设为仓库名
const isProduction = process.env.NODE_ENV === 'production';
const base = isProduction ? '/cesium-client-project/' : '/';

// Vite 插件：在构建时替换 HTML 中的 CESIUM_BASE_URL
function cesiumBaseUrlPlugin() {
  return {
    name: 'cesium-base-url',
    transformIndexHtml(html) {
      // 替换 script 标签中的 CESIUM_BASE_URL 设置
      return html.replace(
        /window\.CESIUM_BASE_URL\s*=\s*'\/Cesium\/'/,
        `window.CESIUM_BASE_URL = '${base}Cesium/'`
      );
    },
  };
}

export default defineConfig({
  // 生产环境使用仓库名作为 base 路径
  base: base,
  plugins: [cesiumBaseUrlPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    proxy: {
      // 代理天地图瓦片请求，避免浏览器 CORS 限制
      '/tianditu': {
        target: 'https://t0.tianditu.gov.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tianditu/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://www.tianditu.gov.cn/');
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          });
        },
      },
    },
  },
  build: {
    target: 'esnext',
  },
});
