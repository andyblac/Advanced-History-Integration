export const panelStyles = `
  :host { display:block; min-height:100%; color:var(--primary-text-color); background:var(--primary-background-color); }
  * { box-sizing:border-box; }
  button, input { font:inherit; }
  .appbar {
    height:var(--header-height,64px); padding:0 20px; display:flex; align-items:center; gap:14px;
    color:var(--app-header-text-color,white); background:var(--app-header-background-color,var(--primary-color));
    box-shadow:0 2px 4px rgba(0,0,0,.18); position:sticky; top:0; z-index:5;
  }
  .appbar h1 { margin:0; font-size:20px; font-weight:500; }
  .appbar .spacer { flex:1; }
  .icon-button { width:40px; height:40px; padding:8px; border:0; border-radius:50%; display:grid; place-items:center; cursor:pointer; color:inherit; background:transparent; }
  .icon-button:hover { background:rgba(255,255,255,.12); }
  .icon-button:disabled { opacity:.38; cursor:default; }
  .icon-button:disabled:hover { background:transparent; }
  .content { max-width:1400px; margin:auto; padding:0 16px 104px; }
  .filters { display:flex; align-items:flex-start; gap:16px; margin-bottom:16px; }
  .energy-nav-floating {
    position:fixed; z-index:20; left:16px; right:16px; bottom:max(12px,env(safe-area-inset-bottom));
    width:min(600px,calc(100vw - 32px)); margin-inline:auto;
    filter:drop-shadow(0 3px 8px rgba(0,0,0,.28));
  }
  .energy-nav-floating > * {
    display:block; width:100%; height:56px !important; min-height:0; max-height:56px;
    --ha-card-border-radius:28px;
  }
  .target-picker {
    flex:1; min-height:56px; padding:7px 10px; border:1px solid var(--divider-color); border-radius:4px;
    background:var(--card-background-color); display:flex; align-items:center; flex-wrap:wrap; gap:7px; cursor:text;
  }
  .native-target-picker { flex:1; min-width:0; }
  .native-target-picker ha-target-picker { display:block; width:100%; --ha-space-3:4px; }
  .native-picker-status {
    min-height:56px; padding:0 12px; display:flex; align-items:center;
    color:var(--secondary-text-color); border:1px solid var(--divider-color); border-radius:4px;
    background:var(--card-background-color);
  }
  .target-picker:hover { border-color:var(--primary-text-color); }
  .target-label { width:100%; color:var(--secondary-text-color); font-size:12px; line-height:14px; }
  .chip {
    height:32px; max-width:270px; padding:0 5px 0 9px; display:flex; align-items:center; gap:7px;
    border-radius:16px; color:var(--primary-text-color); background:var(--secondary-background-color); font-size:14px;
  }
  .chip ha-icon { width:18px; height:18px; color:var(--primary-color); }
  .chip-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .chip button { width:25px; height:25px; border:0; border-radius:50%; display:grid; place-items:center; padding:3px; cursor:pointer; color:var(--secondary-text-color); background:transparent; }
  .chip button:hover { background:var(--divider-color); }
  .chip button ha-icon { width:17px; height:17px; color:inherit; }
  .add-target {
    height:34px; padding:0 11px; border:0; border-radius:17px; display:flex; align-items:center; gap:6px;
    cursor:pointer; color:var(--primary-color); background:transparent; font-weight:500;
  }
  .add-target:hover { background:var(--secondary-background-color); }
  .add-target ha-icon { width:19px; height:19px; }
  .charts { display:grid; gap:16px; }
  .charts[hidden] { display:none; }
  .graph-shell { position:relative; min-width:0; }
  .graph-shell > statistics-graph-chart-card { display:block; }
  .data-source-indicator {
    position:absolute; z-index:2; top:12px; right:46px; min-height:24px; padding:0 9px; display:inline-flex; align-items:center;
    border:1px solid var(--divider-color); border-radius:12px; color:var(--secondary-text-color);
    max-width:calc(100% - 150px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    background:var(--card-background-color); box-shadow:0 1px 2px rgba(0,0,0,.16); font-size:11px; line-height:1; cursor:help;
  }
  .data-source-indicator.history { color:var(--primary-color); border-color:var(--primary-color); }
  .data-source-indicator.statistics { color:var(--success-color,#43a047); border-color:var(--success-color,#43a047); }
  .data-source-indicator.mixed { color:var(--warning-color,#ffa600); border-color:var(--warning-color,#ffa600); }
  .compare-banner { margin:-4px 0 16px; }
  .compare-banner[hidden] { display:none; }
  .loading-banner {
    min-height:48px; margin:0 0 16px; padding:8px 14px; display:flex; align-items:center; gap:12px;
    color:var(--primary-text-color); background:var(--card-background-color);
    border-left:4px solid var(--primary-color); border-radius:4px;
    box-shadow:var(--ha-card-box-shadow,none);
  }
  .loading-banner[hidden] { display:none; }
  .loading-banner ha-circular-progress { --mdc-theme-primary:var(--primary-color); flex:0 0 auto; }
  .detail-banner {
    min-height:48px; margin:0 0 16px; padding:8px 10px 8px 14px; display:flex; align-items:center; gap:12px;
    color:var(--primary-text-color); background:var(--card-background-color);
    border-left:4px solid var(--primary-color); border-radius:4px; box-shadow:var(--ha-card-box-shadow,none);
  }
  .detail-banner[hidden] { display:none; }
  .detail-banner.warning { border-left-color:var(--warning-color,#ffa600); }
  .detail-banner ha-icon { flex:0 0 auto; color:var(--primary-color); }
  .detail-banner.warning ha-icon { color:var(--warning-color,#ffa600); }
  .detail-banner span { flex:1; min-width:0; line-height:1.35; }
  .detail-banner ha-button { flex:0 0 auto; }
  .start, .error {
    padding:32px 16px; color:var(--secondary-text-color); text-align:center;
    background:var(--card-background-color); border-radius:var(--ha-card-border-radius,12px);
  }
  .start ha-icon, .error ha-icon { width:42px; height:42px; margin-bottom:8px; opacity:.65; }
  .start p, .error p { margin:4px auto; max-width:680px; line-height:1.5; }
  .error { color:var(--error-color); border:1px solid var(--error-color); }
  .dependency-error { margin-top:16px; }
  .dependency-error h2 { margin:2px 0 8px; color:var(--primary-text-color); font-size:20px; font-weight:500; }
  .dependency-error > p { color:var(--secondary-text-color); }
  .dependency-actions { margin-top:20px; display:flex; justify-content:center; flex-wrap:wrap; gap:10px; }
  .dependency-actions a, .dependency-actions button {
    min-height:40px; padding:0 16px; display:inline-flex; align-items:center; justify-content:center; gap:8px;
    border:1px solid var(--primary-color); border-radius:20px; cursor:pointer; color:var(--primary-color);
    background:transparent; font:inherit; font-weight:500; text-decoration:none;
  }
  .dependency-actions a.primary { color:var(--text-primary-color,white); background:var(--primary-color); }
  .dependency-actions a ha-icon, .dependency-actions button ha-icon { width:18px; height:18px; margin:0; opacity:1; }
  .dependency-actions button:disabled { opacity:.55; cursor:default; }
  .notice { margin:0 0 12px; padding:10px 12px; color:var(--warning-color); background:var(--card-background-color); border-left:4px solid var(--warning-color); }
  .backdrop { position:fixed; inset:0; z-index:100; display:grid; place-items:center; padding:20px; background:rgba(0,0,0,.54); }
  .dialog {
    width:min(680px,100%); height:min(760px,90vh); display:flex; flex-direction:column; overflow:hidden;
    color:var(--primary-text-color); background:var(--card-background-color); border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.35);
  }
  .library-save { padding:14px 18px; display:flex; gap:10px; border-bottom:1px solid var(--divider-color); }
  .library-save input { flex:1; min-width:0; height:42px; padding:0 12px; color:var(--primary-text-color); background:var(--secondary-background-color); border:1px solid var(--divider-color); border-radius:8px; }
  .library-save button, .library-row button { min-width:40px; height:40px; padding:0 12px; border:0; border-radius:8px; cursor:pointer; color:var(--primary-color); background:transparent; font-weight:500; }
  .library-save button { color:var(--text-primary-color,white); background:var(--primary-color); }
  .library-list { flex:1; min-height:0; overflow:auto; padding:10px; }
  .library-row { min-height:64px; padding:8px 8px 8px 14px; display:flex; align-items:center; gap:8px; border-radius:8px; }
  .library-row:hover { background:var(--secondary-background-color); }
  .library-main { flex:1; min-width:0; border:0; padding:0; cursor:pointer; color:var(--primary-text-color); background:transparent; text-align:left; }
  .library-name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
  .library-summary { display:block; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--secondary-text-color); font-size:12px; }
  .library-row .delete { width:40px; padding:8px; color:var(--secondary-text-color); }
  .library-row .update { width:40px; padding:8px; color:var(--primary-color); }
  .library-empty { padding:40px 20px; color:var(--secondary-text-color); text-align:center; }
  .dialog-title { min-height:64px; padding:0 24px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--divider-color); }
  .dialog-title h2 { margin:0; font-size:20px; font-weight:500; }
  .dialog-title .count { margin-left:auto; color:var(--secondary-text-color); font-size:13px; }
  .tabs { height:48px; padding:0 16px; display:flex; gap:2px; border-bottom:1px solid var(--divider-color); }
  .tab { padding:0 18px; border:0; border-bottom:2px solid transparent; cursor:pointer; color:var(--secondary-text-color); background:transparent; }
  .tab.active { color:var(--primary-color); border-bottom-color:var(--primary-color); }
  .search-wrap { padding:14px 18px; }
  .search { width:100%; height:44px; padding:0 14px; color:var(--primary-text-color); background:var(--secondary-background-color); border:1px solid var(--divider-color); border-radius:8px; }
  .target-list { flex:1; min-height:0; overflow:auto; padding:0 10px 10px; }
  .target-row { min-height:52px; padding:6px 10px; display:grid; grid-template-columns:28px 34px minmax(0,1fr); align-items:center; gap:8px; border-radius:8px; cursor:pointer; }
  .target-row:hover { background:var(--secondary-background-color); }
  .target-row input { width:19px; height:19px; accent-color:var(--primary-color); }
  .target-row ha-icon { color:var(--state-icon-color,var(--secondary-text-color)); }
  .row-name { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .row-secondary { display:block; margin-top:2px; color:var(--secondary-text-color); font-size:12px; }
  .no-results { padding:28px; color:var(--secondary-text-color); text-align:center; }
  .dialog-actions { min-height:64px; padding:10px 18px; display:flex; align-items:center; justify-content:flex-end; gap:8px; border-top:1px solid var(--divider-color); }
  .dialog-actions button { min-width:84px; height:40px; padding:0 14px; border:0; border-radius:8px; cursor:pointer; color:var(--primary-color); background:transparent; font-weight:500; }
  .dialog-actions button.primary { color:var(--text-primary-color,white); background:var(--primary-color); }
  .diagnostics-dialog { max-width:900px; }
  .diagnostics-note { padding:14px 24px; color:var(--secondary-text-color); border-bottom:1px solid var(--divider-color); }
  .diagnostics-preview { flex:1; min-height:0; margin:0; padding:18px 24px; overflow:auto; color:var(--primary-text-color); background:var(--primary-background-color); font:13px/1.5 var(--code-font-family,monospace); white-space:pre; tab-size:2; }
  @media (max-width:900px) {
    .filters { flex-direction:column; gap:8px; }
    .target-picker { width:100%; min-width:0; }
  }
  @media (max-width:600px) {
    .content { padding:0 12px 96px; }
    .detail-banner { align-items:flex-start; flex-wrap:wrap; }
    .detail-banner span { flex:1 1 calc(100% - 40px); }
    .detail-banner ha-button { margin-inline-start:36px; }
    .energy-nav-floating { left:8px; right:8px; bottom:max(8px,env(safe-area-inset-bottom)); width:calc(100vw - 16px); }
    .appbar { padding:0 4px; gap:0; }
    .appbar h1 { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:16px; }
    .appbar .icon-button { flex:0 0 40px; }
    .dialog { height:100%; border-radius:0; }
    .backdrop { padding:0; }
    .dialog-title { padding:0 14px; }
    .tab { flex:1; padding:0 4px; }
    .chip { max-width:230px; }
  }
`;
