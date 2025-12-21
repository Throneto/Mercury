# Mercury

液态金属（水银）效果 WebGL 移动端交互体验。

## 功能特性

- 🌊 **流动效果**：基于 Simplex Noise 的有机波浪动画
- 📷 **摄像头反射**：使用手机摄像头作为环境贴图，模拟金属反射
- 📱 **陀螺仪交互**：倾斜手机，液体顺着重力方向流动
- 👆 **触摸磁力**：触摸屏幕产生磁力吸引效果
- ✨ **菲涅尔效果**：边缘高光模拟玻璃/金属质感

## 技术栈

- **Three.js** - WebGL 渲染引擎
- **GLSL** - 自定义顶点/片段着色器
- **Vite** - 构建工具

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

然后在浏览器打开 `http://localhost:5173`

### 移动设备测试

由于摄像头和陀螺仪需要安全上下文，移动设备测试需要 HTTPS 或 localhost：

1. 使用 ngrok：`ngrok http 5173`
2. 或启用 HTTPS：修改 `vite.config.js` 中 `https: true`

## 项目结构

```
Mercury/
├── index.html          # 主页面
├── styles.css          # 样式
├── package.json        # 依赖配置
├── vite.config.js      # Vite 配置
└── src/
    ├── main.js         # 主程序入口
    ├── shaders/
    │   ├── vertex.glsl   # 顶点着色器（波浪、变形）
    │   └── fragment.glsl # 片段着色器（反射、菲涅尔）
    └── utils/
        ├── camera.js   # 摄像头工具
        ├── sensors.js  # 陀螺仪工具
        └── touch.js    # 触摸交互
```

## 授权

MIT License
