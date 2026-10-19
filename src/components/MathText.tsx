import React, { memo, useState } from 'react';
import { WebView } from 'react-native-webview';
import { toHtml, KATEX_CSS } from '../utils/latex';

/** Renders Bengali text + [LaTeX] with auto height. */
function MathText({ text, size = 16 }: { text: string; size?: number }) {
  const [h, setH] = useState(28);
  const html = `<!doctype html><html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <link rel="stylesheet" href="${KATEX_CSS}"/>
  <style>body{margin:0;font:${size}px/1.6 sans-serif;color:#14213D;background:transparent}
  .katex{font-size:1.05em}</style></head><body><div id="r">${toHtml(text)}</div>
  <script>const s=()=>window.ReactNativeWebView.postMessage(String(document.getElementById('r').getBoundingClientRect().height));
  window.onload=()=>{s();setTimeout(s,300)};</script></body></html>`;
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      scrollEnabled={false}
      style={{ height: h, backgroundColor: 'transparent' }}
      onMessage={(e) => setH(Math.ceil(Number(e.nativeEvent.data)) + 4)}
    />
  );
}
export default memo(MathText);
