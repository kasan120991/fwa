# Insights cover template (Highlighter)

`cover-template.html` renders a 1600×1000 article cover: linen ground, Geist 700
headline with a citrine `.paint` sweep on the key word, ghost glyph bottom-right,
eyebrow tag on top. Edit the `.tag`, `.q` text, `.paint` span, and `.ghost` glyph
per article, then:

  chrome --headless --screenshot=cover.png --window-size=1600,1000 --hide-scrollbars file://.../cover-template.html
  sips -s format jpeg -s formatOptions 88 cover.png --out cover.jpg

Upload via Directus Studio (Files) and set as the article's `cover`.
Public read on directus_files was added 2026-07-30 (assets 403'd before that).
