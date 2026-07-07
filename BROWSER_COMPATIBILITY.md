# 浏览器兼容性和环境支持

## 浏览器兼容性表

| 浏览器 | 最低版本 | 状态 | 备注 |
|--------|---------|------|------|
| Chrome | 50+ | ✅ 完全支持 | 推荐版本 |
| Firefox | 45+ | ✅ 完全支持 | 推荐版本 |
| Safari | 10+ | ✅ 完全支持 | iOS 10+可用 |
| Edge | 15+ | ✅ 完全支持 | 基于Chromium的新版本优化 |
| Opera | 37+ | ✅ 完全支持 | 基于Chromium |
| IE 11 | 11 | ⚠️ 需要Polyfills | 需要额外配置 |
| IE 10 | 10 | ❌ 不支持 | 过于陈旧 |

## 功能支持矩阵

### 核心功能

| 功能 | Chrome | Firefox | Safari | Edge | IE11 |
|------|--------|---------|--------|------|------|
| OFD解析 | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| DOM渲染 | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Canvas渲染 | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| 缩放功能 | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| 签名验证 | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| 文字提取 | ✅ | ✅ | ✅ | ✅ | ⚠️ |

### API支持

| API | 要求 | Chrome | Firefox | Safari | Edge |
|-----|------|--------|---------|--------|------|
| ES6 Module | - | ✅ | ✅ | ✅ | ✅ |
| Promise | - | ✅ | ✅ | ✅ | ✅ |
| Blob API | - | ✅ | ✅ | ✅ | ✅ |
| ArrayBuffer | - | ✅ | ✅ | ✅ | ✅ |
| Canvas API | - | ✅ | ✅ | ✅ | ✅ |
| Web Streams | - | ✅ | ✅ | 部分 | ✅ |

## 运行时环境

### 浏览器环境 ✅

**完全支持**

- 现代浏览器（Chrome, Firefox, Safari, Edge）
- 移动浏览器（iOS Safari, Chrome Mobile, Android Firefox）
- 平板浏览器

**所需功能**:
- ES6 Module支持
- Promise支持
- DOM API
- Canvas API
- File API

### Node.js环境 ❌

**暂不支持**

原因：该库依赖于浏览器特定的API：
- DOM操作
- Canvas渲染
- File API
- XMLHttpRequest / Fetch

**替代方案**:
- 使用[Puppeteer](https://github.com/puppeteer/puppeteer)在Node.js中运行Headless浏览器
- 使用[jsdom](https://github.com/jsdom/jsdom)模拟DOM环境
- 联系维护者了解Server-Side渲染支持的计划

### Electron环境 ✅

**完全支持**

Electron应用可以直接使用该库。

**示例**:
```javascript
// 主进程
const { BrowserWindow } = require('electron');

// 渲染进程
import { parseOfdDocument, renderOfd } from 'ofd';
```

## 旧版浏览器支持

### IE11 - 需要Polyfills

如果需要支持IE11，请：

1. **添加必需的Polyfills**:
```bash
bun add -d @babel/polyfill
bun add -d @babel/plugin-transform-promise
bun add -d promise-polyfill
bun add -d es6-promise
```

2. **配置Babel**:
```json
{
  "presets": [
    ["@babel/preset-env", {
      "useBuiltIns": "usage",
      "corejs": 3
    }]
  ]
}
```

3. **在HTML中加载Polyfills**:
```html
<script src="https://cdn.jsdelivr.net/npm/promise-polyfill@8/dist/polyfill.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/es6-promise@4/dist/es6-promise.auto.js"></script>
```

### IE10及以下 - 不支持

这些浏览器过于陈旧，不建议使用。

## 移动设备支持

### iOS

| 设备 | iOS版本 | Safari | Chrome | Firefox |
|------|---------|--------|--------|---------|
| iPhone | 10+ | ✅ | ✅ | ✅ |
| iPad | 10+ | ✅ | ✅ | ✅ |
| iPad Mini | 10+ | ✅ | ✅ | ✅ |

### Android

| 版本 | Chrome | Firefox | Samsung |
|------|--------|---------|---------|
| 4.4+ | ✅ | ✅ | ✅ |
| 5.0+ | ✅ | ✅ | ✅ |
| 6.0+ | ✅ | ✅ | ✅ |

## 性能考虑

### 推荐规格

**最小**:
- CPU: 2核@1GHz
- 内存: 1GB
- 带宽: 4G或WiFi

**推荐**:
- CPU: 4核@2GHz
- 内存: 4GB+
- 带宽: LTE或WiFi

### 文件大小限制

| 操作 | 建议上限 | 说明 |
|------|---------|------|
| 单页面文件 | 10MB | 过大会导致加载缓慢 |
| 多页面文件 | 100MB | 需要分页加载或Server-Side处理 |
| 单页面数量 | 1000页+ | 建议分页渲染 |

### 优化建议

1. **使用虚拟滚动**处理大文档
2. **压缩图片资源**减少文件体积
3. **启用缓存**避免重复加载
4. **分页加载**大型文件

## 功能检测

```javascript
// 检测浏览器支持
function checkBrowserSupport() {
  const required = {
    Promise: typeof Promise !== 'undefined',
    Canvas: typeof HTMLCanvasElement !== 'undefined',
    Blob: typeof Blob !== 'undefined',
    FileReader: typeof FileReader !== 'undefined',
  };

  const supported = Object.keys(required).every(key => required[key]);
  
  return {
    supported,
    missing: Object.keys(required).filter(k => !required[k]),
  };
}

const support = checkBrowserSupport();
if (!support.supported) {
  console.warn('浏览器不支持以下功能:', support.missing);
}
```

## 安全性考虑

### 安全的浏览器版本

始终使用最新的浏览器版本以获得最佳的安全性：

- Chrome: 自动更新
- Firefox: 自动更新
- Safari: 通过OS更新
- Edge: 自动更新

### 沙箱限制

该库在浏览器沙箱内运行，不会访问：
- 文件系统（除通过File API）
- 网络（除CORS允许）
- 其他标签页的内容

## 测试覆盖

自动化测试在以下环境运行：

- Node.js 14, 16, 18 (Jest)
- 核心功能单元测试

手动测试应在以下浏览器中进行：

- Chrome (最新)
- Firefox (最新)
- Safari (最新)
- Edge (最新)
- 移动浏览器（iOS Safari, Chrome Mobile）

## 反馈和Bug报告

如发现兼容性问题，请：

1. 记录你的环境信息（浏览器、版本、OS）
2. 提供复现步骤
3. 在[GitHub Issues](https://github.com/ycsx/ofd.js/issues)中报告

## 常见问题

### Q: 支持IE吗？
A: 不直接支持。IE11需要Polyfills但可能存在兼容性问题。建议升级到现代浏览器。

### Q: 移动设备上性能如何？
A: 现代移动浏览器性能良好。建议测试你的目标设备。

### Q: 可以离线使用吗？
A: 可以。库文件加载后无需网络连接。

### Q: 支持Progressive Web Apps (PWA)吗？
A: 支持。可以在PWA中完整使用。

### Q: 支持WebWorker吗？
A: 暂不支持。建议在主线程使用。

---

**最后更新**: 2026年6月26日

更多信息请参阅 [README.md](README.md)
