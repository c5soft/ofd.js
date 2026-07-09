# OFD 格式结构与渲染过程详解

> 以中国建设银行电子回单（`26050100800_00001.ofd`）为例，基于 GB/T 33190-2016 标准。

## 目录

1. [OFD 文件整体结构](#一ofd-文件整体结构zip-包)
2. [Page 结构详解](#二page-结构详解)
3. [ImageObject — 图片渲染](#三imageobject--图片渲染)
4. [TextObject — 文本渲染](#四textobject--文本渲染)
5. [PathObject — 路径/线框渲染](#五pathobject--路径线框渲染)
6. [完整的渲染流水线](#六完整的渲染流水线)
7. [关键数据对照表](#七关键数据对照表)
8. [常见问题](#八常见问题)

---

## 一、OFD 文件整体结构（ZIP 包）

OFD 文件本质是一个 **ZIP 容器**，解压后的目录结构如下：

```
OFD.xml                          ← 入口文件，描述文档信息
Doc_0/
├── Document.xml                 ← 文档根，定义页面、资源引用
├── DocumentRes.xml              ← 文档级资源（图片、字体映射）
├── PublicRes.xml                ← 公共资源
├── Res/                         ← 资源实体文件
│   ├── image_3.png              ← 印章图片（圆形建行LOGO）
│   ├── image_186.jb2            ← JBIG2 压缩图片（椭圆印章）
│   ├── image_202.png            ← 建行行徽
│   └── font_6_6.ttf             ← 字体文件（TrueType）
├── Pages/Page_0/
│   └── Content.xml              ← 页面内容（核心，描述所有可见元素）
└── Signs/
    ├── Signatures.xml
    └── Sign_0/
        ├── Signature.xml
        └── SignedValue.dat
```

### OFD.xml — 入口文件

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016" DocType="OFD" Version="1.1">
  <ofd:DocBody>
    <ofd:DocInfo>
      <ofd:DocID>019049304ee011f1824501ad024500ad</ofd:DocID>
      <ofd:CreationDate>2026-05-13</ofd:CreationDate>
      <ofd:ModDate>2026-05-13T23:25:43+08:00</ofd:ModDate>
      <ofd:Creator>Suwell API</ofd:Creator>
      <ofd:CreatorVersion>1.1.23.0407.1633</ofd:CreatorVersion>
    </ofd:DocInfo>
    <ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>
    <ofd:Signatures>/Doc_0/Signs/Signatures.xml</ofd:Signatures>
  </ofd:DocBody>
</ofd:OFD>
```

关键字段：

- `DocRoot`：指向文档根 XML 的路径
- `Signatures`：指向签名文件路径
- 支持多个 `DocBody`（多文档）

### Document.xml — 文档根

```xml
<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:CommonData>
    <ofd:MaxUnitID>203</ofd:MaxUnitID>
    <ofd:PageArea>
      <ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox>
    </ofd:PageArea>
    <ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes>
    <ofd:PublicRes>PublicRes.xml</ofd:PublicRes>
  </ofd:CommonData>
  <ofd:Pages>
    <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
  </ofd:Pages>
</ofd:Document>
```

### DocumentRes.xml — 资源映射

```xml
<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
  <ofd:MultiMedias>
    <ofd:MultiMedia ID="3" Type="Image">
      <ofd:MediaFile>image_3.png</ofd:MediaFile>
    </ofd:MultiMedia>
    <ofd:MultiMedia ID="186" Type="Image">
      <ofd:MediaFile>image_186.jb2</ofd:MediaFile>
    </ofd:MultiMedia>
    <ofd:MultiMedia ID="202" Type="Image">
      <ofd:MediaFile>image_202.png</ofd:MediaFile>
    </ofd:MultiMedia>
  </ofd:MultiMedias>
</ofd:Res>
```

**核心映射规则**：Content.xml 中的 `ResourceID="186"` → 在此文件中找到 `ID="186"` → 读取 `Res/image_186.jb2`。

---

## 二、Page 结构详解

### 2.1 页面区域

```xml
<ofd:Area>
    <ofd:PhysicalBox>0 0 209.9998 296.9948</ofd:PhysicalBox>
    <ofd:CropBox>0 0 209.9998 296.9948</ofd:CropBox>
</ofd:Area>
```

- **PhysicalBox**：物理页面尺寸 `"x y w h"`（毫米），A4 约 210×297mm
- **CropBox**：裁剪框，与 PhysicalBox 相同时全部可见
- **坐标系**：左上角原点 (0,0)，X 向右递增，Y 向下递增

### 2.2 图层 Layer

```xml
<ofd:Layer ID="2">
    <!-- 所有内容元素按 ID 升序排列 -->
</ofd:Layer>
```

- 页面可以包含多个 Layer，按 ID 升序渲染（ID 小的先画，在底层）
- 所有内容元素放在 Layer 内

### 2.3 内容元素类型

| 元素类型       | XML 标签            | 作用                   |
| -------------- | ------------------- | ---------------------- |
| **图片** | `ofd:ImageObject` | 图片/印章渲染          |
| **文本** | `ofd:TextObject`  | 所有可见文字           |
| **路径** | `ofd:PathObject`  | 表格线、边框、矢量图形 |

### 2.4 公共属性

每个内容元素都有的属性：

| 属性               | 格式              | 含义                           |
| ------------------ | ----------------- | ------------------------------ |
| **ID**       | 数字              | 唯一标识符，渲染按 ID 升序     |
| **CTM**      | `"a b c d e f"` | 变换矩阵（见下文）             |
| **Boundary** | `"x y w h"`     | 外接矩形（毫米），描述元素占位 |

### 2.5 CTM 变换矩阵详解

CTM = Current Transformation Matrix，格式为 6 个数字 `"a b c d e f"`：

```
[ a  b  0 ]     [ x ]     [ a*x + c*y + e ]
[ c  d  0 ]  ×  [ y ]  =  [ b*x + d*y + f ]
[ e  f  1 ]     [ 1 ]     [       1        ]
```

各参数含义：

| 参数        | 含义                   | 示例值                 |
| ----------- | ---------------------- | ---------------------- |
| **a** | X 方向缩放             | 0.3528（文本缩放系数） |
| **b** | X 方向切变（通常为 0） | 0                      |
| **c** | Y 方向切变（通常为 0） | 0                      |
| **d** | Y 方向缩放             | 0.3528                 |
| **e** | X 方向平移             | 0                      |
| **f** | Y 方向平移             | 0                      |

**注意**：当 Boundary 的 x/y 不为 0 时，位置由 Boundary 决定，CTM 的 e/f 可以忽略。当 Boundary 的 x/y 为 0 时，位置完全由 CTM 的 e/f 决定。

**0.3528 从哪来？**

以 A4 纸宽 210mm、渲染宽度 1024px 为例：

```
DPI = 1024 / (210 / 25.4) ≈ 123.9
缩放因子 ≈ 1/2.8346 ≈ 0.3528
```

这是一个将毫米单位映射到渲染坐标系的缩放系数。

---

## 三、ImageObject — 图片渲染

### 3.1 基本语法

```xml
<ofd:ImageObject ID="187" CTM="21.9604 0 0 21.9604 0 0"
    Boundary="166.4891 54.6894 21.9604 21.9604" ResourceID="186"/>
```

### 3.2 属性说明

| 属性                 | 含义                            | 示例值                               |
| -------------------- | ------------------------------- | ------------------------------------ |
| **ResourceID** | 资源 ID，映射到 DocumentRes.xml | 186                                  |
| **Boundary**   | 页面中的位置和尺寸（mm）        | x=166.49, y=54.69, w=21.96, h=21.96  |
| **CTM**        | 变换矩阵                        | a=21.96 (宽), d=21.96 (高), e=0, f=0 |

### 3.3 图片类型与解码

| 资源文件          | 类型  | 解码方式                                      |
| ----------------- | ----- | --------------------------------------------- |
| `image_202.png` | PNG   | `<img>` 标签直接加载                        |
| `image_3.png`   | PNG   | `<img>` 标签直接加载                        |
| `image_186.jb2` | JBIG2 | `jbig2/jbig2.ts` 解码 → 像素位图 → Canvas |

### 3.4 JBIG2 解码流程

```
image_186.jb2 二进制数据
    → JBIG2 解码器解析段头
    → 段类型路由（SymbolDict/TextRegion/GenericRegion/Halftone/PatternDict）
    → QM coder 算术解码
    → 输出位图（二值图像，每个像素 1bit）
    → 转换为 Canvas ImageData（RGBA）
    → 用 CTM 变换矩阵定位绘制
```

### 3.5 印章的"双图"模式

印章图片（ResourceID=3）在同一位置出现两次：

```xml
<ofd:ImageObject ID="4" ... ResourceID="3"/>
<ofd:ImageObject ID="5" ... ResourceID="3"/>
```

ID=4 和 ID=5 引用**同一张图片**、**同一位置**、**同一 CTM**。这是 OFD 中印章的常见模式——一个用于背景层，一个用于前景盖印效果。

---

## 四、TextObject — 文本渲染

### 4.1 基本语法

```xml
<ofd:TextObject ID="7" CTM="0.3528 0 0 0.3528 0 0"
    Boundary="141.6579 79.955 18.8881 3.1718" Font="6" Size="9">
    <ofd:FillColor Value="255 0 0"/>
    <ofd:CGTransform CodePosition="0" CodeCount="6" GlyphCount="6">
        <ofd:Glyphs>68 46 39 79 101 143</ofd:Glyphs>
    </ofd:CGTransform>
    <ofd:TextCode X="0" Y="7.731" DeltaX="9 9 9 9 9">北京上地支行</ofd:TextCode>
</ofd:TextObject>
```

### 4.2 属性说明

| 属性/子元素           | 含义                     | 示例                         |
| --------------------- | ------------------------ | ---------------------------- |
| **Font**        | 字体 ID，映射到字体文件  | 6 →`font_6_6.ttf`         |
| **Size**        | 字号                     | 9（会被 CTM 缩放）           |
| **FillColor**   | 填充颜色 RGB             | "255 0 0" = 红色             |
| **StrokeColor** | 描边颜色                 | "0 0 0" = 黑色               |
| **Stroke**      | 是否描边                 | true/false                   |
| **LineWidth**   | 描边线宽                 | 0.36                         |
| **CGTransform** | 字形变换                 | 包含 Glyphs 数组             |
| **Glyphs**      | 字形索引数组             | 每个数字对应字体中的一个字形 |
| **TextCode**    | 实际文本内容             | UTF-8 字符串                 |
| **DeltaX**      | 每个字符的宽度偏移（mm） | 控制字间距                   |

### 4.3 文本渲染流程

```
1. 解析 Font="6" → 在 DocumentRes.xml 中查找字体文件 → Res/font_6_6.ttf
2. 通过 CSS @font-face 加载字体
3. 创建 SVG <text> 元素
4. 设置位置：Boundary 的 x/y + TextCode 的 X/Y
5. 设置样式：FillColor、Size × CTM
6. 设置内容：TextCode 中的文本字符串
7. 使用 DeltaX 控制每个字符的精确位置
8. 如果 Stroke="true"，额外添加描边效果
```

### 4.4 文本定位

文本位置 = `Boundary(x, y)` + `TextCode(X, Y)`：

```
实际 X = Boundary.x + TextCode.X
实际 Y = Boundary.y + TextCode.Y
```

在示例中 `TextCode X="0" Y="7.731"`，所以：

- X = 141.66 + 0 = 141.66mm
- Y = 79.96 + 7.731 = 87.69mm

### 4.5 标题文字（大号描边）

```xml
<ofd:TextObject ID="201" ... Size="15" Stroke="true">
    <ofd:StrokeColor Value="0 0 0"/>
    ...
    <ofd:TextCode X="0" Y="12.885" DeltaX="15 15 ...">中国建设银行单位客户专用回单</ofd:TextCode>
</ofd:TextObject>
```

- Size=15 是最大字号，用于页眉标题
- Stroke="true" 配合 StrokeColor 产生描边效果（文字加粗）
- 水平居中于页面 x=60.8~134.8mm

---

## 五、PathObject — 路径/线框渲染

### 5.1 基本语法

```xml
<ofd:PathObject ID="10" CTM="0.3528 0 0 0.3528 0 0"
    Boundary="8.2682 20.5317 7.2231 0.2646"
    Stroke="false" Fill="true">
    <ofd:FillColor Value="0 0 0"/>
    <ofd:Clips TransFlag="false">
        <ofd:Clip>
            <ofd:Area CTM="0.3528 0 0 0.3528 0 0">
                <ofd:Path Boundary="0.375 -58.2 547.65 841.8375" ...>
                    <ofd:AbbreviatedData>M 0 0 L 547.65 0 L 547.65 841.8375 L 0 841.8375 C</ofd:AbbreviatedData>
                </ofd:Path>
            </ofd:Area>
        </ofd:Clip>
    </ofd:Clips>
    <ofd:AbbreviatedData>M 0 0 L 20.475 0 L 19.725 0.7499 L 0.75 0.7499 C</ofd:AbbreviatedData>
</ofd:PathObject>
```

### 5.2 缩写路径数据命令

| 命令        | 含义                | 格式                                            |
| ----------- | ------------------- | ----------------------------------------------- |
| **M** | Move To，移动到     | `M x y`                                       |
| **L** | Line To，画直线到   | `L x y`                                       |
| **C** | Close，闭合路径     | `C`（无需参数）                               |
| **B** | 贝塞尔三次曲线      | `B x1 y1 x2 y2 x3 y3`                         |
| **Q** | 贝塞尔二次曲线      | `Q x1 y1 x2 y2`                               |
| **A** | 圆弧（⚠️ 未实现） | `A rx ry x-axis-rotation large-arc sweep x y` |

### 5.3 PathObject 构成表格

大量 PathObject 用重复模式构成表格框架：

**横线模式**（Boundary y 相同、w 不同）：

```
ID=10  Boundary="8.2682 20.5317 7.2231 0.2646"   ← 第一列表头左边界
ID=17  Boundary="15.2268 20.5317 16.6026 0.2646"  ← 第一列表头右边界
ID=21  Boundary="31.5648 20.5317 67.1909 0.2646"  ← 第二列
...
```

**竖线模式**（Boundary x 相同、h 不同）：

```
ID=12  Boundary="15.2268 20.5317 0.2646 14.8299"  ← 第一列竖线
ID=18  Boundary="31.5648 20.5317 0.2646 5.1197"   ← 第二列竖线（第一行）
ID=22  Boundary="98.4911 20.5317 0.2646 5.1197"   ← 第三列竖线（第一行）
...
```

### 5.4 裁剪区 Clip

```xml
<ofd:Clips TransFlag="false">
    <ofd:Clip>
        <ofd:Area CTM="0.3528 0 0 0.3528 0 0">
            <ofd:Path Boundary="..." Stroke="false" Fill="true">
                <ofd:AbbreviatedData>M 0 0 L 547.65 0 L 547.65 841.8375 L 0 841.8375 C</ofd:AbbreviatedData>
            </ofd:Path>
        </ofd:Area>
    </ofd:Clip>
</ofd:Clips>
```

- 定义一个裁剪区域，确保绘制不越界
- `TransFlag="false"` 表示裁剪区内部可见
- 裁剪区路径通常是一个大矩形（覆盖整个表格区域）

---

## 六、完整的渲染流水线

### 6.1 解析阶段

```
OFD.xml
  → 找到 DocBody → DocRoot = "Doc_0/Document.xml"
  → 读取 Document.xml
    → 页面列表: Page ID=1 → "Pages/Page_0/Content.xml"
    → 资源映射: DocumentRes.xml + PublicRes.xml
  → 读取 Content.xml
    → 遍历所有 Layer，按 ID 排序
  → 读取所有资源实体文件（ZIP 中提取）
    → image_3.png, image_186.jb2, image_202.png, font_6_6.ttf
```

### 6.2 渲染阶段

```
渲染宽度 screenWidth（如 1024px）:

1. 计算 DPI 缩放:
   pageWidth = 210mm (PhysicalBox)
   scale = screenWidth / pageWidth

2. 遍历 Layer 内所有子元素，按 ID 升序:

   ID=4   ImageObject(ResourceID=3)     → Canvas 绘制圆形印章（背景层）
   ID=5   ImageObject(ResourceID=3)     → Canvas 绘制圆形印章（前景盖印）
   ID=7   TextObject "北京上地支行"     → SVG <text> 红色文字
   ID=8   TextObject "YOXUGZ149402"     → SVG <text> 红色描边文字
   ID=9   TextObject "此回单以客户..."  → SVG <text> 提示文字
   ID=10..130  PathObject (50+个)       → Canvas 绘制表格线框
   ID=131..180 TextObject (40+个)       → SVG <text> 表格数据
   ID=187 ImageObject(ResourceID=186)   → JBIG2 解码 → Canvas 椭圆印章
   ID=201 TextObject "中国建设银行..."  → SVG <text> 标题（大号描边）
   ID=203 ImageObject(ResourceID=202)   → Canvas 绘制建行行徽

3. 按类型分发渲染:
   - TextObject → 创建 <svg> 内嵌 <text> 元素
   - PathObject → Canvas 2D API 绘制路径
   - ImageObject → <img> 加载 PNG，或 JBIG2 解码后 Canvas 绘制
```

### 6.3 坐标转换

```
mm → 像素转换公式:
  pixelX = mmX * scale
  pixelY = mmY * scale
  其中 scale = screenWidth / pageWidth

例: Boundary x=8.27mm, screenWidth=1024px:
  pixelX = 8.27 * (1024 / 210) ≈ 40.3px
```

---

## 七、关键数据对照表

### 7.1 资源文件

| ResourceID | 文件              | 类型              | 用途           |
| ---------- | ----------------- | ----------------- | -------------- |
| 3          | `image_3.png`   | PNG 299×299 RGBA | 圆形建行印章   |
| 186        | `image_186.jb2` | JBIG2 压缩        | 椭圆印章       |
| 202        | `image_202.png` | PNG 308×56 RGBA  | 建行行徽       |
| Font 6     | `font_6_6.ttf`  | TrueType          | 所有文字的字体 |

### 7.2 元素位置（页面坐标 mm）

| 元素                                | Boundary (mm)                | 页面位置         |
| ----------------------------------- | ---------------------------- | ---------------- |
| 行徽                                | (8.67, 8.74) 39.38×7.16     | 左上角           |
| 标题 "中国建设银行单位客户专用回单" | (60.81, 8.27) 73.96×5.29    | 页眉居中         |
| 表格框架                            | (8.27, 20.53) ~187×63       | 正文区域         |
| 表格内容字段                        | (10.12~190.63, 21.47~83.63) | 表格内部         |
| 圆形印章                            | (135.92, 63.34) 30×30       | 右上角           |
| 椭圆印章 (JBIG2)                    | (166.49, 54.69) 21.96×21.96 | 右上角（更靠右） |
| 提示文字                            | (8.67, 88.19) 137.68×2.82   | 表格下方         |

### 7.3 页面概览

| 属性     | 值                             |
| -------- | ------------------------------ |
| 物理尺寸 | 210 × 297mm (A4)              |
| 总页数   | 1                              |
| 文档类型 | 中国建设银行电子回单           |
| 生成工具 | Suwell API 1.1.23 / pdf2ofdlib |
| 生成时间 | 2026-05-13 23:25:42            |
| 签名     | 有（Signatures.xml）           |

---

## 八、常见问题

### 8.1 Boundary 和 CTM 的定位关系？

- **Boundary**：描述元素在页面空间的位置和尺寸（毫米），格式 `"x y w h"`
- **CTM**：变换矩阵，格式 `"a b c d e f"`
- 当 Boundary 的 x/y 不为 0 时，位置由 Boundary 决定
- 当 Boundary 的 x/y 为 0 时，位置由 CTM 的 e/f 决定

### 8.2 PhysicalBox 和 Boundary 的区别？

- **PhysicalBox**：整个页面的物理尺寸（页面空间）
- **Boundary**：单个元素在页面中的外接矩形（对象空间）
- PhysicalBox 的坐标系是整个页面，Boundary 的坐标系是该元素所在的变换空间

### 8.3 JBIG2 和 GBIG2 的区别？

标准原文为 **JBIG2**（ITU T.88 / ISO/IEC 14492），有些中文文档称为 GBIG2。两者是同一标准的不同称呼。JBIG2 是 OFD 中印章图片常用的压缩格式（二值图像压缩）。

### 8.4 Content.xml 中不包含图片数据？

是的。Content.xml 只包含**引用**（ResourceID），实际的图片二进制数据在 `Res/` 目录下的文件中。渲染时需要：

1. 从 Content.xml 获取 ResourceID
2. 在 DocumentRes.xml 中查找 ID 对应的文件名
3. 从 ZIP 中读取该文件
4. 解码后渲染

### 8.5 字体是如何加载的？

1. TextObject 的 `Font="6"` 属性指定字体 ID
2. 在资源文件中查找 ID=6 的字体文件 → `font_6_6.ttf`
3. 通过 CSS `@font-face` 加载到页面中
4. SVG `<text>` 元素使用该字体渲染文本
5. 如果字体未找到，回退到系统字体

### 8.6 印章为什么出现两次？

ID=4 和 ID=5 引用同一张图片、同一位置，这是 OFD 中电子印章的标准实现方式：

- 一个对象作为印章背景
- 另一个对象作为前景盖印
- 模拟物理盖章的视觉效果

---

## 附录：术语对照

| OFD 术语        | 含义         | 对应 PDF 概念 |
| --------------- | ------------ | ------------- |
| PhysicalBox     | 物理页面尺寸 | MediaBox      |
| CropBox         | 裁剪框       | CropBox       |
| CTM             | 变换矩阵     | CTM           |
| Boundary        | 外接矩形     | BBox          |
| Layer           | 图层         | /Group        |
| ResourceID      | 资源引用 ID  | /XObject 引用 |
| AbbreviatedData | 缩写路径数据 | 路径操作符    |
| DocumentRes     | 文档级资源   | /Resources    |
| PublicRes       | 公共资源     | 共享资源字典  |
| ST_Loc          | 路径定位     | 文件引用      |
| ST_Box          | 矩形框       | Rectangle     |

---

> 本文档基于 `26050100800_00001.ofd`（中国建设银行电子回单）分析编写，对应 GB/T 33190-2016 标准。
