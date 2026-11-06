---
name: 方块世界生成器
description: 浅苔色控制面板与森林绿操作，保留体素世界的观察空间
colors:
  panel: "#f0f4e9"
  field: "#fffdf7"
  border: "#ccd8c7"
  ink: "#233c2b"
  dim: "#51664e"
  accent: "#416b40"
  accent-strong: "#315535"
typography:
  body:
    fontFamily: "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "12px"
rounded:
  panel: "14px"
  field: "9px"
  button: "10px"
spacing:
  panel: "18px"
  mobile-panel: "14px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    padding: "10px"
    rounded: "10px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    padding: "18px"
    rounded: "14px"
---

# Design System: 方块世界生成器

## Overview

浅苔色面板浮在全屏体素世界之上；森林绿承担生成操作、选中与焦点，深绿色文字保持参数可读。世界本身是主要影像。

记录依据：`css/style.css` 与 2026-11-06 已实现的界面调整；这里只描述当前视觉与响应式行为。

## Colors

浅苔面板与暖白输入区承载控件；森林绿用于主行动和选区，深绿墨与草木色次级文字形成清晰层级。

## Typography

界面使用系统中文无衬线字族；标题为 15px / 650，控件约 12–13.5px。种子、世界名与统计值使用 Consolas / JetBrains Mono。

## Layout

桌面面板位于左上角（16px），宽 300px，内距 18px，可独立滚动；场景铺满视口。≤600px 面板改到下方（左右和底部各 10px），宽度为视口减 20px，最大高度 45dvh、内距 14px，保留上方观察区域。统计始终三列；种子输入可收缩，语言与辅助按钮最小高度 34px。

## Elevation & Depth

主面板通过实色底浮在场景上；`clip-path: inset(0 round 14px)` 明确软件 WebGL 上方滚动表面的裁切边界，避免矩形合成伪影。它保留滚动和圆角，但会裁去面板外侧阴影；原阴影声明仅在不支持 clip-path 的浏览器中作为回退。进度遮罩使用同族实色卡片。

## Shapes

主面板为 14px 圆角，输入与次操作为 9px，生成按钮为 10px；滑杆使用圆形拇指。

## Components

生成按钮使用森林绿底、白字；hover 提亮，生成中呈禁用态。种子输入与天空下拉框共用暖白底和浅绿边框。焦点为 2px 绿外圈（offset 3px）；减少动态效果设置压缩动画与过渡。

## Do's and Don'ts

- Do 保留全屏世界与可滚动参数面板的主次关系。
- Don't 为界面添加霓虹光晕或把面板改为纯灰。
