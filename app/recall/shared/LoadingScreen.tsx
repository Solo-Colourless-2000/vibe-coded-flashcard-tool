

export function LoadingScreen() {
  return (
    <main aria-busy="true" className="app-loading">
      <div aria-hidden="true" className="loading-brand">
        <span className="brand-mark">R</span>
        <span>TOTAL RECALL</span>
      </div>
      <span className="visually-hidden" role="status">
        保存した学習セットを読み込んでいます
      </span>
    </main>
  );
}
