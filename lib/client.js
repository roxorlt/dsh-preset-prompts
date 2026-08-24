window.__ModuleLoader__.load({
  id: "dsh-preset-prompts",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const Toast = primitives && primitives.Toast ? primitives.Toast : null;
    const UPDATE_CMD = "dsh plugin --profile web update dsh-preset-prompts@latest";

    let listeners = [];
    const store = {
      open: false,
      templates: null,
      error: null,
      selectedId: null,
      values: {}
    };
    let scheduleFocus = null;

    function subscribe(fn) {
      listeners.push(fn);
      return () => { listeners = listeners.filter((f) => f !== fn); };
    }
    function emit() { listeners.slice().forEach((fn) => fn()); }
    function setState(patch) {
      Object.assign(store, patch);
      emit();
    }
    function useStore() {
      const [, force] = React.useState(0);
      React.useEffect(() => subscribe(() => force((n) => n + 1)), []);
      return store;
    }
    function refreshTemplates() {
      store.templates = null;
      store.selectedId = null;
    }

    function api(method, body) {
      const init = body === undefined
        ? {}
        : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
      return fetch("/api/askit/" + method, init).then((r) => r.json());
    }

    function loadTemplates() {
      if (store.templates) return;
      api("templates").then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setState({ templates: arr, selectedId: arr.length ? arr[0].id : null });
      }).catch((err) => {
        setState({ error: String(err && err.message ? err.message : err) });
      });
    }

    function formatBody(text) {
      if (typeof text !== "string") return "";
      return text.replace(/([。；：])\s*(?=\d{1,2}[.．、])/g, "$1\n");
    }

    function fmtTime(ts) {
      if (!ts) return "";
      try {
        const d = new Date(ts);
        const p = (n) => (n < 10 ? "0" + n : "" + n);
        return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
      } catch (err) { return ""; }
    }

    function extractInputs(tpl) {
      const body = typeof tpl.body === "string" ? tpl.body : "";
      const vars = Array.isArray(tpl.vars) ? tpl.vars : [];
      const inputs = [];
      for (const v of vars) {
        const token = "$" + v.key;
        if (body.indexOf(token) === -1) continue;
        inputs.push({ token, label: v.label || v.key, placeholder: v.placeholder || ("请填写" + (v.label || v.key)) });
      }
      inputs.sort((a, b) => body.indexOf(a.token) - body.indexOf(b.token));
      return inputs;
    }

    function fillTemplate(tpl, values) {
      const body = typeof tpl.body === "string" ? tpl.body : "";
      let text = body;
      for (const p of extractInputs(tpl)) {
        const v = values && typeof values[p.token] === "string" ? values[p.token].trim() : "";
        if (v) text = text.split(p.token).join(v);
      }
      return text;
    }

    function focusComposerEnd() {
      try {
        let el = document.querySelector('textarea[class*="uV2eYG_input"]');
        if (!el) el = document.querySelector('textarea[class*="YG_input"]');
        if (!el) return;
        el.focus({ preventScroll: true });
        const end = el.value.length;
        try { el.setSelectionRange(end, end); } catch (err) {}
      } catch (err) {}
    }

    function inject(inputActions, filled) {
      if (inputActions) inputActions.setDraft(filled);
      setState({ open: false });
      if (scheduleFocus) scheduleFocus(() => focusComposerEnd());
    }

    const BUILTIN_SCENARIOS = ["问清问题", "学习", "解决问题", "决策", "自定义"];

    function ToggleButton() {
      const s = useStore();
      return React.createElement("button", {
        className: "askit-toggle" + (s.open ? " askit-toggle-on" : ""),
        type: "button",
        title: "预设提示词",
        onClick: () => {
          if (s.open) {
            setState({ open: false });
          } else {
            setState({ open: true });
            loadTemplates();
          }
        }
      }, "预设提示词");
    }

    function Panel(props) {
      const s = useStore();
      if (!s.open) return null;
      const inputActions = props && props.inputActions ? props.inputActions : null;
      const templates = Array.isArray(s.templates) ? s.templates : [];
      const tpl = templates.find((t) => t.id === s.selectedId) || null;
      const filled = tpl ? formatBody(fillTemplate(tpl, s.values)) : "";

      const groups = {};
      const order = [];
      for (const t of templates) {
        const sc = typeof t.scenario === "string" && t.scenario ? t.scenario : "自定义";
        if (!groups[sc]) {
          groups[sc] = [];
          order.push(sc);
        }
        groups[sc].push(t);
      }
      const ordered = [];
      for (const sc of BUILTIN_SCENARIOS) {
        if (groups[sc]) ordered.push([sc, groups[sc]]);
      }
      for (const sc of order) {
        if (!BUILTIN_SCENARIOS.includes(sc)) ordered.push([sc, groups[sc]]);
      }

      const left = [];
      for (const pair of ordered) {
        const sc = pair[0];
        const rows = pair[1];
        left.push(React.createElement("div", { className: "askit-scenario", key: sc }, sc));
        for (const t of rows) {
          const on = s.selectedId === t.id;
          left.push(React.createElement("button", {
            key: t.id,
            type: "button",
            className: "askit-opt" + (on ? " askit-opt-on" : ""),
            onClick: () => setState({ selectedId: t.id })
          },
            React.createElement("span", { className: "askit-opt-title" }, t.name),
            React.createElement("span", { className: "askit-opt-desc" }, typeof t.desc === "string" ? t.desc : "")
          ));
        }
      }

      const main = [];
      main.push(React.createElement("div", { className: "askit-head", key: "head" },
        React.createElement("span", { className: "askit-title" }, tpl ? tpl.name : "预设提示词"),
        React.createElement("button", { className: "askit-close", type: "button", title: "关闭", onClick: () => setState({ open: false }) }, "✕")
      ));
      if (s.error) {
        main.push(React.createElement("div", { className: "askit-error", key: "err" }, "加载失败：" + s.error));
      }
      if (tpl) {
        const inputs = extractInputs(tpl);
        const fields = inputs.map((p) => React.createElement("div", { className: "askit-field", key: p.token },
          React.createElement("input", {
            className: "askit-input",
            type: "text",
            value: typeof s.values[p.token] === "string" ? s.values[p.token] : "",
            placeholder: p.placeholder,
            onChange: (ev) => {
              const next = Object.assign({}, s.values);
              next[p.token] = ev.target.value;
              setState({ values: next });
            }
          })
        ));
        main.push(React.createElement("div", { className: "askit-fields", key: "fields" }, fields));
        main.push(React.createElement("textarea", {
          key: "preview",
          className: "askit-preview",
          readOnly: true,
          value: filled,
          onChange: () => {}
        }));
        main.push(React.createElement("div", { className: "askit-actions", key: "actions" },
          React.createElement("button", {
            className: "askit-inject",
            type: "button",
            onClick: () => inject(inputActions, filled)
          }, inputActions ? "注入提示词" : "当前会话不可注入")
        ));
      } else {
        main.push(React.createElement("div", { className: "askit-empty", key: "empty" }, "在左侧选择一个模板"));
      }

      const panel = React.createElement("div", {
        className: "askit-panel",
        onKeyDown: (ev) => {
          if (ev && ev.key === "Enter") {
            if (filled.trim()) inject(inputActions, filled);
          }
        }
      },
        React.createElement("div", { className: "askit-side" }, left),
        React.createElement("div", { className: "askit-main" }, main)
      );

      return React.createElement("div", { className: "askit-root" },
        React.createElement("div", { className: "askit-backdrop", onClick: () => setState({ open: false }) }),
        panel
      );
    }

    function SettingsSection() {
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState("");
      const [editing, setEditing] = React.useState(null);
      const [form, setForm] = React.useState({ name: "", scenario: "", desc: "", body: "", vars: [], builtin: false, id: null });
      const [saving, setSaving] = React.useState(false);
      const [varForm, setVarForm] = React.useState(null);
      const [suggest, setSuggest] = React.useState(null);
      const [histFor, setHistFor] = React.useState(null);
      const [editSeq, setEditSeq] = React.useState(0);
      const [pluginVersion, setPluginVersion] = React.useState(null);
      const [updateInfo, setUpdateInfo] = React.useState(null);
      const [toast, setToast] = React.useState(null);
      const toastSeq = React.useRef(0);

      function showToast(text) {
        toastSeq.current += 1;
        setToast({ seq: toastSeq.current, text });
      }
      function dismissToast() {
        setToast(null);
      }

      function checkUpdate() {
        fetch("https://registry.npmjs.org/dsh-preset-prompts/latest")
          .then((r) => r.json())
          .then((info) => {
            setUpdateInfo({ latest: info && typeof info.version === "string" ? info.version : null });
          })
          .catch(() => setError("检查更新失败，请稍后再试"));
      }
      function newerThan(a, b) {
        const pa = String(a || "0").split(".").map((x) => parseInt(x, 10) || 0);
        const pb = String(b || "0").split(".").map((x) => parseInt(x, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const x = pa[i] || 0;
          const y = pb[i] || 0;
          if (x !== y) return x > y;
        }
        return false;
      }
      function copyUpdateCmd() {
        try {
          if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(UPDATE_CMD).then(() => showToast("复制成功")).catch(() => showToast("复制失败"));
          } else {
            showToast("复制失败");
          }
        } catch (err) {
          showToast("复制失败");
        }
      }

      function load() {
        Promise.all([api("builtins"), api("templates"), api("state"), api("version")])
          .then(([builtins, templates, st, ver]) => {
            setData({
              builtins: Array.isArray(builtins) ? builtins : [],
              templates: Array.isArray(templates) ? templates : [],
              state: st && typeof st === "object" ? st : { overrides: {}, custom: [] }
            });
            if (ver && typeof ver.version === "string") setPluginVersion(ver.version);
          })
          .catch((err) => setError(String(err && err.message ? err.message : err)));
      }
      React.useEffect(load, []);

      function startEdit(item) {
        setEditing(item);
        setForm({ name: item.name || "", scenario: item.scenario || "", desc: item.desc || "", body: item.body || "", vars: Array.isArray(item.vars) ? item.vars : [], builtin: !!item.builtin, id: item.id });
        setError("");
        setVarForm(null);
        setSuggest(null);
        setHistFor(null);
        setEditSeq((n) => n + 1);
      }
      function startNew() {
        setEditing({ builtin: false, id: null });
        setForm({ name: "", scenario: "", desc: "", body: "", vars: [], builtin: false, id: null });
        setError("");
        setVarForm(null);
        setSuggest(null);
        setHistFor(null);
        setEditSeq((n) => n + 1);
      }
      function doSave() {
        const name = form.name.trim();
        const body = form.body.trim();
        if (!name || !body) {
          setError("名称与正文不能为空");
          return;
        }
        setSaving(true);
        api("savePrompt", { item: { id: form.id, name, desc: form.desc.trim(), scenario: form.scenario.trim(), body, vars: form.vars, builtin: !!form.builtin } })
          .then((res) => {
            setSaving(false);
            if (!res || res.ok !== true) {
              setError(res && res.error ? res.error : "保存失败");
              return;
            }
            setEditing(null);
            load();
            refreshTemplates();
          })
          .catch((err) => {
            setSaving(false);
            setError(String(err && err.message ? err.message : err));
          });
      }
      function doDelete(item) {
        api("deletePrompt", { id: item.id, builtin: !!item.builtin })
          .then(() => { load(); refreshTemplates(); })
          .catch((err) => setError(String(err && err.message ? err.message : err)));
      }
      function doRestore(item) {
        api("restorePrompt", { id: item.id })
          .then(() => { load(); refreshTemplates(); })
          .catch((err) => setError(String(err && err.message ? err.message : err)));
      }
      function openHistory(item) {
        api("history", { id: item.id, builtin: !!item.builtin })
          .then((res) => {
            if (res && res.error) {
              setError(res.error);
              return;
            }
            setHistFor({ id: item.id, builtin: !!item.builtin, version: res.version, updatedAt: res.updatedAt, history: Array.isArray(res.history) ? res.history : [] });
          })
          .catch((err) => setError(String(err && err.message ? err.message : err)));
      }
      function doRestoreVersion(ver) {
        api("restoreVersion", { id: histFor.id, builtin: histFor.builtin, version: ver })
          .then(() => { setHistFor(null); load(); refreshTemplates(); })
          .catch((err) => setError(String(err && err.message ? err.message : err)));
      }

      function composedBody(root) {
        let text = "";
        function walk(node) {
          for (const child of node.childNodes) {
            if (child.nodeType === 3) {
              text += child.textContent;
              continue;
            }
            if (child.nodeType !== 1) continue;
            const key = child.getAttribute && child.getAttribute("data-key");
            if (key) {
              text += "$" + key;
              continue;
            }
            const tag = (child.tagName || "").toLowerCase();
            if (tag === "div" || tag === "p") {
              if (text && text[text.length - 1] !== "\n") text += "\n";
              walk(child);
              if (text[text.length - 1] !== "\n") text += "\n";
            } else if (tag === "br") {
              text += "\n";
            } else {
              walk(child);
            }
          }
        }
        walk(root);
        return text;
      }

      function readBack() {
        try {
          const el = document.querySelector("div.askit-body");
          if (!el) return;
          setForm((f) => ({ ...f, body: composedBody(el) }));
          updateSuggestion();
        } catch (err) {}
      }

      function caretTextOffset(el) {
        try {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return 0;
          const range = sel.getRangeAt(0);
          let offset = 0;
          let found = false;
          function walk(node) {
            if (found) return;
            for (const child of node.childNodes) {
              if (found) return;
              if (child === range.endContainer) {
                offset += range.endOffset;
                found = true;
                return;
              }
              if (child.nodeType === 3) offset += child.textContent.length;
              else if (child.nodeType === 1) {
                const key = child.getAttribute && child.getAttribute("data-key");
                if (key) offset += key.length + 1;
                else walk(child);
              }
            }
          }
          walk(el);
          return offset;
        } catch (err) {
          return 0;
        }
      }

      function updateSuggestion() {
        try {
          const el = document.querySelector("div.askit-body");
          if (!el) return;
          const body = composedBody(el);
          const offset = caretTextOffset(el);
          const before = body.slice(0, offset);
          const mm = before.match(/\$([^\s$]{0,20})$/);
          setSuggest(mm ? { query: mm[1] } : null);
        } catch (err) {}
      }

      function fuzzyMatch(query, key) {
        if (!query) return true;
        const q = query.toLowerCase();
        const k = key.toLowerCase();
        let i = 0;
        for (let j = 0; j < k.length && i < q.length; j++) {
          if (k[j] === q[i]) i++;
        }
        return i === q.length;
      }

      function buildChip(key) {
        const chip = document.createElement("span");
        chip.className = "askit-chip";
        chip.contentEditable = "false";
        chip.setAttribute("data-key", key);
        chip.textContent = "$" + key;
        const del = document.createElement("span");
        del.className = "askit-chip-x";
        del.textContent = "×";
        del.addEventListener("mousedown", (e) => e.preventDefault());
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          chip.remove();
          readBack();
        });
        chip.appendChild(del);
        return chip;
      }

      function escapeRe(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }

      function renderEditorContent(el, body, vars) {
        el.textContent = "";
        const keys = (vars || []).map((v) => v.key).filter(Boolean);
        const keySet = new Set(keys);
        if (!keys.length) {
          el.appendChild(document.createTextNode(body || ""));
          return;
        }
        const sorted = keys.slice().sort((a, b) => b.length - a.length);
        const re = new RegExp("(\\$" + sorted.map(escapeRe).join("|\\$") + ")", "g");
        const parts = (body || "").split(re);
        for (const part of parts) {
          if (!part) continue;
          if (part[0] === "$" && keySet.has(part.slice(1))) {
            el.appendChild(buildChip(part.slice(1)));
          } else {
            el.appendChild(document.createTextNode(part));
          }
        }
      }

      React.useEffect(() => {
        try {
          const el = document.querySelector("div.askit-body");
          if (el) {
            renderEditorContent(el, formatBody(form.body), form.vars);
            setForm((f) => ({ ...f, body: composedBody(el) }));
          }
        } catch (err) {}
      }, [editSeq]);

      function insertChipAtCaret(key) {
        try {
          const el = document.querySelector("div.askit-body");
          if (!el) return;
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) {
            el.appendChild(buildChip(key));
          } else {
            const range = sel.getRangeAt(0);
            const chip = buildChip(key);
            range.deleteContents();
            range.insertNode(chip);
            range.setStartAfter(chip);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          el.focus();
          readBack();
        } catch (err) {}
      }

      function removeVar(key) {
        const nextVars = form.vars.filter((v) => v.key !== key);
        setForm((f) => ({ ...f, vars: nextVars }));
        try {
          const el = document.querySelector("div.askit-body");
          if (el) renderEditorContent(el, composedBody(el), nextVars);
        } catch (err) {}
      }

      function saveVar() {
        const name = (varForm && varForm.name ? varForm.name : "").trim();
        if (!name) {
          setError("变量名称不能为空");
          return;
        }
        if (form.vars.some((v) => v.key === name)) {
          setError("变量名称重复：" + name);
          return;
        }
        const placeholder = (varForm && varForm.placeholder ? varForm.placeholder : "").trim() || ("请填写" + name);
        setForm((f) => ({ ...f, vars: f.vars.concat([{ key: name, label: name, placeholder }]) }));
        setVarForm(null);
        setError("");
      }

      if (editing) {
        const inputs = extractInputs({ body: form.body || "", vars: form.vars });
        const hintEl = inputs.length
          ? React.createElement("div", { className: "askit-sp-hint" }, "检测到 " + inputs.length + " 个输入项：" + inputs.map((p) => p.label || p.token).join("、"))
          : null;
        const varRows = form.vars.map((v) => React.createElement("div", { className: "askit-var-row", key: v.key },
          React.createElement("span", { className: "askit-var-name" }, "$" + v.key),
          React.createElement("span", { className: "askit-var-ph" }, v.placeholder),
          React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => insertChipAtCaret(v.key) }, "插入"),
          React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => removeVar(v.key) }, "×")
        ));
        const suggestions = suggest
          ? form.vars.filter((v) => fuzzyMatch(suggest.query, v.key)).slice(0, 8)
          : [];
        const suggList = suggest && suggestions.length
          ? React.createElement("div", { className: "askit-sugg" },
            suggestions.map((v) => React.createElement("button", {
              key: v.key,
              type: "button",
              className: "askit-sugg-item",
              onMouseDown: (e) => e.preventDefault(),
              onClick: () => insertChipAtCaret(v.key)
            }, "$" + v.key + " · " + v.placeholder))
          )
          : null;
        return React.createElement("div", { className: "askit-sp" },
          React.createElement("div", { className: "askit-sp-head" },
            React.createElement("span", { className: "askit-sp-title" }, editing.builtin ? "编辑内置模板" : (editing.id ? "编辑提示词" : "新建提示词")),
            React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => setEditing(null) }, "返回列表")
          ),
          React.createElement("div", { className: "askit-sp-label" }, "名称"),
          React.createElement("div", { className: "askit-sp-field" },
            React.createElement("input", { className: "askit-input", type: "text", placeholder: "例如：帮我写周报", value: form.name, onChange: (ev) => setForm({ ...form, name: ev.target.value }) })
          ),
          React.createElement("div", { className: "askit-sp-label" }, "应用场景"),
          React.createElement("div", { className: "askit-sp-field" },
            React.createElement("input", { className: "askit-input", type: "text", placeholder: "在什么场景下用它（显示在左侧列表）", value: form.desc, onChange: (ev) => setForm({ ...form, desc: ev.target.value }) })
          ),
          React.createElement("div", { className: "askit-sp-label" }, "所属分组（可选，可自定义）"),
          React.createElement("div", { className: "askit-sp-field" },
            React.createElement("input", { className: "askit-input", type: "text", placeholder: "留空归入「自定义」", value: form.scenario, onChange: (ev) => setForm({ ...form, scenario: ev.target.value }) })
          ),
          React.createElement("div", { className: "askit-sp-label" }, "变量（可选）"),
          React.createElement("div", { className: "askit-vars" }, varRows),
          varForm
            ? React.createElement("div", { className: "askit-varform" },
              React.createElement("input", {
                className: "askit-input",
                type: "text",
                placeholder: "变量名称（例如：产品名）",
                value: varForm.name,
                onChange: (ev) => {
                  const name = ev.target.value;
                  setVarForm((vf) => ({ name, placeholder: vf && vf.touched ? vf.placeholder : ("请填写" + name), touched: !!(vf && vf.touched) }));
                }
              }),
              React.createElement("input", {
                className: "askit-input",
                type: "text",
                placeholder: "外显预置文案",
                value: varForm.placeholder,
                onChange: (ev) => setVarForm((vf) => ({ ...vf, placeholder: ev.target.value, touched: true }))
              }),
              React.createElement("div", { className: "askit-sp-actions" },
                React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => setVarForm(null) }, "取消"),
                React.createElement("button", { className: "askit-inject", type: "button", onClick: saveVar }, "保存变量")
              )
            )
            : React.createElement("div", { className: "askit-sp-field" },
              React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => setVarForm({ name: "", placeholder: "", touched: false }) }, "+ 新增变量")
            ),
          React.createElement("div", { className: "askit-sp-label" }, "正文"),
          React.createElement("div", { className: "askit-sugg-wrap" },
            React.createElement("div", {
              key: "ed" + editSeq,
              className: "askit-body",
              contentEditable: true,
              suppressContentEditableWarning: true,
              onInput: readBack,
              onKeyUp: updateSuggestion,
              onClick: updateSuggestion
            }),
            suggList
          ),
          hintEl,
          React.createElement("div", { className: "askit-sp-actions" },
            React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => setEditing(null) }, "取消"),
            React.createElement("button", { className: "askit-inject", type: "button", disabled: saving, onClick: doSave }, saving ? "保存中…" : "保存")
          )
        );
      }

      const builtins = data ? data.builtins : [];
      const overrides = data && data.state ? data.state.overrides : {};
      const customs = data && data.state && Array.isArray(data.state.custom) ? data.state.custom : [];
      const children = [];
      children.push(React.createElement("div", { className: "askit-sp-head", key: "head" },
        React.createElement("span", { className: "askit-sp-title" }, "预设提示词管理")
      ));
      if (error) children.push(React.createElement("div", { className: "askit-error", key: "err" }, error));
      if (!data) children.push(React.createElement("div", { className: "askit-empty", key: "loading" }, "加载中…"));

      children.push(React.createElement("div", { className: "askit-sp-group", key: "bg" }, "内置模板（编辑后可用「恢复初始」还原）"));
      for (const b of builtins) {
        const ov = overrides[b.id];
        const deleted = ov === null;
        const modified = ov && typeof ov === "object";
        const btns = [];
        if (!deleted) {
          btns.push(React.createElement("button", { key: "e", className: "askit-sp-ghost", type: "button", onClick: () => startEdit({ ...b, builtin: true }) }, "编辑"));
          btns.push(React.createElement("button", { key: "d", className: "askit-sp-ghost", type: "button", onClick: () => doDelete({ id: b.id, builtin: true }) }, "删除"));
        }
        if (modified) {
          btns.push(React.createElement("button", { key: "v", className: "askit-sp-ghost", type: "button", onClick: () => openHistory({ id: b.id, builtin: true }) }, "版本"));
        }
        if (deleted || modified) {
          btns.push(React.createElement("button", { key: "r", className: "askit-sp-ghost", type: "button", onClick: () => doRestore({ id: b.id }) }, "恢复初始"));
        }
        const info = React.createElement("div", { className: "askit-sp-info" },
          React.createElement("div", { className: "askit-opt-title" }, b.name),
          React.createElement("div", { className: "askit-opt-desc" }, (typeof b.desc === "string" ? b.desc : "") + (modified ? " · 已修改" : deleted ? " · 已删除" : "")),
          modified && ov.version
            ? React.createElement("div", { className: "askit-ver" }, "v" + ov.version + (ov.updatedAt ? " · 最后编辑 " + fmtTime(ov.updatedAt) : ""))
            : null
        );
        const row = React.createElement("div", { className: "askit-sp-row" + (deleted ? " askit-sp-row-off" : ""), key: "b" + b.id },
          info,
          React.createElement("div", { className: "askit-sp-btns" }, btns)
        );
        children.push(row);
        if (histFor && histFor.id === b.id && histFor.builtin) {
          children.push(React.createElement("div", { className: "askit-hist", key: "h" + b.id },
            React.createElement("div", { className: "askit-scenario" }, "当前 v" + histFor.version + (histFor.updatedAt ? " · " + fmtTime(histFor.updatedAt) : "")),
            histFor.history.map((h) => React.createElement("div", { className: "askit-sp-row", key: "hv" + h.version },
              React.createElement("span", { className: "askit-opt-desc" }, "v" + h.version + (h.updatedAt ? " · " + fmtTime(h.updatedAt) : "")),
              React.createElement("div", { className: "askit-sp-btns" },
                React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => doRestoreVersion(h.version) }, "恢复")
              )
            ))
          ));
        }
      }

      children.push(React.createElement("div", { className: "askit-sp-group", key: "cg" }, "自定义提示词"));
      for (const c of customs) {
        const info = React.createElement("div", { className: "askit-sp-info" },
          React.createElement("div", { className: "askit-opt-title" }, c.name),
          React.createElement("div", { className: "askit-opt-desc" }, (typeof c.scenario === "string" && c.scenario ? c.scenario + " · " : "") + (typeof c.desc === "string" ? c.desc : "")),
          React.createElement("div", { className: "askit-ver" }, "v" + (c.version || 1) + (c.updatedAt ? " · 最后编辑 " + fmtTime(c.updatedAt) : ""))
        );
        const row = React.createElement("div", { className: "askit-sp-row", key: "c" + c.id },
          info,
          React.createElement("div", { className: "askit-sp-btns" },
            React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => openHistory({ id: c.id, builtin: false }) }, "版本"),
            React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => startEdit({ ...c, builtin: false }) }, "编辑"),
            React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => doDelete({ id: c.id, builtin: false }) }, "删除")
          )
        );
        children.push(row);
        if (histFor && histFor.id === c.id && !histFor.builtin) {
          children.push(React.createElement("div", { className: "askit-hist", key: "h" + c.id },
            React.createElement("div", { className: "askit-scenario" }, "当前 v" + histFor.version + (histFor.updatedAt ? " · " + fmtTime(histFor.updatedAt) : "")),
            histFor.history.map((h) => React.createElement("div", { className: "askit-sp-row", key: "hv" + h.version },
              React.createElement("span", { className: "askit-opt-desc" }, "v" + h.version + (h.updatedAt ? " · " + fmtTime(h.updatedAt) : "")),
              React.createElement("div", { className: "askit-sp-btns" },
                React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: () => doRestoreVersion(h.version) }, "恢复")
              )
            ))
          ));
        }
      }
      children.push(React.createElement("button", { className: "askit-addcard", type: "button", key: "add", onClick: startNew },
        React.createElement("span", { className: "askit-addcard-top" },
          React.createElement("span", { className: "askit-addcard-chip" }, "+"),
          React.createElement("span", { className: "askit-addcard-title" }, "新建提示词")
        ),
        React.createElement("span", { className: "askit-addcard-desc" }, "创建预设prompt后可在会话中复用")
      ));
      const curVer = pluginVersion || "0.1.0";
      const hasUpdate = updateInfo && updateInfo.latest && newerThan(updateInfo.latest, curVer);
      children.push(React.createElement("div", { className: "askit-foot", key: "foot" },
        React.createElement("span", { className: "askit-foot-ver" }, "v" + curVer),
        hasUpdate
          ? React.createElement("span", { className: "askit-foot-update" }, "有新版本 " + updateInfo.latest)
          : null,
        React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: checkUpdate }, "检查更新"),
        React.createElement("a", { className: "askit-sp-ghost askit-link", href: "https://kozan.fider.io/", target: "_blank", rel: "noreferrer" }, "反馈问题"),
        React.createElement("a", { className: "askit-author", href: "https://github.com/roxorlt", target: "_blank", rel: "noreferrer" }, "by @roxor")
      ));
      if (hasUpdate) {
        children.push(React.createElement("div", { className: "askit-update-tip", key: "uptip" },
          "终端执行 " + UPDATE_CMD + " 后重启 dsh web",
          React.createElement("button", { className: "askit-sp-ghost", type: "button", onClick: copyUpdateCmd }, "复制命令")
        ));
      }
      if (Toast) {
        children.push(toast !== null
          ? React.createElement(Toast, { key: "toast" + toast.seq, text: toast.text, onDone: dismissToast })
          : null);
      }

      return React.createElement("div", { className: "askit-sp" }, children);
    }

    const CSS = [
      ".askit-toggle { color: var(--dsw-alias-label-secondary); background: transparent; border: none; border-radius: 8px; padding: 0 8px; font-size: 13px; font-weight: 500; line-height: 20px; cursor: pointer; }",
      ".askit-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }",
      ".askit-toggle-on { color: var(--dsw-alias-label-primary); }",
      ".askit-backdrop { position: fixed; inset: 0; z-index: 1; }",
      ".askit-panel { z-index: 2; box-sizing: border-box; position: absolute; bottom: calc(100% + 4px); left: 0; width: min(620px, calc(100vw - 48px)); height: 340px; overflow: hidden; border: 1px solid var(--dsw-alias-border-inverted); background: var(--dsw-specific-menu); box-shadow: var(--dsw-shadow-lv3); border-radius: 12px; padding: 4px; color: var(--dsw-alias-label-primary); cursor: default; font-size: 13px; line-height: 20px; display: flex; font-family: var(--dsw-font-family, inherit); outline: none; }",
      ".askit-side { width: 224px; flex: none; overflow-y: auto; border-right: 1px solid var(--dsw-alias-border-inverted); padding: 2px; box-sizing: border-box; }",
      ".askit-scenario { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; padding: 8px 8px 2px; }",
      ".askit-opt { display: flex; flex-direction: column; align-items: flex-start; gap: 0; width: 100%; box-sizing: border-box; background: transparent; border: none; border-radius: 8px; padding: 6px 8px; cursor: pointer; text-align: left; }",
      ".askit-opt:hover { background: var(--dsw-alias-interactive-bg-hover); }",
      ".askit-opt-on { background: var(--dsw-alias-interactive-bg-hover); }",
      ".askit-opt-title { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }",
      ".askit-opt-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }",
      ".askit-main { flex: 1; min-width: 0; padding: 8px; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }",
      ".askit-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex: none; }",
      ".askit-title { flex: 1; font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary); }",
      ".askit-close { background: transparent; border: none; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 13px; border-radius: 6px; padding: 2px 6px; }",
      ".askit-close:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }",
      ".askit-error { color: var(--dsw-alias-state-error-primary); margin-bottom: 8px; font-size: 12px; }",
      ".askit-empty { color: var(--dsw-alias-label-tertiary); font-size: 12px; padding: 16px 8px; }",
      ".askit-fields { flex: none; }",
      ".askit-field { margin-bottom: 8px; }",
      ".askit-input { width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); background: transparent; border-radius: 8px; outline: none; padding: 6px 8px; font-size: 13px; font-family: var(--dsw-font-family, inherit); }",
      ".askit-input:focus { border-color: var(--dsw-alias-brand-primary); }",
      ".askit-preview { flex: 1; min-height: 96px; width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); background: transparent; border-radius: 8px; padding: 6px 8px; font-size: 12px; line-height: 18px; resize: none; outline: none; font-family: var(--dsw-font-family, inherit); margin-top: 4px; }",
      ".askit-actions { margin-top: 10px; display: flex; justify-content: flex-end; flex: none; }",
      ".askit-inject { background: var(--dsw-alias-button-info-fill, var(--dsw-alias-brand-primary)); color: #ffffff; border: none; border-radius: 999px; padding: 5px 14px; cursor: pointer; font-size: 13px; font-weight: 500; }",
      ".askit-inject:hover { background: var(--dsw-alias-button-info-hover, var(--dsw-alias-brand-primary)); }",
      ".askit-inject:disabled { opacity: 0.5; cursor: default; }",
      ".askit-sp { display: flex; flex-direction: column; gap: 4px; padding: 4px; font-family: var(--dsw-font-family, inherit); }",
      ".askit-sp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }",
      ".askit-sp-title { flex: 1; font-weight: 600; font-size: 14px; color: var(--dsw-alias-label-primary); }",
      ".askit-sp-group { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; padding: 12px 8px 2px; border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 6px; }",
      ".askit-sp-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; }",
      ".askit-sp-row:hover { background: var(--dsw-alias-interactive-bg-hover); }",
      ".askit-sp-row-off { opacity: 0.5; }",
      ".askit-sp-info { flex: 1; min-width: 0; }",
      ".askit-sp-btns { display: flex; gap: 6px; flex: none; }",
      ".askit-sp-ghost { background: transparent; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 2px 10px; cursor: pointer; font-size: 12px; white-space: nowrap; flex: none; }",
      ".askit-sp-ghost:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }",
      ".askit-sp-field { margin-bottom: 8px; }",
      ".askit-sp-label { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; margin: 4px 0 3px; }",
      ".askit-sp-hint { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; padding: 2px 2px 0; }",
      ".askit-sp-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }",
      ".askit-vars { margin-bottom: 8px; }",
      ".askit-var-row { display: flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 4px 8px; margin-bottom: 6px; font-size: 12px; }",
      ".askit-var-name { font-weight: 600; color: var(--dsw-alias-label-primary); flex: none; }",
      ".askit-var-ph { color: var(--dsw-alias-label-tertiary); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
      ".askit-varform { border: 1px dashed var(--dsw-alias-border-l2); border-radius: 8px; padding: 8px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px; }",
      ".askit-sugg-wrap { position: relative; }",
      ".askit-sugg { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; margin-top: 2px; border: 1px solid var(--dsw-alias-border-inverted); background: var(--dsw-specific-menu); box-shadow: var(--dsw-shadow-lv3); border-radius: 8px; padding: 2px; max-height: 160px; overflow: auto; }",
      ".askit-sugg-item { display: block; width: 100%; box-sizing: border-box; background: transparent; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; text-align: left; font-size: 12px; color: var(--dsw-alias-label-primary); }",
      ".askit-sugg-item:hover { background: var(--dsw-alias-interactive-bg-hover); }",
      ".askit-body { min-height: 120px; width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; outline: none; padding: 8px; font-size: 13px; line-height: 24px; color: var(--dsw-alias-label-primary); background: transparent; white-space: pre-wrap; word-break: break-word; font-family: var(--dsw-font-family, inherit); }",
      ".askit-body:focus { border-color: var(--dsw-alias-brand-primary); }",
      ".askit-chip { display: inline-block; vertical-align: baseline; margin: 0 3px; padding: 0 4px 0 8px; border: 1px solid var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); border-radius: 6px; font-size: 12px; line-height: 18px; cursor: default; }",
      ".askit-chip-x { display: inline-block; margin-left: 4px; padding: 0 2px; cursor: pointer; color: var(--dsw-alias-label-secondary); border-radius: 4px; }",
      ".askit-chip-x:hover { color: var(--dsw-alias-state-error-primary); }",
      ".askit-hist { padding-left: 8px; margin-bottom: 6px; }",
      ".askit-foot { display: flex; align-items: center; gap: 8px; padding: 12px 8px 4px; margin-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1); }",
      ".askit-foot-ver { color: var(--dsw-alias-label-tertiary); font-size: 12px; }",
      ".askit-foot-update { color: var(--dsw-alias-state-warn-primary); font-size: 12px; }",
      ".askit-author { color: var(--dsw-alias-label-secondary); font-size: 12px; text-decoration: none; margin-left: auto; }",
      ".askit-author:hover { color: var(--dsw-alias-brand-primary); }",
      ".askit-link { text-decoration: none; }",
      ".askit-update-tip { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; padding: 4px 8px 8px; display: flex; gap: 8px; align-items: center; }",
      ".askit-ver { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; margin-top: 2px; white-space: normal; overflow: visible; text-overflow: clip; }",
      ".askit-addcard { width: 100%; box-sizing: border-box; border: 1px dashed var(--dsw-alias-border-l2); background: transparent; color: inherit; font: inherit; cursor: pointer; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left; transition: background 0.12s, border-color 0.12s; margin-top: 6px; }",
      ".askit-addcard:hover { background: var(--dsw-alias-interactive-bg-hover); }",
      ".askit-addcard-top { display: flex; align-items: center; gap: 8px; min-width: 0; width: 100%; }",
      ".askit-addcard-chip { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); width: 28px; height: 28px; color: var(--dsw-alias-label-tertiary); border-radius: 8px; flex: none; display: inline-flex; justify-content: center; align-items: center; font-size: 16px; line-height: 1; }",
      ".askit-addcard:hover .askit-addcard-chip { border-color: color-mix(in srgb, var(--dsw-alias-button-primary-fill, #4c6ef5) 35%, transparent); background: color-mix(in srgb, var(--dsw-alias-button-primary-fill, #4c6ef5) 12%, transparent); color: var(--dsw-alias-button-primary-fill, #4c6ef5); }",
      ".askit-addcard-title { min-width: 0; color: var(--dsw-alias-label-secondary); white-space: nowrap; text-overflow: ellipsis; flex: 1; font-size: 13px; font-weight: 600; line-height: 20px; overflow: hidden; }",
      ".askit-addcard:hover .askit-addcard-title { color: var(--dsw-alias-label-primary); }",
      ".askit-addcard-desc { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; }",
      ".askit-addcard:hover .askit-addcard-desc { color: var(--dsw-alias-label-secondary); }"
    ].join("\n");

    function injectStyles(css) {
      const el = document.createElement("style");
      el.setAttribute("data-askit-styles", "1");
      el.textContent = css;
      document.head.appendChild(el);
      return () => {
        try { el.remove(); } catch (err) {}
      };
    }

    function apply(ctx) {
      scheduleFocus = (fn) => ctx.timeout(fn, 60);
      ctx.effect(() => injectStyles(CSS));
      ctx.slots.inject("conversation.input.left", () => ctx.slots.register(
        { name: "conversation.input.left", id: "askit-toggle", order: 100, label: "预设提示词" },
        () => React.createElement(ToggleButton)
      ));
      ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register(
        { name: "conversation.input.overlay", id: "askit-panel", order: 100, label: "预设提示词面板" },
        (props) => React.createElement(Panel, props)
      ));
      ctx.slots.inject("settings.section", () => ctx.slots.register(
        { name: "settings.section", id: "askit-prompts", order: 30, label: "预设提示词" },
        () => React.createElement(SettingsSection)
      ));
    }

    exports.apply = apply;
    exports.inject = ["slots", "timer"];
    return module.exports;
  }
});
