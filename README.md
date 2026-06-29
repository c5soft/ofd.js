# ofd.js

一个用于读取和渲染OFD（开放式文档格式）文件的JavaScript库。

[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![npm version](https://img.shields.io/npm/v/ofd?label=npm)](https://www.npmjs.com/package/ofd)

## 功能特性

- 📄 **OFD 文档解析** - 完整支持OFD格式文件的解析和加载
- 🎨 **文档渲染** - 支持多种渲染模式（Template、PathContent）
- 📐 **缩放控制** - 灵活的页面缩放功能
- ✍️ **签名验证** - 支持OFD电子签名的验证
- 🖼️ **JBIG2支持** - 支持JBIG2压缩图像
- 🔧 **丰富的API** - 提供灵活的编程接口

## 安装

使用npm安装：

```bash
npm install ofd
```

或使用yarn：

```bash
yarn add ofd
```

## 快速开始

### 基础使用

```javascript
import { parseOfdDocument, renderOfd } from 'ofd';

// 1. 解析OFD文件
parseOfdDocument({
  ofd: 'path/to/file.ofd',  // 文件路径、File对象或ArrayBuffer
  success: (ofdDocument) => {
    console.log('解析成功', ofdDocument);
    
    // 2. 渲染文档到页面
    const screenWidth = window.innerWidth;
    const pages = renderOfd(screenWidth, ofdDocument);
    
    // 3. 添加到DOM
    pages.forEach(pageDiv => {
      document.getElementById('container').appendChild(pageDiv);
    });
  },
  fail: (error) => {
    console.error('解析失败', error);
  }
});
```

### 使用缩放功能

```javascript
import { parseOfdDocument, renderOfdByScale, setPageScale, getPageScale } from 'ofd';

// 设置缩放比例（1.0 = 100%）
setPageScale(1.2);

parseOfdDocument({
  ofd: file,
  success: (ofdDocument) => {
    // 根据设置的缩放比例渲染
    const pages = renderOfdByScale(ofdDocument);
    document.getElementById('container').appendChild(...pages);
  }
});

// 获取当前缩放比例
console.log('Current scale:', getPageScale());
```

### 在浏览器中使用

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>OFD 查看器</title>
  <style>
    #ofd-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div id="ofd-container"></div>
  
  <script type="module">
    import { parseOfdDocument, renderOfd } from 'ofd';
    
    // 获取文件输入
    document.getElementById('fileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      parseOfdDocument({
        ofd: file,
        success: (ofdDoc) => {
          const pages = renderOfd(window.innerWidth - 40, ofdDoc);
          const container = document.getElementById('ofd-container');
          container.innerHTML = '';
          pages.forEach(page => container.appendChild(page));
        },
        fail: (error) => {
          alert('文件解析失败: ' + error.message);
        }
      });
    });
  </script>
