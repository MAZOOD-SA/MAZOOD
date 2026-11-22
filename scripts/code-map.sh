#!/usr/bin/env bash
# خريطة الكود (Graphify): تبني رسم لكل الملفات والدوال وعلاقاتها في graphify-out/.
# الهدف: Claude Code (أو أي مبرمج) يقرأ الخريطة بدل ما يفتح ملفات كثيرة، فيقل استهلاك التوكن.
# البناء محلي بالكامل (تحليل الكود بـ tree-sitter)، وما يرسل الكود لأي خدمة، وما يكلّف شي.
# الأمر: pnpm map
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v graphify >/dev/null 2>&1; then
  echo "graphify مو مثبّت. ثبّته مرة وحدة بالأمر:"
  echo "  pipx install graphifyy==0.9.115    (أو: pip install graphifyy==0.9.115)"
  exit 1
fi

graphify update . --force
# --no-label: ما نستخدم أي نموذج ذكاء اصطناعي لتسمية المجموعات (يحتاج مفتاح ويكلّف).
graphify cluster-only . --no-label --no-viz
echo "تم. اقرأ graphify-out/GRAPH_REPORT.md، أو اسأل: graphify query \"سؤالك\""
