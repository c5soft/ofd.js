# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **安装依赖**: `bun install`（根目录 + workspaces 自动安装）
- **生产构建**: `bun run build` → scripts/build_dist.ts + --minify
- **开发构建**: `bun run build:dev` → scripts/build_dist.ts（不压缩）
- **开发服务器**: `bun run dev`（Vite dev server）
- **代码格式化**: `bun run format`（prettier --write）
- **运行测试**: `bun test`（使用 bun 内置测试运行器，非 Jest）
- **监听模式测试**: `bun run test:watch`
- **测试覆盖率**: `bun run test:coverage`
- **运行单个测试**: `bun test tests/ofd.test.js`
- **TypeScript 类型检查**: `bunx tsc --noEmit`
- **清理 node_modules 重装**: `rm -rf node_modules bun.lock && bun install`

## 项目概述

`ofdts` — 浏览器端 OFD（GB/T 33190-2016 开放式文档格式）解析与渲染库。从 DLTech21/ofd.js 派生，**已完整迁移到 TypeScript**，使用 Bun 作为构建工具。

**主要功能:** OFD 文档解析、HTML5 Canvas + SVG 渲染、页面缩放、电子签名验证（SES/SM2/SM3）、JBIG2 压缩图像解码、CSP 兼容（构建时自动移除 `new Function`/`eval`）。

## 入口与全局 Polyfill

`index.ts` 是构建入口，重新导出来自 `src/ofd/ofd.ts` 的公开 API 和 TypeScript 类型。它在模块顶部设置了一个关键 polyfill：

```ts
if (typeof window !== 'undefined' && typeof global === 'undefined') {
  (window as any).global = window;
}
```

这是浏览器兼容性 polyfill，确保依赖 `global` 对象的库在浏览器中正常工作，构建后的 ESM/IIFE 产物会自动包含此项。

### 公开 API

| API                             | 说明                                          |
| ------------------------------- | --------------------------------------------- |
| `parseOfdDocument(options)`   | 解析 OFD 文档，支持 URL/File/ArrayBuffer 输入 |
| `renderOfd(screenWidth, ofd)` | 按指定屏幕宽度（像素）渲染所有页面            |
| `renderOfdByScale(ofd)`       | 使用预配置的全局缩放渲染所有页面              |
| `setPageScale(scale)`         | 设置全局页面缩放倍数                          |
| `getPageScale()`              | 获取当前全局页面缩放倍数                      |

### 公开类型

- `PageBox` - 页面尺寸信息（`w`, `h`，像素）
- `Page` - 页面对象
- `OFDDocument` - 解析后的文档对象（含 `pages`, `document`, `tpls`, 各种资源）
- `DocumentInfo` - 文档信息
- `ParseOptions` - 解析选项

> 注: `calPageBox`, `calPageBoxScale`, `renderPage` 为内部 API，源代码导出但在最终发布的类型声明中被移除。

## 目录结构

```text
src/
├── ofd/                    # OFD 核心 (TypeScript)
│   ├── ofd.ts              # 公共 API 入口
│   ├── ofd_parser.ts       # 解析流水线 (ZIP→XML→JSON→结构化文档)
│   ├── ofd_render.ts       # 页面渲染 (Canvas 路径 + SVG 文本 + DOM 图像)
│   ├── ofd_util.ts         # 几何计算、坐标转换、颜色解析、HTML 解码
│   ├── asn1_util.ts        # 轻量级 ASN.1 DER 解码器（替代 @lapo/asn1js）
│   ├── crypto_util.ts      # SHA1/MD5/RSA PKCS#1 v1.5 自实现（替代 js-md5/js-sha1/jsrsasign）
│   ├── ses_signature_parser.ts  # SES 电子印章 ASN.1 解析
│   └── verify_signature_util.ts # SM2/RSA 签名验证 + SM3/MD5/SHA1 摘要 (SM3 from sm-crypto)
└── jbig2/                  # JBIG2 图像解码 (TypeScript)
    ├── jbig2.ts            # 主解码器 (ISO/IEC 14492)
    ├── arithmetic_decoder.ts # QM coder 算术解码
    ├── ccitt.ts            # CCITT 传真编码/解码
    ├── jbig2_stream.ts     # JBIG2 流→位图包装
    ├── stream.ts           # 流抽象基类
    ├── primitives.ts       # PDF 基本类型 (Dict/Name/Ref)
    ├── core_utils.ts       # 核心工具函数
    ├── util.ts             # 工具函数与常量
    ├── compatibility.ts    # 浏览器 polyfills (core-js)
    └── is_node.ts          # 环境检测

dist/                       # 构建输出
├── ofd.js                  # ESM 格式（未压缩）
├── ofd.min.js              # IIFE 格式（压缩，暴露 window.OFD）
└── ofd.d.ts                # 类型声明（后处理移除了 3 个内部 API）
```

