import { fetchTerms } from "./api.js";
import { parseQuestions } from "./structured.js";
import { clamp, componentSpec, escapeHtml, icon, labelOf, lineLengthAxis, sanitizeRichText, signedColourToHex, snap } from "./utils.js";

const optionTerms = new Map();

const HANDLE_DIRECTIONS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export class CanvasEditor {
  constructor(store, schemaData, callbacks) {
    this.store = store;
    this.schemaData = schemaData;
    this.callbacks = callbacks;
    this.pageElement = document.getElementById("canvas-page");
    this.scalerElement = document.getElementById("canvas-scaler");
    this.viewportElement = document.getElementById("canvas-viewport");
    this.bindDropTarget();
  }

  render() {
    const focusedComponentId = this.pageElement.contains(document.activeElement) ? document.activeElement.dataset.componentId : null;
    const page = this.store.selectedPage;
    const { doc, mode, selection } = this.store;
    this.pageElement.style.width = `${doc.width}px`;
    this.pageElement.style.height = `${doc.height}px`;
    this.pageElement.style.background = signedColourToHex(page.colour);
    this.pageElement.classList.toggle("show-grid", this.store.showGrid);
    this.pageElement.innerHTML = "";

    if (!page.components.length) {
      const empty = document.createElement("div");
      empty.className = "canvas-empty";
      empty.innerHTML = `
        <span class="empty-icon">${icon("components")}</span>
        <h2>Start building your template</h2>
        <p>Choose a component from the library, drag one here, or explore the sample medication review.</p>
        <div class="empty-actions">
          <button class="button primary" data-empty-action="heading">${icon("plus")}Add a heading</button>
          <button class="button secondary" data-empty-action="sample">${icon("sample")}Load SMR sample</button>
        </div>`;
      empty.querySelectorAll("[data-empty-action]").forEach(button => {
        button.addEventListener("click", event => {
          event.stopPropagation();
          this.callbacks.onEmptyAction(button.dataset.emptyAction);
        });
      });
      this.pageElement.appendChild(empty);
    }

    page.components.forEach((component, index) => {
      const element = document.createElement("div");
      const selected = component._id === selection.componentId;
      element.className = `canvas-component${selected ? " selected" : ""}`;
      element.dataset.componentId = component._id;
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", `Select ${labelOf(component) || componentSpec(this.schemaData, component.kind).label}`);
      element.style.left = `${component.x}px`;
      element.style.top = `${component.y}px`;
      element.style.width = `${this.displayWidth(component)}px`;
      element.style.height = `${this.displayHeight(component)}px`;
      element.style.zIndex = String(index + 1);

      const content = document.createElement("div");
      content.className = "component-content";
      content.inert = true;
      content.setAttribute("aria-hidden", "true");
      content.innerHTML = mode === "outline" ? this.outlineHTML(component) : this.widgetHTML(component);
      element.appendChild(content);
      if (selected) this.addHandles(element);

      element.addEventListener("pointerdown", event => this.startPointerEdit(event, component._id, element));
      element.addEventListener("dblclick", () => this.callbacks.onEdit(component._id));
      element.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.callbacks.onSelect(component._id);
        }
      });
      this.pageElement.appendChild(element);
    });

    this.pageElement.onpointerdown = event => {
      if (event.target === this.pageElement) this.store.clearSelection();
    };
    this.updateZoom();
    this.loadMissingOptionTerms(page);
    if (focusedComponentId) {
      this.pageElement.querySelector(`[data-component-id="${CSS.escape(focusedComponentId)}"]`)?.focus({ preventScroll: true });
    }
  }

  displayWidth(component) {
    if (component.kind === "hline" && component.props?.vertical) return Math.max(component.w, 12);
    return Math.max(component.w, 4);
  }

  displayHeight(component) {
    if (component.kind === "hline") return Math.max(component.h, 12);
    return Math.max(component.h, 6);
  }

  async loadMissingOptionTerms(page) {
    const missing = [...new Set(page.components.flatMap(component =>
      (component.props?.codes || component.props?.quals || "").split(";").filter(code => code && !optionTerms.has(code))))];
    if (!missing.length) return;
    missing.forEach(code => optionTerms.set(code, code));
    try {
      const { terms } = await fetchTerms(missing);
      Object.entries(terms).forEach(([code, term]) => optionTerms.set(code, term));
      if (Object.keys(terms).length) this.render();
    } catch {
      missing.forEach(code => optionTerms.delete(code));
    }
  }

  outlineHTML(component) {
    const spec = componentSpec(this.schemaData, component.kind);
    return `<div class="outline-component"><span class="outline-kind">${escapeHtml(spec.label)}</span>${escapeHtml(labelOf(component) || component.kind)}</div>`;
  }

  widgetHTML(component) {
    const props = component.props || {};
    const kind = component.kind;
    const text = props.text || props.label || props.DisplayText || "";
    const codes = (props.codes || props.quals || "").split(";").filter(Boolean);
    if (kind === "title") return `<strong>${escapeHtml(text)}</strong>`;
    if (kind === "formattedText") return sanitizeRichText(props.textString);
    if (kind === "hline") return props.vertical ? `<div class="vertical-rule"></div>` : "<hr>";
    if (kind === "checkBox") return `<label class="cb"><input type="checkbox" ${props.default ? "checked" : ""} disabled><span>${escapeHtml(text)}</span></label>`;
    if (kind === "comboBox" || kind === "qualifierComboBox") {
      const options = codes.map(code => `<option>${escapeHtml(optionTerms.get(code) || code)}</option>`).join("");
      return `<select disabled><option>${escapeHtml(text || "— select —")}</option>${options}</select>`;
    }
    if (kind === "multipleSelection" || kind === "radioPanel") {
      const type = kind === "radioPanel" ? "radio" : "checkbox";
      return `<div><span>${escapeHtml(text)}</span>${codes.map(code => `<div class="answer-row" title="${escapeHtml(code)}"><input type="${type}" disabled>${escapeHtml(optionTerms.get(code) || code)}</div>`).join("")}</div>`;
    }
    if (kind === "date") return `<div class="preview-row"><span class="preview-label">${escapeHtml(text)}</span><input type="date" disabled></div>`;
    if (kind === "numeric") return `<div class="preview-row"><span class="preview-label">${escapeHtml(text)}</span><input type="number" disabled><span class="preview-hint">${escapeHtml(props.units || "")}</span></div>`;
    if (kind === "bp") return `<div class="preview-row"><span class="preview-label">${escapeHtml(text)}</span><input type="number" disabled style="width:46px"><span>/</span><input type="number" disabled style="width:46px"><span class="preview-hint">mmHg</span></div>`;
    if (["textArea", "notes", "patientNote"].includes(kind)) return `<textarea disabled>${escapeHtml(props.presetNotes || props.text || "")}</textarea>`;
    if (["readCode", "handover"].includes(kind)) return `<div class="preview-row"><span class="preview-label">${escapeHtml(text)}</span><input type="text" disabled value="${escapeHtml(props.code || "")}"></div>`;
    if (["hyperlink", "pageLink"].includes(kind)) return `<a class="preview-link">${escapeHtml(props.DisplayText || text || "Link")}</a>`;
    if (["image", "drawing"].includes(kind)) return `<div class="image-placeholder">Image</div>`;
    if (kind === "patientSignature") return `<div class="image-placeholder">Sign here</div>`;
    if (kind === "quickAction") return `<button disabled>${escapeHtml(props.label || "Button")}</button>`;
    if (kind === "calculated") return `<span class="calc">${escapeHtml(text || props.calculation || "Calculation")} = …</span>`;
    if (kind === "scoredAssessment") return this.assessmentHTML(props);
    return `<span>${escapeHtml(text || component.kind)}</span>`;
  }

  assessmentHTML(props) {
    let output = `<strong>${escapeHtml(props.text || "")}</strong>`;
    for (const question of parseQuestions(props.questions)) {
      const inputType = question.multiple ? "checkbox" : "radio";
      output += `<div style="margin-top:3px">${escapeHtml(question.text)}</div>`;
      for (const answer of question.answers) {
        if (answer.text) output += `<div class="answer-row"><input type="${inputType}" disabled>${escapeHtml(answer.text)}</div>`;
      }
    }
    return output;
  }

  addHandles(element) {
    for (const direction of HANDLE_DIRECTIONS) {
      const handle = document.createElement("span");
      handle.className = "resize-handle";
      handle.dataset.direction = direction;
      handle.setAttribute("aria-hidden", "true");
      element.appendChild(handle);
    }
  }

  updateSelection() {
    this.pageElement.querySelectorAll(".canvas-component").forEach(element => {
      const selected = element.dataset.componentId === this.store.selection.componentId;
      element.classList.toggle("selected", selected);
      element.querySelectorAll(".resize-handle").forEach(handle => handle.remove());
      if (selected) this.addHandles(element);
    });
  }

  updateZoom() {
    const { doc, zoom } = this.store;
    this.scalerElement.style.width = `${doc.width * zoom}px`;
    this.scalerElement.style.height = `${doc.height * zoom}px`;
    this.pageElement.style.transform = `scale(${zoom})`;
  }

  fitZoom() {
    const availableWidth = Math.max(160, this.viewportElement.clientWidth - 64);
    const availableHeight = Math.max(160, this.viewportElement.clientHeight - 64);
    const fit = Math.min(availableWidth / this.store.doc.width, availableHeight / this.store.doc.height);
    return clamp(Math.round(fit * 20) / 20, .25, 2);
  }

  scrollSelectionIntoView() {
    const selected = this.pageElement.querySelector(`[data-component-id="${CSS.escape(this.store.selection.componentId || "")}"]`);
    selected?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  bindDropTarget() {
    this.pageElement.addEventListener("dragover", event => {
      if (event.dataTransfer.types.includes("application/x-systmanyone-component")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    });
    this.pageElement.addEventListener("drop", event => {
      const kind = event.dataTransfer.getData("application/x-systmanyone-component");
      if (!kind) return;
      event.preventDefault();
      const bounds = this.pageElement.getBoundingClientRect();
      const spec = componentSpec(this.schemaData, kind);
      const x = Math.max(0, snap((event.clientX - bounds.left) / this.store.zoom - spec.size[0] / 2));
      const y = Math.max(0, snap((event.clientY - bounds.top) / this.store.zoom - spec.size[1] / 2));
      this.callbacks.onAdd(kind, { x, y });
    });
  }

  startPointerEdit(event, componentId, element) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.callbacks.onSelect(componentId);
    const direction = event.target.dataset.direction || null;
    const component = this.store.selectedPage.components.find(item => item._id === componentId);
    if (!component) return;
    const before = this.store.capture();
    const startX = event.clientX;
    const startY = event.clientY;
    const original = { x: component.x, y: component.y, w: component.w, h: component.h };

    const move = moveEvent => {
      const deltaX = snap((moveEvent.clientX - startX) / this.store.zoom);
      const deltaY = snap((moveEvent.clientY - startY) / this.store.zoom);
      if (!direction) {
        component.x = Math.max(0, original.x + deltaX);
        component.y = Math.max(0, original.y + deltaY);
      } else {
        if (direction.includes("e")) component.w = Math.max(4, original.w + deltaX);
        if (direction.includes("s")) component.h = Math.max(4, original.h + deltaY);
        if (direction.includes("w")) {
          const requestedWidth = Math.max(4, original.w - deltaX);
          const nextX = Math.max(0, original.x + original.w - requestedWidth);
          component.x = nextX;
          component.w = original.x + original.w - nextX;
        }
        if (direction.includes("n")) {
          const requestedHeight = Math.max(4, original.h - deltaY);
          const nextY = Math.max(0, original.y + original.h - requestedHeight);
          component.y = nextY;
          component.h = original.y + original.h - nextY;
        }
      }
      if (component.kind === "hline") component.props.length = component[lineLengthAxis(component)];
      element.style.left = `${component.x}px`;
      element.style.top = `${component.y}px`;
      element.style.width = `${component.w}px`;
      element.style.height = `${this.displayHeight(component)}px`;
    };

    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      this.store.record(before, direction ? "Resize component" : "Move component", "canvas");
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }
}
