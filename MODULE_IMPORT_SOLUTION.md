# 模块导入错误解决方案

## 问题说明

```
Uncaught TypeError: Failed to resolve module specifier "jszip-utils". 
Relative references must start with either "/", "./", or "../".
```

## 原因分析

这个错误出现的原因是：**浏览器无法直接加载npm模块**。

### 为什么会这样？

1. **npm模块名解析** 
   - 浏览器无法理解 `"jszip-utils"` 这样的包名
   - 浏览器只认识相对路径（`./`, `../`, `/`）或完整URL

2. **模块系统不同**
   - Node.js 有 `node_modules` 文件夹和模块解析系统
   - 浏览器没有这些，需要打包工具处理

3. **OFD.js依赖的npm模块**
   ```javascript
   import JsZip from "jszip";                    // ❌ npm包
   import Hex from "@lapo/asn1js/hex";          // ❌ npm包
   import md5 from "js-md5";                     // ❌ npm包
   import rsa from "jsrsasign"                   // ❌ npm包
   import * as JSZipUtils from "jszip-utils";   // ❌ npm包
   ```

## 解决方案

### ✅ 方案1：使用npm build脚本（推荐用于生产）

**步骤1：安装webpack和loaders**
```bash
npm install --save-dev webpack webpack-cli
npm install --save-dev babel-loader @babel/core @babel/preset-env
```

**步骤2：运行build**
```bash
npm run build
```

这会生成 `dist/ofd.js` - 可以直接在浏览器中使用

**步骤3：在HTML中引入**
```html
<script src="../dist/ofd.js"></script>
<script>
  const { parseOfdDocument, renderOfd } = OFD;
  // 使用全局OFD对象
</script>
```

### ✅ 方案2：使用Vite开发服务器（推荐用于开发）

**步骤1：创建vite.config.js**
```javascript
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    middlewareMode: false,
    open: '/examples/basic-viewer.html'
  }
})
```

**步骤2：安装vite**
```bash
npm install --save-dev vite
```

**步骤3：运行开发服务器**
```bash
npm run dev
# 或
npx vite
```

### ✅ 方案3：使用npm包在浏览器中（通过CDN或打包）

对于生产环境，使用jsdelivr CDN：

```html
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.js"></script>
<script src="https://cdn.jsdelivr.net/npm/js-md5@0.8.3/js-md5.js"></script>
<!-- 等等... 然后使用全局对象 -->
```

但这很复杂，**不推荐**。

### ✅ 方案4：修改源码移除npm依赖（已完成）

我已经修改了 `src/ofd/ofd.js` 中的 `jszip-utils` 依赖：

**之前（有错误）：**
```javascript
import * as JSZipUtils from "jszip-utils";

export const parseOfdDocument = function (options) {
    if (options.ofd instanceof File || options.ofd instanceof ArrayBuffer) {
        doParseOFD(options);
    } else {
        JSZipUtils.getBinaryContent(options.ofd, ...);  // ❌ 错误
    }
}
```

**现在（已修复）：**
```javascript
const getBinaryContent = function (url, callback) {
    if (url instanceof ArrayBuffer || url instanceof File) {
        callback(null, url);
        return;
    }
    
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function () {
        callback(null, xhr.response);
    };
    xhr.onerror = function () {
        callback(new Error('Network error'));
    };
    xhr.send();
};

export const parseOfdDocument = function (options) {
    if (options.ofd instanceof File || options.ofd instanceof ArrayBuffer) {
        doParseOFD(options);
    } else {
        getBinaryContent(options.ofd, ...);  // ✅ 正确
    }
}
```

## 当前状态

### ✅ 已完成的修改

1. 移除了 `jszip-utils` 的直接导入
2. 实现了本地的 `getBinaryContent` 函数
3. 其他npm模块仍然需要通过打包工具处理

### ⚠️ 仍需打包工具处理的模块

```javascript
// 这些仍然需要webpack/vite处理：
import JsZip from "jszip";
import Hex from "@lapo/asn1js/hex";
import md5 from "js-md5";
import rsa from "jsrsasign";
// ...
```

## 完整解决方案步骤

### 步骤1：安装依赖
```bash
cd c:\Users\王骁\ofd.js
npm install
```

### 步骤2：构建项目
```bash
npm run build
```

### 步骤3：使用构建后的文件

**选项A：通过npm（推荐）**0
```javascript
// package.json中的main字段指向index.js
// 项目会通过npm自动解析模块
import { parseOfdDocument, renderOfd } from 'ofd';
```

**选项B：使用dist目录**
```html
<!-- 在HTML中引入打包后的文件 -->
<script src="dist/ofd.js"></script>
<script>
  const { parseOfdDocument, renderOfd } = window.OFD;
</script>
```

### 步骤4：配置HTTP服务器

```bash
# 使用Python
python -m http.server 8000

# 或使用Node.js
npx http-server

# 或使用VSCode Live Server扩展
```

访问：`http://localhost:8000/examples/basic-viewer.html`

## 测试验证

### 测试1：本地文件测试
```bash
npm run build
python -m http.server 8000
# 访问 http://localhost:8000/examples/basic-viewer.html
```

### 测试2：检查控制台
```javascript
// 在浏览器控制台中验证
import { parseOfdDocument } from '../index.js';
console.log(typeof parseOfdDocument); // 应该输出 "function"
```

## 常见问题

### Q: 为什么要用打包工具？
A: 因为浏览器无法识别npm包名。打包工具会：
- 解析npm包名
- 查找node_modules中的文件
- 将所有代码打包成浏览器可识别的格式

### Q: 可以跳过npm模块吗？
A: 不能。OFD.js核心功能依赖于这些库：
- `jszip` - 解析ZIP格式（OFD是ZIP）
- `@lapo/asn1js` - 处理数字签名
- `js-md5`, `js-sha1` - 哈希算法
- `jsrsasign` - RSA加密

### Q: 为什么basic-viewer.html还是有问题？
A: 因为导入的 `../index.js` 中包含了npm模块导入。需要：
1. 先运行 `npm run build` 生成打包文件
2. 或使用打包工具的开发服务器

### Q: 有简单的解决方案吗？
A: 有两个：
1. 使用已提供的 `basic-viewer-cdn.html` - 不需要npm，但功能有限
2. 使用打包工具 - 功能完整，但需要build步骤

## 推荐流程

```
┌─────────────────────────────────────────┐
│ 1. npm install                          │ 安装依赖
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│ 2. npm run build                        │ 构建项目
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│ 3. python -m http.server 8000           │ 启动服务器
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│ 4. 访问 http://localhost:8000/          │ 在浏览器中使用
│    examples/basic-viewer.html           │
└─────────────────────────────────────────┘
```

## 更新package.json

我已经更新了package.json中的build脚本。现在可以直接运行：

```bash
npm run build
```

这会根据webpack.config.js配置生成dist/ofd.js

## 总结

| 方案 | 优点 | 缺点 | 推荐场景 |
|------|------|------|---------|
| webpack build | 完整功能，最优化 | 需要build步骤 | 生产环境 |
| Vite dev | 快速热更新 | 需要配置 | 开发环境 |
| basic-viewer-cdn.html | 无需build | 功能有限 | 快速演示 |

---

**下一步**：运行以下命令完成配置

```bash
npm install
npm run build
python -m http.server 8000
```

然后访问 `http://localhost:8000/examples/basic-viewer.html`