## 架构

### 解析流水线

整个解析过程在 `ofd_parser.ts` 中实现，使用 async/await 链完成，按以下步骤执行：

1. `parseOfdSteps` → 入口函数，启动流水线
2. `unzipOfd` → 用 JSZip 解压 ZIP 容器（OFD 本质是 ZIP）
3. `getDocRoots` → 读取 `OFD.xml`，提取 `ofd:DocBody[]`
4. `parseSingleDoc` → 对每个 DocBody 依次执行:
   - `doGetDocRoot` → 解析 `Document.xml`，提取签名
   - `getDocument` → 解析文档主结构（页面、注释）
   - `getDocumentRes` / `getPublicRes` → 加载资源（字体、绘制参数、多媒体）
   - `getTemplatePage` → 解析模板页
   - `getPage` → 解析内容页对象（文本/路径/图像）
5. 签名处理 → 解析 SES 印章，调用 `verify_signature_util.ts` 进行 SM2/SM3 验证

### 渲染流程

1. `renderPage` → 设置页面容器尺寸（从毫米转换为像素），创建一个 `<canvas>`（矢量路径）和一个 `<svg>`（文本）
2. `renderLayer` → 遍历图层对象，按 ZOrder 排序，按类型分发:
   - **文本对象** → `renderTextObject` → 创建 `<svg>` 内嵌 `<text>` 元素
   - **路径对象** → `renderPathObjectsOnCanvas` → 在 `<canvas>` 上绘制矢量图形
   - **图像对象** → `renderImageObject` → JBIG2 解码到 Canvas，其他格式用 `<img>`
3. `renderTemplates` → 先渲染模板（背景层），再叠加内容层
4. 印章图层 → 最后渲染电子签章外观

### 关键设计点

- **坐标系统**: OFD 使用毫米为单位。`converterDpi()` 根据 `screenWidth / pageWidth` 计算 DPI 缩放；渲染时所有坐标从毫米转换为像素。
- **单位**: OFD 中的 `CTM`（current transformation matrix）使用 0.01mm 精度；代码中除以 10 转换为毫米再计算。
- **颜色**: OFD 支持 RGB、CMYK、Gray；代码通过 `CT_Color` 的 `@_Value` 属性解析，CMYK 转换为 RGB。
- **JBIG2**: 二值图像压缩（用于印章图片）。解码流程: 解析段头→段类型路由（SymbolDict/TextRegion/GenericRegion/Halftone/PatternDict）→算术解码器→位图输出。
- **全局缩放**: 模块级变量 `pageScale`，通过 `setPageScale()` / `getPageScale()` 访问。
- **CSP 兼容**: `bun build` 使用 `--external:crypto` 避免 Node.js crypto polyfill；构建后自动移除两处 `new Function()` 调用（来自 setimmediate 和 get-intrinsic），使产物兼容 Content Security Policy 环境。

### 构建系统

- **构建工具**: `bun build`（通过 `scripts/build_dist.ts`）
- **输出格式**: ESM (`dist/ofd.js`) + IIFE (`dist/ofd.min.js`，暴露 `window.OFD`)
- **类型声明**: 通过 `tsc --emitDeclarationOnly` 从 `src/ofd/ofd.ts` 生成，再后处理移除 `calPageBox`/`calPageBoxScale`/`renderPage` 这三个内部 API 的声明
- **入口**: `index.ts` → 构建后映射到 `dist/ofd.js` 和 `dist/ofd.min.js`

## 主要依赖

| 包                       | 用途                                 |
| ------------------------ | ------------------------------------ |
| `jszip`                | ZIP 解压（OFD 是 ZIP 容器）          |
| `fast-xml-parser`      | XML→JSON 解析（OFD 文件内部是 XML） |
| `sm-crypto`            | 国密 SM2/SM3 算法                    |
| `core-js`              | 旧浏览器 polyfills                   |
| `web-streams-polyfill` | ReadableStream 兼容                  |

