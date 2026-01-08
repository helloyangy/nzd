// ==UserScript==
// @name         教务评教助手（可拖拽 + AI评语 /v1/chat/completions）
// @namespace    https://jwxt.gxnzd.com.cn/
// @version      2.3
// @description  智能填分+评语；可选接入 /v1/chat/completions 生成评语；弹出真实保存/提交按钮（需手动点）；面板可拖拽/记忆位置；AI设置弹窗显示
// @match        https://jwxt.gxnzd.com.cn/*
// @match        https://vpn.gxnzd.com.cn/*
// @match        https://*.gxnzd.com.cn/*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function() {
  'use strict';

  const KEYS = {
    mode: 'pj_mode',
    fixed: 'pj_fixed',
    randomMin: 'pj_randomMin',
    randomMax: 'pj_randomMax',
    onlyEmpty: 'pj_onlyEmpty',
    commentText: 'pj_commentText',
    panelOpen: 'pj_panelOpen',
    panelPos: 'pj_panel_pos',
    aiEnabled: 'pj_ai_enabled',
    aiEndpoint: 'pj_ai_endpoint',
    aiApiKey: 'pj_ai_apikey',
    aiModel: 'pj_ai_model',
    aiPrompt: 'pj_ai_prompt',
    aiTimeout: 'pj_ai_timeout'
  };

  const SELECTORS = {
    input: 'input.input-pjf',
    comment: 'textarea[name="py"]',
    saveBtn: '#btn_xspj_bc',
    submitBtn: '#btn_xspj_tj'
  };

  const DEFAULTS = {
    mode: 'random',
    fixed: 93,
    randomMin: 88,
    randomMax: 95,
    onlyEmpty: true,
    commentText: '老师授课认真负责，课堂内容充实，讲解清晰。',
    panelOpen: true,
    aiEnabled: false,
    aiEndpoint: '',
    aiApiKey: '',
    aiModel: 'gpt-4o-mini',
    aiPrompt: '生成一句中文课程评语（15~35字），客观积极，不要出现具体分数，不要换行。',
    aiTimeout: 12000
  };

  class ConfigManager {
    constructor(keys, defaults) {
      this.keys = keys;
      this.defaults = defaults;
    }
    get(key, fallback = null) {
      return GM_getValue(this.keys[key], this.defaults[key] ?? fallback);
    }
    set(key, value) {
      GM_setValue(this.keys[key], value);
    }
    getNumeric(key, fallback = null) {
      const val = this.get(key, fallback);
      return Number.isFinite(Number(val)) ? Number(val) : this.defaults[key];
    }
    getBoolean(key) {
      return !!this.get(key, false);
    }
  }

  const cfg = new ConfigManager(KEYS, DEFAULTS);

  const CSS = `
    :root {
      --pj-bg: #ffffff;
      --pj-fg: #1f2328;
      --pj-muted: #6b7280;
      --pj-border: #e5e7eb;
      --pj-soft: #f3f4f6;
      --pj-shadow: 0 10px 28px rgba(0,0,0,.12);
      --pj-radius: 12px;
      --pj-radius-sm: 10px;
      --pj-focus: 0 0 0 3px rgba(22,119,255,.18);
      --pj-primary: #1677ff;
      --pj-success: #52c41a;
      --pj-warning: #faad14;
    }

    #pj-panel {
      position: fixed;
      right: 14px;
      bottom: 14px;
      width: 320px;
      max-width: calc(100vw - 24px);
      z-index: 999999;
      background: var(--pj-bg);
      color: var(--pj-fg);
      border: 1px solid var(--pj-border);
      border-radius: var(--pj-radius);
      box-shadow: var(--pj-shadow);
      overflow: hidden;
      font: 13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,"PingFang SC","Microsoft YaHei",sans-serif;
      transition: all .2s ease;
    }

    #pj-panel header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      background: linear-gradient(180deg, #ffffff, #fafafa);
      border-bottom: 1px solid var(--pj-border);
      cursor: move;
      user-select: none;
      touch-action: none;
    }

    #pj-panel header .t {
      font-weight: 900;
      font-size: 13px;
      letter-spacing: .2px;
    }

    #pj-panel header .hbtns {
      display: flex;
      gap: 8px;
      align-items: center;
      flex: 0 0 auto;
    }

    #pj-panel header button {
      font-size: 12px;
      padding: 6px 10px;
      border: 1px solid var(--pj-border);
      background: #fff;
      border-radius: 10px;
      cursor: pointer;
      color: var(--pj-fg);
      transition: all .1s ease;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #pj-panel header button:hover { background: var(--pj-soft); }
    #pj-panel header button:active { transform: translateY(1px); }

    #pj-panel .body { padding: 12px; display: block; }
    #pj-panel.collapsed .body { display: none; }

    #pj-panel label {
      display: block;
      margin-bottom: 6px;
      color: var(--pj-fg);
      font-size: 12px;
      font-weight: 500;
    }

    #pj-panel select,
    #pj-panel input[type="number"],
    #pj-panel input[type="text"],
    #pj-panel input[type="password"],
    #pj-panel input[type="url"],
    #pj-panel textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      border: 1px solid var(--pj-border);
      border-radius: 10px;
      font-size: 13px;
      background: #fff;
      color: var(--pj-fg);
      outline: none;
      transition: all .2s ease;
    }
    #pj-panel textarea { min-height: 64px; resize: vertical; }
    #pj-panel select:focus,
    #pj-panel input:focus,
    #pj-panel textarea:focus {
      border-color: rgba(22,119,255,.55);
      box-shadow: var(--pj-focus);
    }

    #pj-panel .inline {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    #pj-panel .inline > * { flex: 1; }
    #pj-panel .inline > span {
      flex: 0 0 auto;
      color: var(--pj-muted);
      font-size: 12px;
      padding: 0 2px;
      font-weight: 500;
    }

    #pj-panel .hint {
      margin-top: 8px;
      color: var(--pj-muted);
      font-size: 12px;
      line-height: 1.4;
      padding: 8px;
      background: var(--pj-soft);
      border-radius: 8px;
    }

    #pj-panel .btns {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    #pj-panel .btns button {
      flex: 1;
      padding: 10px;
      border: 1px solid var(--pj-border);
      background: #fff;
      border-radius: 12px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 900;
      color: var(--pj-fg);
      transition: all .2s ease;
    }
    #pj-panel .btns button:hover { background: var(--pj-soft); }
    #pj-panel .btns button:active { transform: translateY(1px); }
    #pj-panel .btns button.primary {
      background: var(--pj-primary);
      border-color: var(--pj-primary);
      color: #fff;
    }
    #pj-panel .btns button.success {
      background: var(--pj-success);
      border-color: var(--pj-success);
      color: #fff;
    }
    #pj-panel .btns button.warning {
      background: var(--pj-warning);
      border-color: var(--pj-warning);
      color: #111827;
    }

    #pj-ai-bar {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border: 1px solid var(--pj-border);
      background: #fff;
      border-radius: 12px;
      margin-bottom: 8px;
    }
    #pj-ai-bar .left {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
    }
    #pj-ai-bar .left .title {
      font-weight: 900;
      font-size: 12px;
      color: var(--pj-fg);
      white-space: nowrap;
    }
    #pj-ai-bar .left label {
      margin: 0;
      display: flex;
      gap: 6px;
      align-items: center;
      font-size: 12px;
      color: var(--pj-fg);
      white-space: nowrap;
    }
    #pj-ai-bar .right {
      display: flex;
      gap: 8px;
      align-items: center;
      flex: 0 0 auto;
    }
    #pj-ai-bar button {
      padding: 6px 10px;
      border: 1px solid var(--pj-border);
      background: #fff;
      border-radius: 10px;
      cursor: pointer;
      font-size: 12px;
      color: var(--pj-fg);
      transition: all .1s ease;
    }
    #pj-ai-bar button:hover { background: var(--pj-soft); }
    #pj-ai-bar button:active { transform: translateY(1px); }

    /* AI 设置弹窗 */
    #pj-ai-mask {
      position: fixed;
      inset: 0;
      z-index: 1000000;
      background: rgba(0,0,0,.40);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      backdrop-filter: blur(4px);
    }
    #pj-ai-mask.open { display: flex; }

    #pj-ai-dialog {
      background: var(--pj-bg);
      border: 1px solid var(--pj-border);
      border-radius: 14px;
      padding: 16px 16px 18px;
      width: min(420px, calc(100vw - 32px));
      max-height: calc(100vh - 80px);
      box-shadow: 0 20px 60px rgba(0,0,0,.3);
      display: flex;
      flex-direction: column;
      animation: popup .25s cubic-bezier(.34,.56,.42,1);
    }

    #pj-ai-dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      cursor: move;
      user-select: none;
    }
    #pj-ai-dialog-title {
      font-size: 14px;
      font-weight: 900;
      color: var(--pj-fg);
    }
    #pj-ai-dialog-close {
      border: 1px solid var(--pj-border);
      background: #fff;
      border-radius: 999px;
      width: 26px;
      height: 26px;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #pj-ai-dialog-close:hover { background: var(--pj-soft); }

    #pj-ai-dialog-body {
      overflow: auto;
      padding-top: 4px;
      padding-bottom: 10px;
    }

    #pj-ai-dialog-body .row {
      margin-bottom: 10px;
    }

    #pj-ai-dialog-body label {
      display: block;
      margin-bottom: 4px;
      font-size: 12px;
      font-weight: 500;
      color: var(--pj-fg);
    }

    #pj-ai-dialog-body input,
    #pj-ai-dialog-body textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 7px 9px;
      border: 1px solid var(--pj-border);
      border-radius: 9px;
      font-size: 13px;
      background: #fff;
      color: var(--pj-fg);
      outline: none;
      transition: all .2s ease;
    }
    #pj-ai-dialog-body textarea {
      min-height: 70px;
      resize: vertical;
    }
    #pj-ai-dialog-body input:focus,
    #pj-ai-dialog-body textarea:focus {
      border-color: rgba(22,119,255,.55);
      box-shadow: var(--pj-focus);
    }

    #pj-ai-dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
    #pj-ai-dialog-save,
    #pj-ai-dialog-cancel {
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid var(--pj-border);
      background: #fff;
      cursor: pointer;
    }
    #pj-ai-dialog-save {
      border-color: var(--pj-primary);
      background: var(--pj-primary);
      color: #fff;
    }
    #pj-ai-dialog-save:hover { filter: brightness(0.96); }
    #pj-ai-dialog-cancel:hover { background: var(--pj-soft); }

    @keyframes popup {
      from { opacity: 0; transform: scale(.96) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    #pj-action-mask {
      position: fixed;
      inset: 0;
      z-index: 1000000;
      background: rgba(0,0,0,.40);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      backdrop-filter: blur(4px);
    }
    #pj-action-box {
      background: var(--pj-bg);
      border: 1px solid var(--pj-border);
      border-radius: 14px;
      padding: 24px;
      width: min(420px, calc(100vw - 32px));
      box-shadow: 0 20px 60px rgba(0,0,0,.3);
      animation: popup .3s cubic-bezier(.34,.56,.42,1);
    }
    #pj-action-box .title {
      font-size: 16px;
      font-weight: 900;
      margin: 0 0 20px 0;
      color: var(--pj-fg);
      text-align: center;
    }
    #pj-action-box .rowbtn {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: center;
    }
    #pj-action-box .rowbtn > * { flex: 1; }
    #pj-action-cancel {
      margin-top: 16px;
      width: 100%;
      padding: 12px;
      border: 1px solid var(--pj-border);
      background: #fff;
      border-radius: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      color: var(--pj-fg);
      transition: all .2s ease;
    }
    #pj-action-cancel:hover { background: var(--pj-soft); }
    #pj-action-box button#btn_xspj_bc,
    #pj-action-box button#btn_xspj_tj {
      font-size: 15px !important;
      padding: 14px 20px !important;
      border-radius: 12px !important;
      min-height: 50px;
      width: 100%;
      font-weight: 700;
    }
  `;

  class TeachingAssistant {
    constructor() {
      this.panel = null;
      this.aiMask = null;
      this.aiDialog = null;
      this.init();
    }

    init() {
      GM_addStyle(CSS);
      GM_registerMenuCommand('显示/隐藏控制面板', () => this.togglePanel());
      this.panel = this.createPanel();
      document.body.appendChild(this.panel);
      this.createAiDialog();
      this.loadPanelState();
      this.bindEvents();
    }

    createPanel() {
      const div = document.createElement('div');
      div.id = 'pj-panel';
      div.innerHTML = `
        <header id="pj-drag-handle" title="拖拽移动">
          <div class="t">评教助手 v2.3</div>
          <div class="hbtns">
            <button id="pj-reset" title="重置位置">↺</button>
            <button id="pj-toggle" title="折叠/展开">−</button>
          </div>
        </header>
        <div class="body">
          <div class="row">
            <label>评分模式</label>
            <select id="pj-mode">
              <option value="max">每项满分</option>
              <option value="ts">提示分</option>
              <option value="fixed">固定分</option>
              <option value="random">随机分</option>
            </select>
          </div>

          <div class="row" id="pj-fixed-row">
            <label>固定分数</label>
            <input id="pj-fixed" type="number" min="60" max="100" step="1" />
          </div>

          <div class="row" id="pj-random-row">
            <label>随机范围</label>
            <div class="inline">
              <input id="pj-rmin" type="number" min="60" max="100" step="1" placeholder="88" />
              <span>~</span>
              <input id="pj-rmax" type="number" min="60" max="100" step="1" placeholder="95" />
            </div>
          </div>

          <div class="row">
            <label><input id="pj-only-empty" type="checkbox" /> 仅填空项</label>
          </div>

          <div class="row">
            <div id="pj-ai-bar">
              <div class="left">
                <div class="title">评语生成</div>
                <label><input id="pj-ai-enable" type="checkbox" /> 启用AI</label>
              </div>
              <div class="right">
                <button id="pj-ai-gen" type="button">生成</button>
                <button id="pj-ai-set" type="button">设置</button>
              </div>
            </div>
            <textarea id="pj-comment" placeholder="评语内容（15-35字最佳）"></textarea>
          </div>

          <div class="btns">
            <button id="pj-fill" class="primary">一键填分</button>
            <button id="pj-fill-save" class="warning">填分+保存</button>
            <button id="pj-fill-submit" class="success">填分+提交</button>
          </div>
        </div>
      `;
      return div;
    }

    createAiDialog() {
      const mask = document.createElement('div');
      mask.id = 'pj-ai-mask';
      mask.innerHTML = `
        <div id="pj-ai-dialog">
          <div id="pj-ai-dialog-header">
            <div id="pj-ai-dialog-title">AI 评语设置</div>
            <button id="pj-ai-dialog-close" type="button">×</button>
          </div>
          <div id="pj-ai-dialog-body">
            <div class="row">
              <label>API 地址</label>
              <input id="pj-ai-endpoint" type="url" placeholder="https://api.example.com/v1/chat/completions" />
            </div>
            <div class="row">
              <label>API 密钥</label>
              <input id="pj-ai-key" type="password" placeholder="sk-..." />
            </div>
            <div class="row">
              <label>模型名称</label>
              <input id="pj-ai-model" type="text" placeholder="gpt-4o-mini" />
            </div>
            <div class="row">
              <label>生成提示词</label>
              <textarea id="pj-ai-prompt" placeholder="生成规则..."></textarea>
            </div>
            <div class="row">
              <label>超时（毫秒）</label>
              <input id="pj-ai-timeout" type="number" min="3000" max="30000" step="1000" />
            </div>
          </div>
          <div id="pj-ai-dialog-footer">
            <button id="pj-ai-dialog-cancel" type="button">取消</button>
            <button id="pj-ai-dialog-save" type="button">保存</button>
          </div>
        </div>
      `;
      document.body.appendChild(mask);
      this.aiMask = mask;
      this.aiDialog = mask.querySelector('#pj-ai-dialog');
      this.setupAiDialogEvents();
    }

    bindEvents() {
      const $ = sel => this.panel.querySelector(sel);

      $('#pj-mode').value = cfg.get('mode');
      $('#pj-fixed').value = cfg.get('fixed');
      $('#pj-rmin').value = cfg.get('randomMin');
      $('#pj-rmax').value = cfg.get('randomMax');
      $('#pj-only-empty').checked = cfg.getBoolean('onlyEmpty');
      $('#pj-comment').value = cfg.get('commentText');
      $('#pj-ai-enable').checked = cfg.getBoolean('aiEnabled');

      $('#pj-mode').addEventListener('change', e => {
        cfg.set('mode', e.target.value);
        this.updateModeVisibility();
      });

      const updateConfig = (key, transform = v => v) =>
        e => cfg.set(key, transform(e.target.value));

      $('#pj-fixed').addEventListener('change', updateConfig('fixed', Number));
      $('#pj-rmin').addEventListener('change', updateConfig('randomMin', Number));
      $('#pj-rmax').addEventListener('change', updateConfig('randomMax', Number));
      $('#pj-only-empty').addEventListener('change', e => cfg.set('onlyEmpty', e.target.checked));
      $('#pj-comment').addEventListener('change', updateConfig('commentText'));
      $('#pj-ai-enable').addEventListener('change', e => cfg.set('aiEnabled', e.target.checked));

      $('#pj-ai-gen').addEventListener('click', () => this.generateAIComment());
      $('#pj-ai-set').addEventListener('click', () => this.openAiDialog());

      $('#pj-fill').addEventListener('click', () => this.run('none'));
      $('#pj-fill-save').addEventListener('click', () => this.run('save'));
      $('#pj-fill-submit').addEventListener('click', () => this.run('submit'));

      $('#pj-toggle').addEventListener('click', () => this.togglePanel());
      $('#pj-reset').addEventListener('click', () => this.resetPosition());

      this.setupDrag();
      this.updateModeVisibility();
    }

    setupAiDialogEvents() {
      const mask = this.aiMask;
      const dialog = this.aiDialog;
      const header = dialog.querySelector('#pj-ai-dialog-header');
      const closeBtn = dialog.querySelector('#pj-ai-dialog-close');
      const cancelBtn = dialog.querySelector('#pj-ai-dialog-cancel');
      const saveBtn = dialog.querySelector('#pj-ai-dialog-save');

      const fillFromCfg = () => {
        dialog.querySelector('#pj-ai-endpoint').value = cfg.get('aiEndpoint') || '';
        dialog.querySelector('#pj-ai-key').value = cfg.get('aiApiKey') || '';
        dialog.querySelector('#pj-ai-model').value = cfg.get('aiModel') || '';
        dialog.querySelector('#pj-ai-prompt').value = cfg.get('aiPrompt') || '';
        dialog.querySelector('#pj-ai-timeout').value = cfg.get('aiTimeout') || '';
      };

      this.openAiDialog = () => {
        fillFromCfg();
        mask.classList.add('open');
        dialog.style.transform = '';
      };

      const close = () => {
        mask.classList.remove('open');
      };

      closeBtn.addEventListener('click', close);
      cancelBtn.addEventListener('click', close);
      mask.addEventListener('click', e => {
        if (e.target === mask) close();
      });

      saveBtn.addEventListener('click', () => {
        const endpoint = dialog.querySelector('#pj-ai-endpoint').value.trim();
        const key = dialog.querySelector('#pj-ai-key').value.trim();
        const model = dialog.querySelector('#pj-ai-model').value.trim();
        const prompt = dialog.querySelector('#pj-ai-prompt').value.trim();
        const timeout = Number(dialog.querySelector('#pj-ai-timeout').value) || DEFAULTS.aiTimeout;

        cfg.set('aiEndpoint', endpoint);
        cfg.set('aiApiKey', key);
        cfg.set('aiModel', model || DEFAULTS.aiModel);
        cfg.set('aiPrompt', prompt || DEFAULTS.aiPrompt);
        cfg.set('aiTimeout', timeout);
        close();
      });

      let dragging = false;
      let startX, startY, startLeft, startTop;

      const isInteractive = target =>
        target.closest?.('button, input, select, textarea, a, label');

      header.addEventListener('pointerdown', e => {
        if (isInteractive(e.target) || e.button !== 0) return;
        dragging = true;
        const rect = dialog.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        header.setPointerCapture(e.pointerId);
        e.preventDefault();
      });

      const moveHandler = e => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        dialog.style.position = 'fixed';
        dialog.style.left = startLeft + dx + 'px';
        dialog.style.top = startTop + dy + 'px';
        dialog.style.transform = 'none';
      };

      const endHandler = e => {
        if (!dragging) return;
        dragging = false;
        header.releasePointerCapture(e.pointerId);
      };

      header.addEventListener('pointermove', moveHandler);
      header.addEventListener('pointerup', endHandler);
      header.addEventListener('pointercancel', endHandler);
    }

    toggleAiSettings() {
      // 已改为弹窗，占位函数
    }

    updateModeVisibility() {
      const mode = cfg.get('mode');
      const fixedRow = this.panel.querySelector('#pj-fixed-row');
      const randomRow = this.panel.querySelector('#pj-random-row');
      fixedRow.style.display = mode === 'fixed' ? 'block' : 'none';
      randomRow.style.display = mode === 'random' ? 'block' : 'none';
    }

    loadPanelState() {
      const open = cfg.getBoolean('panelOpen');
      this.panel.classList.toggle('collapsed', !open);
      this.panel.querySelector('#pj-toggle').textContent = open ? '−' : '+';

      const pos = cfg.get('panelPos');
      if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
        this.panel.style.left = `${pos.left}px`;
        this.panel.style.top = `${pos.top}px`;
      }
    }

    togglePanel() {
      const isOpen = !this.panel.classList.contains('collapsed');
      const newOpen = !isOpen;
      this.panel.classList.toggle('collapsed', !newOpen);
      this.panel.querySelector('#pj-toggle').textContent = newOpen ? '−' : '+';
      cfg.set('panelOpen', newOpen);
    }

    resetPosition() {
      cfg.set('panelPos', null);
      Object.assign(this.panel.style, {
        left: '',
        top: '',
        right: '14px',
        bottom: '14px'
      });
    }

    setupDrag() {
      const handle = this.panel.querySelector('#pj-drag-handle');
      let dragging = false;
      let startX, startY, startLeft, startTop;

      const isInteractive = target =>
        target.closest?.('button, input, select, textarea, a, label');

      handle.addEventListener('pointerdown', e => {
        if (isInteractive(e.target) || e.button !== 0) return;
        dragging = true;
        const rect = this.panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        Object.assign(this.panel.style, {
          right: 'auto',
          bottom: 'auto',
          left: `${rect.left}px`,
          top: `${rect.top}px`
        });
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
      });

      const moveHandler = e => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const clamped = this.clampToViewport(startLeft + dx, startTop + dy);
        Object.assign(this.panel.style, {
          left: `${clamped.left}px`,
          top: `${clamped.top}px`
        });
      };

      const endHandler = e => {
        if (!dragging) return;
        dragging = false;
        const rect = this.panel.getBoundingClientRect();
        const clamped = this.clampToViewport(rect.left, rect.top);
        Object.assign(this.panel.style, {
          left: `${clamped.left}px`,
          top: `${clamped.top}px`
        });
        cfg.set('panelPos', { left: clamped.left, top: clamped.top, ts: Date.now() });
        handle.releasePointerCapture(e.pointerId);
      };

      handle.addEventListener('pointermove', moveHandler);
      handle.addEventListener('pointerup', endHandler);
      handle.addEventListener('pointercancel', endHandler);
    }

    clampToViewport(left, top) {
      const pad = 12;
      const rect = this.panel.getBoundingClientRect();
      return {
        left: Math.min(window.innerWidth - rect.width - pad, Math.max(pad, left)),
        top: Math.min(window.innerHeight - rect.height - pad, Math.max(pad, top))
      };
    }

    async run(after) {
      try {
        const scoresResult = this.fillScores();
        if (scoresResult.total === 0) {
          alert('未找到评分输入框（请确认在评教详情页）');
          return;
        }

        const needComment = this.needsComment(scoresResult.scores);
        const commentResult = await this.fillCommentIfNeeded(needComment);

        if (!commentResult.ok && needComment) {
          alert(`评语处理失败：${commentResult.reason}`);
          return;
        }

        if (after === 'save' || after === 'submit') {
          setTimeout(() => this.popupRealButton(after), 150);
        } else {
          alert(`已完成：${scoresResult.filled}/${scoresResult.total} 分数 ${commentResult.reason}`);
        }
      } catch (error) {
        alert(`操作失败：${error.message}`);
      }
    }

    fillScores() {
      const inputs = Array.from(document.querySelectorAll(SELECTORS.input));
      if (!inputs.length) return { total: 0, filled: 0, scores: [] };
      let filled = 0;
      const scores = [];
      for (const input of inputs) {
        if (cfg.getBoolean('onlyEmpty') && input.value.trim()) {
          scores.push(Number(input.value));
          continue;
        }
        const score = this.pickScore(input);
        this.setNativeValue(input, score);
        scores.push(score);
        filled++;
      }
      return { total: inputs.length, filled, scores };
    }

    pickScore(input) {
      const min = Number(input.dataset.zxfz ?? 1);
      const max = Number(input.dataset.zdfz ?? 95);
      const ts = Number(input.dataset.tsfz ?? max);
      const mode = cfg.get('mode');
      let score;
      switch (mode) {
        case 'max': score = max; break;
        case 'ts': score = ts; break;
        case 'fixed': score = cfg.getNumeric('fixed', max); break;
        case 'random': {
          const rmin = Math.max(min, cfg.getNumeric('randomMin', 88));
          const rmax = Math.min(max, cfg.getNumeric('randomMax', 95));
          score = Math.floor(rmin + Math.random() * (rmax - rmin + 1));
          break;
        }
        default: score = max;
      }
      return Math.min(max, Math.max(min, score));
    }

    needsComment(scores) {
      return scores.some(s => Number(s) < 75 || Number(s) > 94);
    }

    // 修复 Illegal invocation 的关键：用最简单方式设置 value 再派发事件
    setNativeValue(element, value) {
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async generateAIComment(reason = 'manual') {
      try {
        const endpoint = cfg.get('aiEndpoint').trim();
        const apiKey = cfg.get('aiApiKey').trim();
        const model = cfg.get('aiModel').trim();
        const prompt = cfg.get('aiPrompt').trim();

        if (!endpoint) throw new Error('请配置AI API地址');
        if (!model) throw new Error('请配置AI模型名称');
        if (!apiKey) throw new Error('请配置API密钥');

        const payload = {
          model,
          temperature: 0.4,
          max_tokens: 120,
          messages: [
            { role: 'system', content: '你是一个简洁专业的中文课程评教评语生成器。' },
            { role: 'user', content: `${prompt}（触发原因：${reason}）` }
          ]
        };

        const response = await this.gmRequest({
          method: 'POST',
          url: endpoint,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`
          },
          data: JSON.stringify(payload),
          timeout: cfg.getNumeric('aiTimeout', 12000)
        });

        const json = JSON.parse(response.responseText);
        const content = json?.choices?.[0]?.message?.content?.trim();
        if (!content) throw new Error('AI未返回有效内容');

        const commentEl = this.panel.querySelector('#pj-comment');
        this.setNativeValue(commentEl, content);
        cfg.set('commentText', content);
        return content;
      } catch (error) {
        console.error('AI 生成异常详情：', error);
        throw new Error(`AI生成失败：${error.message}`);
      }
    }

    async fillCommentIfNeeded(needComment) {
      if (!needComment) return { ok: true, reason: '分数正常，无需评语' };

      const textarea = document.querySelector(SELECTORS.comment);
      if (!textarea) return { ok: false, reason: '未找到评语输入框' };

      const existing = textarea.value.trim();
      if (existing) return { ok: true, reason: '评语已存在' };

      if (cfg.getBoolean('aiEnabled')) {
        await this.generateAIComment('auto');
        return { ok: true, reason: 'AI已生成评语' };
      }

      const text = cfg.get('commentText').trim();
      if (!text) return { ok: false, reason: '评语模板为空' };

      this.setNativeValue(textarea, text);
      return { ok: true, reason: '已填默认评语' };
    }

    gmRequest(details) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: details.method || 'GET',
          url: details.url,
          headers: details.headers || {},
          data: details.data,
          timeout: details.timeout || 12000,
          onload: resolve,
          onerror: reject,
          ontimeout: () => reject(new Error('请求超时'))
        });
      });
    }

    popupRealButton(type) {
      const selector = type === 'save' ? SELECTORS.saveBtn : SELECTORS.submitBtn;
      const actionName = type === 'save' ? '保存' : '提交';
      const button = document.querySelector(selector);
      if (!button) {
        alert(`未找到${actionName}按钮`);
        return;
      }

      const existingMask = document.getElementById('pj-action-mask');
      existingMask?.remove();

      const originalParent = button.parentNode;
      const nextSibling = button.nextSibling;

      const mask = document.createElement('div');
      mask.id = 'pj-action-mask';

      const box = document.createElement('div');
      box.id = 'pj-action-box';
      box.innerHTML = `
        <div class="title">请点击下方按钮完成${actionName}</div>
        <div class="rowbtn" id="pj-action-row"></div>
        <button id="pj-action-cancel">取消</button>
      `;

      mask.appendChild(box);
      document.body.appendChild(mask);
      box.querySelector('#pj-action-row').appendChild(button);

      const cleanup = () => {
        try {
          if (nextSibling && originalParent) {
            originalParent.insertBefore(button, nextSibling);
          } else {
            originalParent?.appendChild(button);
          }
        } catch {}
        mask.remove();
      };

      box.querySelector('#pj-action-cancel').addEventListener('click', cleanup);
      mask.addEventListener('click', e => {
        if (e.target === mask) cleanup();
      });
      button.addEventListener('click', () => setTimeout(cleanup, 200), { once: true });
      button.focus();
    }
  }

  new TeachingAssistant();
})();
