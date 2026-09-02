export const panelStyles = `
  :host { display:block; min-height:100%; container-type:inline-size; color:var(--primary-text-color); background:var(--primary-background-color); }
  * { box-sizing:border-box; }
  button, input { font:inherit; }
  .appbar {
    height:var(--header-height,64px); padding:0 20px; display:flex; align-items:center; gap:4px;
    color:var(--app-header-text-color,white); background:var(--app-header-background-color,var(--primary-color));
    box-shadow:0 2px 4px rgba(0,0,0,.18); position:sticky; top:0; z-index:5;
  }
  .appbar h1 { margin:0 10px 0 0; font-size:20px; font-weight:500; }
  .appbar .spacer { flex:1; min-width:0; }
  .icon-button { width:40px; height:40px; padding:8px; border:0; border-radius:50%; display:grid; place-items:center; flex:0 0 40px; cursor:pointer; color:inherit; background:transparent; }
  .icon-button:hover { background:rgba(255,255,255,.12); }
  .icon-button:disabled { opacity:.38; cursor:default; }
  .icon-button:disabled:hover { background:transparent; }
  .icon-button[hidden] { display:none; }
  .panel-tabs-shell {
    align-self:stretch; min-width:0; width:0; display:flex; align-items:stretch; flex:1 1 auto;
  }
  .panel-tabs-shell + .spacer { flex:0 0 0; }
  .panel-tabs {
    min-width:0; width:0; display:flex; align-items:stretch; flex:1 1 auto; overflow-x:auto;
    scrollbar-width:none; scroll-snap-type:x proximity;
  }
  .panel-tabs::-webkit-scrollbar { display:none; }
  .panel-tabs-scroll {
    width:32px; padding:0; display:grid; place-items:center; flex:0 0 32px;
    border:0; color:inherit; background:transparent; cursor:pointer;
  }
  .panel-tabs-scroll:hover { background:rgba(255,255,255,.1); }
  .panel-tabs-scroll:disabled { opacity:.32; cursor:default; }
  .panel-tabs-scroll:disabled:hover { background:transparent; }
  .panel-tabs-scroll[hidden] { display:none; }
  .panel-tabs-scroll ha-icon { width:20px; height:20px; }
  .panel-tab {
    position:relative; max-width:240px; display:inline-flex; align-items:stretch; flex:0 0 auto; padding-right:30px;
    color:var(--app-header-text-color,white); opacity:.72; scroll-snap-align:start;
  }
  .panel-tab:not(:last-child)::before {
    content:""; position:absolute; z-index:1; top:12px; right:0; bottom:12px; width:2px;
    background:var(--divider-color);
  }
  .panel-tab.active { opacity:1; background:var(--secondary-background-color); }
  .panel-tab:hover, .panel-tab:focus-within { background:rgba(255,255,255,.1); }
  .panel-tab.active:hover, .panel-tab.active:focus-within { background:var(--secondary-background-color); }
  .panel-tab.dragging { opacity:.45; }
  .panel-tab.active::after {
    content:""; position:absolute; right:4px; bottom:0; left:4px; height:2px;
    background:var(--mdc-tab-indicator-active-indicator-color,var(--app-header-text-color,white)); border-radius:2px 2px 0 0;
  }
  .panel-tab-select, .panel-tab-close {
    box-sizing:border-box; height:100%; border:0; color:inherit; background:transparent; cursor:pointer;
  }
  .panel-tab-select {
    min-width:70px; max-width:210px; padding:0 5px 0 10px; overflow:hidden;
    text-overflow:ellipsis; white-space:nowrap; font-weight:500;
  }
  .panel-tab-name-input { width:min(150px,20vw); min-width:70px; height:30px; padding:0 6px; color:inherit; background:var(--card-background-color); border:1px solid var(--primary-color); border-radius:4px; outline:0; }
  .panel-tab-close { position:absolute; z-index:2; top:0; right:0; bottom:0; width:30px; padding:0; display:flex; align-items:center; justify-content:center; }
  .panel-tab-close:hover, .panel-tab-select:hover { background:transparent; }
  .panel-tab-close ha-icon { display:block; width:18px; height:18px; line-height:0; --mdc-icon-size:18px; }
  .content { max-width:1400px; margin:auto; padding:0 16px 104px; }
  .filters { display:flex; align-items:stretch; gap:12px; margin-top:var(--ha-space-2,8px); margin-bottom:16px; }
  .axis-target-group { flex:1 1 0; min-width:0; }
  .axis-target-group.axis-target-compact { flex:0 1 190px; }
  .axis-target-label {
    min-height:24px; margin:0 4px 4px; display:flex; align-items:center; gap:7px;
    color:var(--secondary-text-color); font-size:12px; font-weight:500;
  }
  .axis-badge {
    min-width:24px; padding:2px 6px; box-sizing:border-box; border-radius:10px;
    color:var(--text-primary-color,var(--primary-text-color)); background:var(--primary-color); text-align:center;
  }
  .axis-target-primary .axis-badge { background:var(--ha-color-green-80,var(--success-color)); }
  .axis-target-secondary .axis-badge { background:var(--primary-color); }
  .axis-target-secondary .axis-target-label { justify-content:flex-end; }
  .axis-compare-toggle {
    width:34px; height:24px; padding:3px 7px; display:grid; place-items:center;
    color:var(--switch-unchecked-button-color);
    background:var(--switch-unchecked-track-color);
    border:1px solid var(--switch-unchecked-button-color);
    border-radius:12px; cursor:pointer;
  }
  .axis-compare-toggle:hover { color:var(--primary-text-color); }
  .axis-compare-toggle.active { color:var(--text-primary-color,var(--primary-text-color)); background:var(--primary-color); border-color:var(--primary-color); }
  .axis-compare-toggle ha-icon { width:18px; height:18px; --mdc-icon-size:18px; }
  .axis-compare-toggle[hidden] { display:none; }
  .axis-target-divider { flex:0 0 1px; align-self:stretch; margin-top:28px; background:var(--divider-color); }
  .energy-nav-floating {
    position:fixed; z-index:20; left:16px; right:16px; bottom:max(12px,env(safe-area-inset-bottom));
    width:min(600px,calc(100vw - 32px)); margin-inline:auto;
    filter:drop-shadow(0 3px 8px rgba(0,0,0,.28));
  }
  .energy-nav-floating > .energy-date-controller {
    display:block; width:100%; height:56px !important; min-height:0; max-height:56px;
    --ha-card-border-radius:28px;
  }
  .panel-time-range {
    position:absolute; z-index:2; top:8px; left:50%; transform:translateX(-50%);
    height:40px; padding:0 9px; display:flex; align-items:center; gap:5px;
    color:var(--primary-text-color); background:var(--secondary-background-color);
    border:0; border-radius:20px; box-shadow:0 0 0 1px var(--divider-color); cursor:pointer;
  }
  .panel-time-range[hidden] { display:none; }
  .panel-time-range ha-icon {
    display:block; flex:0 0 18px; width:18px; height:18px; line-height:0;
    color:var(--secondary-text-color); transform:translateY(-3px);
  }
  .panel-time-range-value { min-width:105px; white-space:nowrap; font-weight:500; }
  @media (max-width:520px) {
    .panel-time-range { left:43%; padding:0 7px; gap:3px; }
    .panel-time-range ha-icon { display:none; }
    .panel-time-range-value { min-width:96px; }
  }
  .native-target-picker { flex:1; min-width:0; }
  .native-target-picker ha-target-picker { display:block; width:100%; }
  .native-picker-status {
    min-height:56px; padding:0 12px; display:flex; align-items:center;
    color:var(--secondary-text-color); border:1px solid var(--divider-color); border-radius:4px;
    background:var(--card-background-color);
  }
  .charts {
    position:relative; left:50%; width:calc(100vw - 32px); width:calc(100cqw - 32px);
    transform:translateX(-50%); display:grid; gap:16px;
  }
  .charts[hidden] { display:none; }
  .charts.dynamic-numeric { grid-template-rows:minmax(240px,1fr); }
  .charts.dynamic-numeric.has-state-graph { grid-template-rows:var(--numeric-graph-height,240px) auto; align-content:start; }
  .graph-shell { position:relative; min-width:0; }
  .charts.dynamic-numeric .graph-shell.numeric-graph { min-height:0; height:100%; }
  .graph-shell.state-controls-row { padding-top:44px; }
  .graph-shell > statistics-graph-chart-card { display:block; }
  .charts.dynamic-numeric .graph-shell.numeric-graph > statistics-graph-chart-card { height:100%; }
  .graph-card-editor {
    position:absolute; z-index:3; top:4px; right:8px;
  }
  .graph-shell.has-card-editor .data-source-indicator { right:88px; }
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
  .detail-banner .detail-dismiss {
    width:32px; height:32px; padding:6px; display:inline-grid; place-items:center; flex:0 0 auto;
    border:0; border-radius:50%; color:var(--secondary-text-color); background:transparent; cursor:pointer;
  }
  .detail-banner .detail-dismiss:hover { background:var(--secondary-background-color); }
  .detail-banner .detail-dismiss ha-icon { width:20px; height:20px; color:inherit; }
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
  .bookmark-user-tabs { min-height:48px; padding:0 12px; display:flex; gap:4px; overflow-x:auto; border-bottom:1px solid var(--divider-color); scrollbar-width:thin; }
  .bookmark-user-tabs button { position:relative; flex:0 0 auto; min-width:88px; padding:0 14px; border:0; color:var(--secondary-text-color); background:transparent; cursor:pointer; font:inherit; font-weight:500; }
  .bookmark-user-tabs button[aria-selected="true"] { color:var(--primary-text-color); }
  .bookmark-user-tabs button[aria-selected="true"]::after { content:""; position:absolute; right:8px; bottom:0; left:8px; height:2px; background:var(--primary-color); }
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
  .library-row .visibility { width:40px; padding:8px; color:var(--secondary-text-color); }
  .library-row .visibility.active { color:var(--primary-color); }
  .library-empty { padding:40px 20px; color:var(--secondary-text-color); text-align:center; }
  .dialog-title { min-height:64px; padding:0 24px 0 12px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--divider-color); }
  .dialog-title h2 { margin:0; font-size:20px; font-weight:500; }
  .dialog-title .count { margin-left:auto; color:var(--secondary-text-color); font-size:13px; }
  .dialog-close { width:40px; height:40px; padding:8px; display:grid; place-items:center; flex:0 0 auto; border:0; border-radius:50%; cursor:pointer; color:var(--primary-text-color); background:transparent; }
  .dialog-close:hover { color:var(--primary-text-color); background:var(--secondary-background-color); }
  .dialog-close ha-icon { width:22px; height:22px; }
  .target-list { flex:1; min-height:0; overflow:auto; padding:0 10px 10px; }
  .target-row { min-height:52px; padding:6px 10px; display:grid; grid-template-columns:28px 34px minmax(0,1fr); align-items:center; gap:8px; border-radius:8px; cursor:pointer; }
  .target-row:hover { background:var(--secondary-background-color); }
  .target-row input { width:19px; height:19px; accent-color:var(--primary-color); }
  .target-row ha-icon { color:var(--state-icon-color,var(--secondary-text-color)); }
  .row-name { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .row-secondary { display:block; margin-top:2px; color:var(--secondary-text-color); font-size:12px; }
  .dialog-actions { min-height:64px; padding:10px 18px; display:flex; align-items:center; justify-content:flex-end; gap:8px; border-top:1px solid var(--divider-color); }
  .dialog-actions button { min-width:84px; height:40px; padding:0 14px; border:0; border-radius:8px; cursor:pointer; color:var(--primary-color); background:transparent; font-weight:500; }
  .dialog-actions button.primary { color:var(--text-primary-color,white); background:var(--primary-color); }
  .dialog-actions button:disabled { opacity:.45; cursor:default; }
  .series-dialog { height:auto; max-height:min(680px,90vh); }
  .time-range-popover { --wa-space-l:0; z-index:19; }
  .time-range-popover::part(body) { width:310px; max-width:calc(100vw - 20px); padding:0; overflow:hidden; }
  .time-range-sheet { z-index:19; }
  .time-range-presets { padding:var(--ha-space-3,12px) var(--ha-space-3,12px) 0; display:flex; align-items:center; justify-content:center; gap:6px; }
  .time-range-presets button { min-width:38px; height:32px; padding:0 8px; border:0; border-radius:9px; color:var(--secondary-text-color); background:var(--secondary-background-color); font:inherit; font-size:13px; font-weight:500; cursor:pointer; }
  .time-range-presets button:hover { color:var(--primary-text-color); }
  .time-range-presets button.selected { color:var(--text-primary-color,white); background:var(--primary-color); }
  .time-range-fields { width:100%; box-sizing:border-box; padding:var(--ha-space-3,12px); display:grid; grid-template-columns:minmax(0,1fr) 30px minmax(0,1fr); align-items:end; gap:0; }
  .time-range-fields label { min-width:0; display:grid; gap:4px; color:var(--secondary-text-color); font-size:13px; }
  .time-range-fields ha-time-input { width:100%; color:var(--primary-text-color); font-size:16px; }
  .time-range-separator { justify-self:center; padding-bottom:18px; color:var(--secondary-text-color); font-size:20px; }
  .time-range-actions { padding:var(--ha-space-2,8px); display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--divider-color); }
  .time-range-primary-actions { display:flex; align-items:center; }
  .time-range-sheet .time-range-fields { width:min(310px,100%); margin:0 auto; box-sizing:border-box; }
  .series-note { margin:0; padding:16px 24px; color:var(--secondary-text-color); border-bottom:1px solid var(--divider-color); }
  .series-list { max-height:min(480px,60vh); padding-top:10px; }
  .series-row { grid-template-columns:28px 34px minmax(0,1fr); }
  .series-choice { border-radius:8px; }
  .series-choice:hover { background:var(--secondary-background-color); }
  .series-choice .series-row:hover { background:transparent; }
  .series-map { margin:-2px 12px 10px 80px; display:grid; gap:5px; color:var(--secondary-text-color); font-size:12px; }
  .series-map[hidden] { display:none; }
  .series-map input { min-width:0; height:38px; box-sizing:border-box; padding:0 10px; color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:6px; font:inherit; font-size:14px; }
  .series-map input:focus { outline:2px solid var(--primary-color); outline-offset:-1px; }
  .diagnostics-dialog { max-width:900px; }
  .diagnostics-note { padding:14px 24px; color:var(--secondary-text-color); border-bottom:1px solid var(--divider-color); }
  .diagnostics-preview { flex:1; min-height:0; margin:0; padding:18px 24px; overflow:auto; color:var(--primary-text-color); background:var(--primary-background-color); font:13px/1.5 var(--code-font-family,monospace); white-space:pre; tab-size:2; }
  @media (max-width:900px) {
    .filters { flex-direction:column; gap:8px; }
    .axis-target-group.axis-target-compact { flex:1 1 auto; width:100%; }
    .axis-target-divider { width:100%; height:1px; margin:0; }
  }
  @media (max-width:768px) {
    .desktop-panel-only, .panel-tabs-shell { display:none !important; }
    .axis-target-secondary, .axis-target-divider { display:none !important; }
    .axis-target-primary .axis-target-label { display:none; }
    .axis-target-primary { flex:1 1 auto; width:100%; }
  }
  @media (max-width:600px) {
    .content { padding:0 12px 96px; }
    .detail-banner { align-items:flex-start; flex-wrap:wrap; }
    .detail-banner span { flex:1 1 calc(100% - 84px); }
    .detail-banner ha-button { margin-inline-start:36px; }
    .energy-nav-floating { left:8px; right:8px; bottom:max(8px,env(safe-area-inset-bottom)); width:calc(100vw - 16px); }
    .appbar { padding:0 4px; gap:0; }
    .appbar h1 { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:16px; }
    .appbar .icon-button { flex:0 0 40px; }
    .dialog { height:100%; border-radius:0; }
    .backdrop { padding:0; }
    .dialog-title { padding:0 14px 0 12px; }
  }
`;
