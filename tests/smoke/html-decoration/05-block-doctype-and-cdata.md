# HTMLBlock fallthrough — DOCTYPE (type 4) and CDATA (type 5)

`<!DOCTYPE>` declaration (type 4):

<!DOCTYPE html>

`<!DOCTYPE>` with attributes:

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">

CDATA block (type 5 — XHTML/SVG/MathML context):

<![CDATA[
some opaque text
that includes < and > and & without escaping
]]>

All three render with the same `.plainmark-html-block` chrome family — `docs/spec/html.md` ("DOCTYPE styling" + "CDATA styling").
