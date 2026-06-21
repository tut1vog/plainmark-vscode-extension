# HTMLBlock — `<script>` / `<pre>` / `<style>` (CommonMark §4.6 type 1)

A `<script>` block (type 1 — terminates on closing tag):

<script>
  console.log('hello from a markdown HTML block');
  const x = 1 + 2;
</script>

A `<pre>` block:

<pre>
  preformatted text inside a block
</pre>

A `<style>` block:

<style>
  .x { color: red; }
</style>

Plain prose after.
