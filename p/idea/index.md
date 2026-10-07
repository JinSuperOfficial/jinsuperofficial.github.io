---
title: 奇思妙想 · 索引
date: 2026-10-07
author: JinSuper
category: 奇思妙想
tags: [索引]
summary: 想到什么写什么，写完就搁在这儿。这里按时间收着，点开卡片就是读一篇。
---
# 奇思妙想

想到什么写什么，写完就搁在这儿。

<card link="idea/3.枣香童年.md" date="2026.10.6">枣香童年</card>
<card link="archive/2.ScreenOff.html" date="2026.10.4">Screen Off, To the Real World</card>
<card link="archive/idea/1.归途且慢.html" date="2026.9.27">归途，且慢</card>

## 卡片语法

正文里写一行，就能得到一张卡片：

```html
<!-- 行内卡片 -->
<card link="idea/3.枣香童年.md">枣香童年</card>

<!-- 带日期的卡片 -->
<card link="idea/3.枣香童年.md" date="2026.10.6">枣香童年</card>
```

- `link` 必填：写文件路径（按网站根算，比如 `idea/xxx.md`），点开时自动用文档站打开这一篇；写 `https://…` 外链就原样跳转
- `date` 选填，写了才有下面那行等宽小字
- 标签里的文字就是标题；同一段里可以并排放好几张，互不影响
- 左边那条橙色竖条默认藏着，鼠标移上去或者键盘 Tab 聚焦时才亮起来

## 怎么加一篇

正文顶上写一段 frontmatter（标题 / 日期 / 标签 / 摘要），再把这一篇登记进清单就行。
字段表与产物说明见 [写作指南：博客与 Frontmatter](blog.md)。
