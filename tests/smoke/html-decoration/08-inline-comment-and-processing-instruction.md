# Inline Comment and ProcessingInstruction (CommonMark §6.6)

Mid-paragraph inline comment: before <!-- a quiet remark --> after.

Inline comment with content: text <!-- TODO: fix this later --> continues.

Two inline comments: first <!-- one --> middle <!-- two --> last.

Inline processing instruction: text <?php echo 'x'; ?> continues (vanishingly rare in user markdown).

Note: inline Comment and ProcessingInstruction are NOT covered by the `parseMixed` lang-html overlay (only block-level CommentBlock is). Inline `<!-- x -->` renders as styled monospace with NO inner-tag coloring. `docs/spec/html.md` "Gap".
