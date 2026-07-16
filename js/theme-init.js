/* ちらつき防止のため、CSS読込前に保存済みテーマを適用する。
   CSP(スクリプト制限)と両立させるためインライン<script>ではなく外部ファイルにしている。 */
(function () {
  try {
    var t = localStorage.getItem('aml_theme');
    if (!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
  } catch (e) { document.documentElement.dataset.theme = 'dark'; }
})();
