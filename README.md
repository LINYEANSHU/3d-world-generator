<p align="center">简体中文 · <a href="README.en.md">English</a></p>

<p align="center">
  <img src="./assets/readme/hero.zh.svg" width="100%" alt="方块世界生成器：用种子生成山脉、河流、森林与村庄的浏览器体素世界">
</p>

**输入一粒种子，生成一座可以环绕观察、飞行探索的方块世界。**
地形、植被、村庄和像素纹理都在浏览器本地生成；调整参数，再用校验和比较结果。

![当前桌面界面：种子 2026 生成的河流、树林与村庄，以及生成参数和校验和](assets/readme/current-desktop.png)

<details>
<summary>查看移动端界面</summary>

<img src="assets/readme/current-mobile.png" width="390" alt="移动端界面：体素世界上方的观察区域与底部可滚动参数面板">

</details>

[![CI](https://github.com/LINYEANSHU/3d-world-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/LINYEANSHU/3d-world-generator/actions/workflows/ci.yml)
[MIT](LICENSE) · Three.js r160 · 无构建步骤 · 中文 / English

## 从种子到世界

- **可复现地形**：同一版本、相同种子与生成参数得到相同体素数据，面板显示校验和。
- **可调整风景**：改变地形起伏、水位、植被密度、村庄目标数量与世界大小。
- **可分享参数**：链接的 URL hash 保存种子与生成参数，打开后自动生成；天空氛围单独选择。
- **可自由观察**：鼠标环绕、平移、缩放；桌面端可切到第一人称飞行。
- **三种氛围**：白昼、黄昏、阴雨只改变天空、雾与光照。

## 本地运行

克隆仓库，在项目目录启动静态服务器（需要 Python 3）：

```bash
git clone https://github.com/LINYEANSHU/3d-world-generator.git
cd 3d-world-generator
python -m http.server 8137 --bind 127.0.0.1
```

打开 **http://127.0.0.1:8137**。Windows 也可以双击 `start.bat`，脚本会依次寻找 Python、`py` 或 Node.js 的 `npx`。

页面使用 ES Modules 与 import map，需要通过 HTTP 访问。Three.js 和控制器已随仓库附带，使用 Python 启动时无需下载运行时资源。

### 第一次生成

1. 保留默认种子 `2026`，等待世界生成。
2. 左键拖动旋转、右键拖动平移、滚轮缩放，查看村庄与河流。
3. 改变一个生成参数，再点「生成世界」，比较景观与校验和。
4. 点击链接按钮复制参数链接；接收者需能访问链接对应的部署地址，`127.0.0.1` 只指向自己的电脑。

## 操作与参数

| 操作 | 方式 |
| --- | --- |
| 生成 / 随机种子 | 输入后按回车或点「生成世界」 / 骰子按钮 |
| 复制种子 / 参数链接 | 种子旁的剪贴板 / 链接按钮 |
| 飞行 | `F` 或飞行按钮；`WASD` 移动，`Space` / `Shift` 升降，`Esc` 退出 |
| 自动环绕 / 天空 / 语言 | 面板复选框 / 下拉框 / 语言按钮 |

| 参数 | 可选范围 | 默认值 |
| --- | --- | --- |
| 地形起伏 | 0–2，步长 0.1 | 1.0 |
| 水位偏移 | −3–4，步长 1 | 0 |
| 植被密度 | 0–2，步长 0.1 | 1.0 |
| 村庄目标数量 | 0–3 | 2 |
| 世界边长 | 96 / 128 / 160 / 192 方块 | 128 |

## 生成方式

`种子 → 噪声高度场 → 河湖与地表 → 植被和建筑 → 分块网格 → Three.js`

高度场结合 fBm 与山脊噪声，河湖雕刻后按高度和坡度分配地表。结构生成器为村庄寻找平坦位置，再放置树木、了望塔与遗迹。16×16 区块进行内部面剔除、顶点 AO 和网格合并，花草等重复物体使用实例化绘制。

| 源码 | 职责 |
| --- | --- |
| [generator.js](js/generator.js) / [structures.js](js/structures.js) | 地形与结构生成 |
| [world.js](js/world.js) / [mesher.js](js/mesher.js) | 体素存储与网格化 |
| [scene.js](js/scene.js) / [main.js](js/main.js) | 渲染、相机、界面与分享 |
| [atlas.js](js/atlas.js) / [i18n.js](js/i18n.js) | 程序化纹理与双语文案 |

## 开发检查

CI 使用 Node.js 22 对 `js/` 下全部脚本执行语法检查；PowerShell 可运行：

```powershell
Get-ChildItem js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE) { throw $_.FullName } }
```

语法检查不验证 WebGL 渲染、生成耗时或跨浏览器表现。

## 适用范围

现代浏览器需要支持 WebGL、ES Modules 与 import map。世界大小会影响内存、生成时间和帧率；村庄数量取决于可用选址。飞行使用键盘与 Pointer Lock，触屏设备更适合环绕观察。项目用于生成和探索有限体素场景，未提供方块编辑或存档文件导出。

## 贡献者

- [LINYEANSHU](https://github.com/LINYEANSHU)

## 许可证与第三方说明

[MIT](LICENSE) © 2026 LINYEANSHU。

`lib/three.module.min.js` 与 `lib/OrbitControls.js` 来自 [Three.js r160](https://github.com/mrdoob/three.js/tree/r160)，采用 MIT 许可证，版权归 Three.js 作者。视觉风格受 Minecraft 启发；项目与 Mojang / Microsoft 无关，纹理由 Canvas 生成，不含其游戏素材。
