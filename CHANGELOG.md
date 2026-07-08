# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 完整的TypeScript类型定义 (index.d.ts)
- 详细的API文档 (README.md)
- .npmignore文件
- CHANGELOG.md版本管理文档
- ESLint和Prettier配置
- **`bun:test` 原生测试框架** - 完全移除 Jest 依赖
- GitHub Actions CI/CD流程
- CONTRIBUTING.md贡献指南
- **自实现 ASN.1 DER 解码器** (`src/ofd/asn1_util.ts`) - 替代 `@lapo/asn1js`
- **自实现 SHA1/MD5/RSA PKCS#1 v1.5** (`src/ofd/crypto_util.ts`) - 替代 `js-md5`/`js-sha1`/`jsrsasign`

### Changed
- **完全迁移到 TypeScript** - 已删除所有原始 JavaScript 目录 (`ofd_js/`, `jbig2_js/`)
- **改进 README.md 文档** - 更新依赖列表，移除已删除的外部依赖
- **升级 package.json 中的依赖版本**
- **修复 SES 签名解析** - 增加 CMS ContentInfo 格式支持（建设银行电子签章格式）
- **修复 OID 识别** - 识别 SM2 OID `1.2.156.10197.1.301.*`
- 改进CLAUDE.md文档（更新目录结构和依赖）

### Removed
- **移除所有 Jest 依赖** - 测试全部迁移到 `bun:test`
- **移除四个外部依赖**: `@lapo/asn1js`, `js-md5`, `js-sha1`, `jsrsasign`
- **删除原始 JavaScript 目录**: `ofd_js/` 和 `jbig2_js/` (迁移完成，不再需要参考)
- 删除 `tests/setup.js` 和 `jest.config.js`

### Fixed
- LICENSE文件完整性（原为空）
- 修复 `forEach(async)` bug in `ofd_parser.ts` (`getSignatureData`) - 之前会导致签名数组为空

## [1.0.0] - 2026-06-25

### Added
- 完整的OFD文档解析功能
- OFD文档渲染功能（Template和PathContent两种模式）
- 页面缩放控制
- JBIG2图像格式支持
- OFD电子签名验证
- SM3哈希算法支持
- PDF.js JBIG2处理模块

### Changed
- 修改ofd.js的导出，使其符合ESLint规范
- 依赖版本升级
- Template模式使用原作者方式展示
- PathContent模式使用新增Canvas方式展示

### Dependencies
- jszip ^3.10.1 - ZIP文件处理
- @xmldom/xmldom ^0.9.10 - XML解析
- jsrsasign ^11.1.3 - 数字签名算法
- js-sha1 ^0.7.0 - SHA1哈希
- js-md5 ^0.8.3 - MD5哈希
- @lapo/asn1js ^2.1.3 - ASN.1编码/解码
- ofd-xml-parser ^0.0.6 - OFD XML特定解析
- @sharp9/ofdjs ^0.1.0 - OFD格式支持
- web-streams-polyfill ^4.3.0 - Stream API兼容性
- jszip-utils ^0.1.0 - 额外的ZIP工具函数

---

## 原始项目信息

**原始项目：** [DLTech21/ofd.js](https://github.com/DLTech21/ofd.js)

**原作者：** DLTech21

**原始许可证：** Apache 2.0

**原始版本：** 1.0.0 (2020)

---

## 版本比较说明

### v1.0.0 → Unreleased

本版本包含了大量改进，重点在于：

1. **文档完整性** - 从完全缺失文档到提供完整的README、API文档和类型定义
2. **开发者体验** - 添加了ESLint、Prettier、Jest等工具链
3. **测试覆盖** - 建立了单元测试框架
4. **版本管理** - 开始使用Semantic Versioning
5. **社区贡献** - 准备好的贡献指南和CI/CD流程

### 重大变更（Breaking Changes）

**无** - 本版本保持完全向后兼容

### 性能改进

- 优化了DOM渲染流程
- 改进了内存使用

### Bug修复

- 修复了某些OFD文件的解析问题
- 改进了Canvas渲染的兼容性

---

## 迁移指南

### 从v1.0.0升级到Unreleased

无需任何代码更改，直接升级即可。新版本完全向后兼容。

```bash
npm update ofd
```

---

## 已知问题

- [ ] Node.js环境暂不支持（仅支持浏览器）
- [ ] 大文件（>100MB）处理可能较慢
- [ ] IE11需要额外的polyfills

更多已知问题请查看 [GitHub Issues](https://github.com/ycsx/ofd.js/issues)

---

## 未来计划

- [ ] 支持Node.js/Headless环境
- [ ] 文本提取功能
- [ ] PDF导出功能
- [ ] 签名添加功能
- [ ] 性能优化
- [ ] 更多格式支持

---

## 贡献者

- **DLTech21** - 原始项目作者
- **Ycsx** - 当前维护者

感谢所有贡献者！

如果你为这个项目做出了贡献，欢迎在此列出你的名字。

---

## 联系方式

- 📧 Email: 408136097@qq.com
- 🐙 GitHub: [GitHub Issues](https://github.com/ycsx/ofd.js/issues)
- 📝 文档: [完整文档](README.md)

---

**最后更新：** 2026年6月26日
