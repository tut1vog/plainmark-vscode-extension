# HTML block fixture

A generic block-level construct:

<div class="callout note">
  <p>Inner paragraph with <em>markdown</em> not parsed (CommonMark §4.6 type 6).</p>
  <ul>
    <li>Item one</li>
    <li>Item two</li>
  </ul>
</div>

A comment block:

<!--
multi-line
HTML comment
-->

A processing-instruction block:

<?php echo "hello"; ?>

Closing paragraph.
