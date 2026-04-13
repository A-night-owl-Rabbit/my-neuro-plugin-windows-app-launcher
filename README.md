# Windows 应用启动器（my-neuro 插件）

适用于 my-neuro 系 Live2D 桌宠项目的 **Windows 本地应用启动** 插件：让助手根据名称启动本机程序，或打开 `http(s)`、`steam://` 等链接。

本仓库发布形态与 [my-neuro-plugin-astrbook](https://github.com/A-night-owl-Rabbit/my-neuro-plugin-astrbook) 类似，为独立插件目录，便于克隆或下载后放入项目的 `built-in` 插件目录使用。

## 功能概览

- 首次加载时扫描**当前用户桌面**与**公共桌面**上的 `.exe`、`.lnk`、`.url`，合并写入插件目录下的 `apps.json`。
- 支持通过快捷方式解析真实目标路径；`.url` 可解析为网页或自定义协议链接。
- 向框架注册工具 **`launch_application`**：根据 `apps.json` 中的应用名（不区分大小写）执行启动。

## 安装

1. 将本仓库整个文件夹放到 my-neuro 主程序中，例如：`live-2d/plugins/built-in/windows-app-launcher`。
2. 保持与内置插件相同的目录层级，以便 `index.js` 中能正确加载主程序的 `plugin-base`（相对路径 `../../../js/core/plugin-base.js`）。
3. 在插件目录执行：`npm install`。
4. 在 my-neuro 的插件管理中启用 **Windows 应用启动器**。

## 关于 apps.json（重要）

- **本仓库不包含真实的 `apps.json`**，以免泄露本机路径等隐私。
- 首次运行插件时，若目录下没有 `apps.json`，会自动扫描桌面并生成；也可参考 `apps.example.json` 自行创建。
- 若曾使用旧版 `server-tools/apps.json`，插件在首次初始化时会尝试迁移到插件目录（见 `index.js`）。

## 工具说明

| 工具名 | 说明 |
|--------|------|
| `launch_application` | 参数 `appName`：与 `apps.json` 中键名一致的应用显示名。 |

## 依赖

- Node.js（与 my-neuro 主程序一致）
- npm 包：`iconv-lite`

## 安全提示

- 本插件会执行本机程序与系统命令，请只从可信来源获取代码；谨慎编辑 `apps.json`。
- **请勿**将含个人路径的 `apps.json`、API Key、提示词仓库等敏感内容提交到公开仓库。

## 致谢

插件逻辑源自 my-neuro 内置模块整理；使用请遵循你所在 my-neuro 发行版的许可与约定。