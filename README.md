# Remote Viewer

**A browser-based remote file explorer and visualization tool for 3D Gaussian Splatting, panoramic imagery, and multimedia.**

面向三维重建、计算机视觉及远程 GPU 服务器开发场景的轻量级 Web 文件预览工具。通过浏览器直接访问服务器上的实验输出，无需逐个手动下载文件或启动桌面图形环境。

![Version](https://img.shields.io/badge/version-4.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933)
![Rendering](https://img.shields.io/badge/rendering-WebGL2-orange)
![FFmpeg](https://img.shields.io/badge/video-FFmpeg-007808)

## Features

- **3D Gaussian Splatting** — 基于 Three.js 和 Spark 的高斯泼溅渲染，支持原点视角、全局环绕、第一人称漫游、相机坐标显示及 FOV 调节。
- **360° Panorama** — 支持等距柱状投影全景图，可在普通图片与全景模式之间切换。
- **Media Preview** — 支持图片、视频、音频在线预览；视频提供 FFmpeg 兼容转码及缓存。
- **Text Preview** — 支持代码、配置文件、日志等 UTF-8 文本的只读预览。
- **Markdown Preview** — 打开 `.md` 或 `.markdown` 文件后，勾选文件栏的 **渲染 Markdown** 查看 GitHub 风格的标题、表格、任务列表和代码高亮，取消勾选即可查看原文。支持 README 中的居中 HTML 标题、图片和内嵌视频，媒体相对路径按文档所在目录解析。
- **File Explorer** — GitHub 风格的多级目录树与文件预览，支持系统浅色和深色主题。拖动目录栏右边框可调整宽度，聚焦边框后也可用方向键调整。浏览器会记住宽度。
- **多模型预览与窗口布局** — 同一页面可打开多个 3DGS 模型，支持单窗口查看当前模型或并排网格查看全部模型；每个模型独立保存相机视角和控制器，切换布局不会主动销毁模型视窗。服务器 GPU 会话闲置约 90 秒后会按资源回收策略关闭，恢复时可能需要重新加载。

## Supported Formats

| Category | Formats | Notes |
| --- | --- | --- |
| Gaussian Splatting | PLY, SPLAT, KSPLAT, SPZ, SOG | 依赖 Spark 对具体模型编码的支持；PLY 应包含兼容的 GS 属性 |
| Images | JPG, JPEG, JFIF, PNG, WebP, BMP, GIF, AVIF, ICO, TIFF, HEIC, HEIF | 实际解码能力取决于浏览器 |
| Panoramas | 浏览器可解码的图片 | 推荐 2:1 等距柱状投影 |
| Video | MP4, WebM, OGV, MOV, M4V, MKV, AVI | 原生播放或 FFmpeg 兼容转码 |
| Audio | MP3, WAV, OGG, FLAC, M4A | 依赖浏览器解码能力 |
| PyTorch 检查点 | PT, PTH | 张量、state_dict 或嵌套训练检查点；按名称筛选张量，查看形状、类型和元素数 |
| Text | TXT, JSON, JSONL, CSV, LOG, Markdown, Python, JavaScript, YAML, XML, Shell, C/C++ 等 | UTF-8，默认预览前 2 MiB |

## Quick Start

### 服务器快速启动（预编译包）

如果服务器已有 Node.js 22.4 或更高版本，下载预编译包即可启动。发布包包含网页和服务端的 npm 运行依赖。建议解压到独立的程序目录，将模型保存在单独的数据目录中。

```bash
curl -fL --retry 3 -o remote-viewer.tar.gz https://github.com/xiaoyu397/remote-viewer/releases/latest/download/remote-viewer.tar.gz
tar -xzf remote-viewer.tar.gz
node remote-viewer/server.mjs --root /data --port 8080
```

将 `/data` 替换为模型目录。也可以从 [GitHub Releases](https://github.com/xiaoyu397/remote-viewer/releases) 下载指定版本和 SHA-256 校验文件。服务器 GPU 渲染使用系统 Chromium 和 GPU 驱动；视频转码和检查点预览分别使用已有的 FFmpeg 和 Python/PyTorch 环境。

### Requirements

- Node.js 22.4 或更高版本。仅从源码构建时需要 npm。
- 支持 WebGL2 的现代浏览器，建议启用硬件加速。
- FFmpeg（可选，用于兼容视频播放），需要包含 libx264 和 AAC 编码器。

### 检查点参数预览

服务器上的 `python3` 需要安装 PyTorch 2.6 或更高版本（CPU 版即可）。若训练环境已有 PyTorch，可在启动 Remote Viewer 时指定其解释器：

```bash
CHECKPOINT_PYTHON=/path/to/venv/bin/python npm start -- --root /data
```

点击 `.pt` 或 `.pth` 即可查看张量表。嵌套检查点使用完整路径显示模型权重、缓冲区和优化器张量。预览使用 `weights_only=True` 和 `FakeTensorMode`，浏览器仅接收元数据。每个文件最多列出前 10,000 个张量。包含自定义 Python 对象的检查点可能需要先导出模型的 `state_dict`。

### 从源码构建

```bash
git clone https://github.com/xiaoyu397/remote-viewer.git
cd remote-viewer
npm install
npm run build
```

网络受限时，可尝试使用 npm 镜像：

```bash
npm install --registry=https://registry.npmmirror.com --prefer-offline --no-audit --no-fund
npm run build
```

### Start the server

```bash
npm start -- --root /data --port 8080
```

将 `/data` 替换为实际需要预览的服务器目录。默认仅监听服务器本地地址。

| Argument | Default | Description |
| --- | --- | --- |
| `--root` | `.` | 文件浏览根目录 |
| `--port` | `8080` | HTTP 服务端口 |
| `--host` | `127.0.0.1` | 服务监听地址 |
| `--no-server-gpu` | 关闭此选项 | 禁用服务器 GPU 渲染，仅使用本机浏览器 |

### Remote access

推荐通过 SSH 端口转发访问。在本地电脑执行：

```bash
ssh -N -L 8080:127.0.0.1:8080 user@server
```

随后打开 [http://localhost:8080](http://localhost:8080)。

使用 VS Code Remote SSH 时，也可以在 **Ports** 面板转发服务器的 8080 端口，并在浏览器中打开。

## 同时查看多个 3DGS 模型

依次点击文件树中的 `.ply` 或其他支持的高斯模型，每个文件都会打开独立视窗。每个视窗有自己的相机和工具栏，点击标题或画面即可选中。切到其他文件再返回时会保留模型和视角。用标签上的 × 关闭视窗并释放资源。模型数量越多，显存需求越高。

首次打开模型时默认使用服务器 GPU。如果服务器无法建立渲染会话或视窗名额已满，默认模式会提示并自动切换到本机 GPU。在配有 GPU 的 Linux 服务器上，可安装支持硬件 WebGL2 的 Chromium 和相应的 EGL/OpenGL 驱动，以有 GPU 访问权限、可运行 Chromium 沙箱的普通用户启动服务：

```bash
npm install
npm run build
npm start -- --root /data --port 8080
```

默认浏览器路径为 `/usr/bin/chromium`，其他位置可设置 `GPU_CHROMIUM`。可用视窗的 **渲染** 菜单手动切换 GPU；同一浏览器标签页内新开的模型会沿用最近一次手动选择。显式选择服务器 GPU 后，连接失败时会显示错误并提供重试。服务器读取模型，在服务器 GPU 上绘制后通过当前 HTTP 连接回传 JPEG 帧，支持沿用 SSH 端口转发。每个服务实例最多同时使用 4 个远程视窗，单窗帧率上限约 12 帧/秒，最长边 1600 像素。空闲约 90 秒后回收会话，恢复预览时会重新加载。实际流畅度取决于模型、服务器和网络延迟。

## Gaussian Splatting Controls

| Control | Action |
| --- | --- |
| Origin / 原点视角 | 相机回到 (0, 0, 0)，恢复默认朝向和 90° 垂直 FOV |
| Global / 全局视角 | 自动适配模型范围并进入环绕模式 |
| First Person / 第一人称 | 保持当前位置，切换到自由漫游 |
| Mouse drag | 第一人称下原地旋转相机；环绕模式下绕目标观察 |
| W / S | 沿相机朝向前进 / 后退 |
| A / D | 左移 / 右移 |
| Q / E | 沿世界 Y 轴下降 / 上升 |
| Shift | 四倍移动速度 |
| Mouse wheel | 第一人称下调节 FOV；环绕模式下缩放 |
| FOV slider | 调节垂直视场角，20°–120° |
| Flip / 翻转 | 绕 X 轴翻转模型 |
| Fullscreen | 全屏查看 |

键盘移动在第一人称模式下生效。若快捷键无效，请先点击渲染窗口。

默认原点视角采用 Three.js 坐标约定（朝向 -Z，上方 +Y）。标准 GS PLY 通常不包含初始相机位姿，因此原点不一定等于训练相机位置；如视图不正确，请尝试全局视角或翻转模型。

## Video Compatibility

V4.0 引入 FFmpeg 兼容播放机制：

1. 优先尝试浏览器原生播放。
2. 解码失败时自动请求兼容转码，也可手动点击 **兼容播放 (FFmpeg)**。
3. 在服务器 CPU 上转换为 H.264 / YUV420P 视频及 AAC 音频（若存在音轨）。
4. 转码完成后使用 HTTP Range 播放，并在当前服务进程中复用缓存。

检查 FFmpeg：

```bash
ffmpeg -version
```

Ubuntu / Debian 安装示例：

```bash
sudo apt install ffmpeg
```

也可以通过环境变量 `FFMPEG` 指定可执行文件路径。

当前版本限制同时运行一个转码任务，单任务超时为两小时。缓存位于服务启动时打印的系统临时目录；停止服务后可手动删除该目录。首次兼容播放需要等待转码完成，原始文件不会被覆盖。

## Project Structure

```text
remote-viewer/
├── index.html        # 主界面
├── app.js            # 文件浏览、标签页及媒体预览
├── src.js            # GS 渲染及相机控制
├── server.mjs        # HTTP 服务及文件访问
├── transcode.mjs     # FFmpeg 转码与缓存
├── pano.html         # 独立全景预览页面
├── public/
│   └── pano.html     # 集成全景预览页面
├── package.json      # npm 依赖与启动脚本
└── README.md
```

**Technology stack:** Node.js · Express · Vite · Three.js · Spark · WebGL2 · FFmpeg

## Updating

**免安装版**：点击页面右上角 **检查更新 → 更新并重启**。新版从官方 GitHub Release 下载，经 SHA-256 校验后安装到程序目录下的 `.updates/`。服务沿用原来的模型目录、端口及其他启动参数；新版启动失败时，启动器会重新运行旧版。之后仍使用原来的 `node remote-viewer/server.mjs` 命令启动。

在线安装适用于可写的免安装版程序目录，服务器需要 `curl`、`tar` 并能访问 GitHub。使用默认本机监听地址，从服务器本机或通过 SSH 端口转发访问 localhost，即可安装。其他访问方式可在页面中检查版本和查看发布说明。

**首次升级到带更新按钮的版本**：先将最新免安装包解压到一个新目录，停止旧服务，使用相同的模型目录和端口从新目录启动。

**源码安装**：依赖变更时先执行 `npm ci`，然后构建并重启。

```bash
git pull
npm run build
```



## Security & Limitations

- 当前版本没有登录认证，不应直接暴露至公网；推荐使用 SSH 隧道或受信任的访问环境。
- 文件浏览为只读，服务端限制真实路径位于指定根目录内，并隐藏点文件。仍应只将允许访问的数据放在该根目录下。
- 大型 GS 模型的加载性能取决于网络带宽、本地浏览器内存和 GPU 能力。
- 图片、音频及模型的特殊编码可能无法解码；视频兼容播放需要可用的 FFmpeg。
- 当前版本尚未完成全面的真实浏览器端集成测试。

## Contributing

欢迎通过 [Issues](https://github.com/xiaoyu397/remote-viewer/issues) 提交问题、功能建议及复现信息，也欢迎提交 Pull Requests。

## License

当前仓库尚未声明许可证。公开可见不代表已授予自由使用、修改或再分发的许可。
