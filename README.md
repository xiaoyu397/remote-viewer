# Remote Viewer V3
在旧项目中覆盖 index.html、src.js、server.mjs，新增 app.js 与 public/pano.html，依赖不变。已有 node_modules 无需 npm install。
首次安装：npm install；构建：npm run build；启动：npm start -- --root /data/gs --port 8080
默认 127.0.0.1，推荐 SSH 转发：ssh -L 8080:127.0.0.1:8080 user@server ，访问 http://localhost:8080 。未提供认证，不要暴露公网；根目录应只包含可供预览的文件。只读，隐藏文件不列出，目录外真实路径拒绝访问。
支持多级树、折叠、已展开目录筛选、标签页、下载。GS 保留原点/全局/第一人称及 WASDQE、Shift、FOV。普通图片可手动切换全景（2:1 等距柱状图）；视频音频使用浏览器原生解码及 Range；文本 UTF-8 前 2 MiB，只读。特殊格式/编码依赖浏览器，不提供转码。前端仍需旧版 npm 依赖构建。未进行真实浏览器渲染测试。

## V4 视频兼容播放
保留 V3 的 node_modules，覆盖 index.html、app.js、server.mjs，新增 transcode.mjs，再 npm run build 并重启服务。无需新增 npm 依赖。服务器需安装带 libx264 和 AAC 编码器的 FFmpeg。原生播放失败自动转码，或点击兼容播放。CPU 转码完成后播放，支持 Range；单任务并发，最长两小时。缓存位于启动时打印的临时目录，仅当前进程复用，停止服务后可手动删除该目录以释放磁盘。原文件不变。默认仅本地监听，不要直接暴露公网。