</body>
</html>
```

## API 文档

### parseOfdDocument(options)

解析OFD文档文件。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `options` | Object | 配置对象 |
| `options.ofd` | string \| File \| ArrayBuffer | OFD文件源（文件路径、File对象或二进制数据） |
| `options.success` | Function | 成功回调，接收解析后的文档对象 |
| `options.fail` | Function | 失败回调，接收错误对象 |

**返回值：** 无

**示例：**

```javascript
parseOfdDocument({
  ofd: fileInput.files[0],
  success: (document) => {
    console.log('页数:', document.pages.length);
  },
  fail: (error) => {
    console.error('错误:', error);
  }
});
```

---

### renderOfd(screenWidth, ofdDocument)

根据指定宽度渲染OFD文档，返回DOM页面数组。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `screenWidth` | number | 页面显示宽度（像素） |
| `ofdDocument` | Object | 通过 `parseOfdDocument` 获得的文档对象 |

**返回值：** Array&lt;HTMLDivElement&gt; - 页面DOM元素数组

**示例：**

```javascript
const pages = renderOfd(1024, ofdDocument);
pages.forEach(pageDiv => {
  // 每个pageDiv包含一个页面
  console.log('页面ID:', pageDiv.id);
  container.appendChild(pageDiv);
});
```

---

### renderOfdByScale(ofdDocument)

根据设置的缩放比例渲染OFD文档。需先使用 `setPageScale()` 设置缩放值。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `ofdDocument` | Object | 通过 `parseOfdDocument` 获得的文档对象 |

**返回值：** Array&lt;HTMLDivElement&gt; - 页面DOM元素数组

**示例：**

```javascript
setPageScale(1.5);  // 150%
const pages = renderOfdByScale(ofdDocument);
```

---

### setPageScale(scale)

设置全局页面缩放比例。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `scale` | number | 缩放比例（1.0 = 100%，可设置0.5-2.0之间的值） |

**返回值：** 无

**示例：**

```javascript
setPageScale(0.8);   // 80%
setPageScale(1.2);   // 120%
```

---

### getPageScale()

获取当前设置的缩放比例。

**参数：** 无

**返回值：** number - 当前缩放比例

**示例：**

```javascript
const currentScale = getPageScale();
console.log(`当前缩放: ${currentScale * 100}%`);
```

---

### calPageBox(screenWidth, document, page)

计算页面在指定屏幕宽度下的尺寸。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `screenWidth` | number | 屏幕宽度（像素） |
| `document` | Object | OFD文档对象 |
| `page` | Object | 页面对象 |

**返回值：** Object - 包含 `w`（宽度）和 `h`（高度）的对象

**示例：**

```javascript
const box = calPageBox(1024, ofdDocument.document, ofdDocument.pages[0]);
console.log(`页面尺寸: ${box.w}x${box.h}`);
```

---

### calPageBoxScale(document, page)

根据设置的缩放比例计算页面尺寸。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `document` | Object | OFD文档对象 |
| `page` | Object | 页面对象 |

**返回值：** Object - 包含 `w`（宽度）和 `h`（高度）的对象

**示例：**

```javascript
setPageScale(1.2);
const box = calPageBoxScale(ofdDocument.document, ofdDocument.pages[0]);
console.log(`缩放后页面尺寸: ${box.w}x${box.h}`);
```

---

### renderPage(pageDiv, page, templates, fonts, drawParams, multiMedia)

在指定的DOM元素中渲染单个页面。（高级API，通常无需直接调用）

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `pageDiv` | HTMLDivElement | 页面容器DOM元素 |
| `page` | Object | 页面对象 |
| `templates` | Object | 页面模板资源 |
| `fonts` | Object | 字体资源 |
| `drawParams` | Object | 绘制参数 |
| `multiMedia` | Object | 多媒体资源 |

**返回值：** 无

---

## 错误处理

```javascript
parseOfdDocument({
  ofd: file,
  success: (document) => {
    console.log('解析成功');
  },
  fail: (error) => {
    // 常见错误类型
    if (error.message.includes('not a valid zip')) {
      console.error('不是有效的OFD文件');
    } else if (error.message.includes('XML parse')) {
      console.error('文档结构错误');
    } else {
      console.error('未知错误:', error);
    }
  }
});
```

## 支持的OFD版本

- OFD 1.0
- OFD 1.2

## 浏览器兼容性

| 浏览器 | 最低版本 | 备注 |
|--------|---------|------|
| Chrome | 50+ | ✅ 完全支持 |
| Firefox | 45+ | ✅ 完全支持 |
| Safari | 10+ | ✅ 完全支持 |
| Edge | 15+ | ✅ 完全支持 |
| IE | 不支持 | ❌ 需要使用polyfills |

**注：** 需要支持 ES6 Module 和 Promise。如需支持IE11，请使用相应的polyfills。

## 依赖项

- **jszip** - ZIP文件解析
- **@xmldom/xmldom** - XML解析
- **jsrsasign** - 数字签名验证
- **js-sha1** - SHA1哈希算法
- **js-md5** - MD5哈希算法
- **@lapo/asn1js** - ASN.1编码/解码
- **ofd-xml-parser** - OFD XML解析
- **@sharp9/ofdjs** - OFD格式处理
- **web-streams-polyfill** - Stream API polyfill

## 常见问题

### Q: 如何在Node.js中使用？

A: 由于该库依赖于浏览器DOM API，暂不支持Node.js环境。未来可能提供Headless实现。

### Q: 支持大文件吗？

A: 支持，但建议文件不超过100MB。对于特别大的文件，可能需要分页加载。

### Q: 可以修改渲染样式吗？

A: 可以。通过CSS修改返回的页面DOM元素的样式。

### Q: 支持导出功能吗？

A: 当前版本仅支持渲染和查看。导出功能建议使用html2pdf等库。

### Q: 可以获取文本内容吗？

A: 可以通过遍历文档对象的内容节点获取。具体方法请参考源代码或提出Issue。

## 版本历史

请查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新信息。

## 许可证

本项目采用 Apache License 2.0 许可证。

**原始项目：** [DLTech21/ofd.js](https://github.com/DLTech21/ofd.js) © 2020 DLTech21

**修改版本：** 2026 Ycsx

详情请见 [LICENSE](LICENSE) 文件。

## 贡献

欢迎提交Issue和Pull Request！

在贡献前，请：

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

## 相关资源

- [OFD官方规范](https://www.ofd-spec.com/)
- [原始项目](https://github.com/DLTech21/ofd.js)
- [Issue追踪](https://github.com/ycsx/ofd.js/issues)

## 联系方式

如有问题或建议，欢迎：

- 提交 [GitHub Issues](https://github.com/ycsx/ofd.js/issues)
- 发送邮件至: 4081360972qq.com

---

**最后更新：** 2026年6月26日