> **Note:** `js-md5`, `js-sha1`, `jsrsasign`, `@lapo/asn1js` 这些外部依赖已移除。功能已在 `crypto_util.ts` 和 `asn1_util.ts` 中自实现，减少了总依赖体积。

## 注意事项

- **仅浏览器可用**: 依赖 DOM API（`document`、`canvas`、`Image`），不支持 Node.js。
- **构建需要 Bun**: 脚本使用 `Bun.$` shell API；运行时用 `bun` 命令，非 Node.js。`node >= 14` 仅用于运行构建工具。
- **TypeScript 严格模式关闭**: `tsconfig.json` 中 `strict: false` — 从 JS 迁移的代码使用了许多 `any` 类型。
- **测试环境**: 使用 `bun:test` 内置测试运行器，`jsdom` 模拟浏览器 DOM。完全移除了 Jest 依赖。
- **依赖树**: 见 [DEPENDENCY_TREE.md](DEPENDENCY_TREE.md) — 从叶子到根（`ofd.ts`）的单向无环依赖。
- **测试**: `bun test` 运行 32 个测试（6 个文件）。所有测试通过。
- **browserslist**: Chrome > 50, Firefox > 45, Safari > 10, Edge > 15。

## 工作区结构

项目使用 Bun workspaces（`"workspaces": ["examples/*"]`）：

- `examples/solid/` — SolidJS 示例应用（Solid 1.9 + Vite 8 + UnoCSS），含真实 OFD 测试文件（`examples/solid/public/ofds/`），是日常开发验证的主要工具。运行 `cd examples/solid && bun run dev` 启动。
- `examples/vue/3/` — Vue 3 集成示例

## 国家标准对照 (GB/T 33190-2016)

完整标准文本见 [docs/ofd_standard.txt](docs/ofd_standard.txt)（从 PDF 提取）。以下列出代码实现与标准各章节的映射关系。

### 文件结构 (第 6 章)

| 标准要求                              | 实现位置                                           | 状态 |
| ------------------------------------- | -------------------------------------------------- | ---- |
| ZIP 容器 6.2.0                        | `ofd_parser.ts` → `unzipOfd()` 使用 JSZip     | ✅   |
| 目录布局: OFD.xml / Doc_N / Page_N 等 | `ofd_parser.ts` → `getDocRoots()` 等          | ✅   |
| 多文档支持 (多个 DocBody)             | `ofd_parser.ts` → `parseSingleDoc()` 循环处理 | ✅   |

### 基本结构 (第 7 章)

| 标准要求              | 实现位置                                                       | 状态 |
| --------------------- | -------------------------------------------------------------- | ---- |
| 命名空间`ofd:` 解析 | `ofd-xml-parser` 外部库处理                                  | ✅   |
| ST_Loc 路径解析       | `ofd_util.ts` → 路径拼接                                    | ✅   |
| ST_Box / ST_Pos 解析  | `ofd_util.ts` → `converterDPI()` / `boxToPixel()`       | ✅   |
| Document.xml 根节点   | `ofd_parser.ts` → `doGetDocRoot()`                        | ✅   |
| 页树 (PageTree)       | `ofd_parser.ts` → `getDocument()`                         | ✅   |
| 模板页 (TemplatePage) | `ofd_parser.ts` → `getTemplatePage()`                     | ✅   |
| 资源 (Res) 加载       | `ofd_parser.ts` → `getDocumentRes()` / `getPublicRes()` | ✅   |
| 公共资源 vs 页面资源  | 分别通过 DocumentRes.xml 和 Page_N/Res.xml 加载                | ✅   |

### 页面描述 — 坐标系统 (8.1)

| 标准要求                                     | 实现位置                                             | 状态 |
| -------------------------------------------- | ---------------------------------------------------- | ---- |
| 页面空间: 左上角原点, X→右, Y→下, 毫米单位 | `ofd_util.ts` → `converterDPI()`                | ✅   |
| 变换矩阵 [a b c d e f] (8.1.5)               | `ofd_render.ts` → Canvas CTM 设置                 | ✅   |
| 矩阵变换: 平移/缩放/旋转/切变 (表 20)        | Canvas API`setTransform()`                         | ✅   |
| 对象空间: 外接矩形 Boundary 定位             | `ofd_render.ts` → `renderPathObjectsOnCanvas()` | ✅   |
| 设备空间转换: mm → 像素                     | `ofd_util.ts` → `converterDPI()`                | ✅   |

### 绘制参数 (8.2)

| 标准要求         | 实现位置              | 状态 |
| ---------------- | --------------------- | ---- |
| 线宽 (LineWidth) | Canvas`lineWidth`   | ✅   |
| 端点样式 (Cap)   | Canvas`lineCap`     | ✅   |
| 连接样式 (Join)  | Canvas`lineJoin`    | ✅   |
| 虚线样式 (Dash)  | Canvas`setLineDash` | ✅   |

### 颜色 (8.3)

| 标准要求                    | 实现位置                                           | 状态 |
| --------------------------- | -------------------------------------------------- | ---- |
| RGB 颜色                    | `ofd_util.ts` → `getColor()` 解析 `#RRGGBB` | ✅   |
| CMYK→RGB 转换              | `ofd_util.ts` → `cmykToRgb()`                 | ✅   |
| Gray 灰度                   | `ofd_util.ts` → `getColor()`                  | ✅   |
| 调色板 (Palette)            | 未实现 (通过索引取色)                              | ⚠️ |
| 底纹 (Pattern)              | 未实现                                             | ❌   |
| 渐变 (Axial/Radial/Gouraud) | 未实现                                             | ❌   |

### 图形 (第 9 章)

| 标准要求                          | 实现位置                                             | 状态 |
| --------------------------------- | ---------------------------------------------------- | ---- |
| 路径对象 (PathObject)             | `ofd_render.ts` → `renderPathObjectsOnCanvas()` | ✅   |
| 缩写路径数据 (AbbreviatedData)    | `ofd_render.ts` → `renderAbbreviatedData()`     | ✅   |
| 填充规则 (非零/奇偶)              | Canvas`fillRule`                                   | ✅   |
| M/L/C 路径命令                    | `ofd_render.ts` 解析                               | ✅   |
| **圆弧 (Arc) 命令** (9.3.5) | 未实现 — 会抛出未支持错误                           | ⚠️ |
| 裁剪区 (Clip)                     | `ofd_render.ts` → Canvas clip                     | ✅   |

### 图像 (第 10 章)

| 标准要求               | 实现位置                                                  | 状态 |
| ---------------------- | --------------------------------------------------------- | ---- |
| JPEG/PNG/TIFF/BMP 图像 | `ofd_render.ts` → `renderImageObject()` 用 `<img>` | ✅   |
| JBIG2 压缩图像         | `jbig2/jbig2.ts` → 完整解码器                          | ✅   |
| 图像变换矩阵           | Canvas CTM                                                | ✅   |

### 文字 (第 11 章)

| 标准要求                | 实现位置                                                   | 状态 |
| ----------------------- | ---------------------------------------------------------- | ---- |
| 文字对象 (TextObject)   | `ofd_render.ts` → SVG `<text>` 渲染                   | ✅   |
| 字体加载 (Font)         | `ofd_render.ts` → CSS @font-face / system font fallback | ✅   |
| 文字定位 (TextPosition) | SVG 坐标映射                                               | ✅   |
| 字形变换 (11.4)         | SVG 基本支持                                               | ⚠️ |

### 数字签名 (第 18 章)

| 标准要求                  | 实现位置                                             | 状态 |
| ------------------------- | ---------------------------------------------------- | ---- |
| 签名列表 (Signatures.xml) | `ses_signature_parser.ts` → 解析                  | ✅   |
| 签名文件结构 (18.2)       | `ses_signature_parser.ts`                          | ✅   |
| 文件摘要 (18.2.1)         | `verify_signature_util.ts` → SM3/MD5/SHA1         | ✅   |
| 签名验证 (SM2/RSA)        | `verify_signature_util.ts` + sm-crypto / 自实现 RSA | ✅   |
| SES 电子印章              | `ses_signature_parser.ts` → ASN.1 解析（自实现解码器） | ✅   |
| 签名外观 (SignedInfo)     | `ses_signature_parser.ts` → 印章图片提取          | ✅   |

### 未实现的特性

以下标准章节在当前版本中未实现：

- **渐变填充** (8.3.4): AxialShd / RadialShd / GouraudShd
- **底纹** (8.3.3): Pattern 填充
- **圆弧命令** (9.3.5): 缩写路径中的 A 命令
- **视频** (第 12 章): 多媒体对象
- **复合对象** (第 13 章): CompositeObject
- **动作** (第 14 章): 跳转/附件/URI/音视频动作
- **注释** (第 15 章): Annotation
- **自定义标引** (第 16 章): CustomTags
- **版本管理** (第 19 章): Version
- **附件** (第 20 章): Attachment
