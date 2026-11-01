import { exportTemplate, fetchSample, fetchSchema, importTemplate } from "./api.js";
import { CanvasEditor } from "./canvas.js";
import { renderInspector } from "./inspector.js";
import { renderLayers, renderPalette } from "./palette.js";
import { blankDocument, EditorStore, makeComponent, normalizeDocument } from "./state.js";
import { $, clone, componentSpec, debounce, downloadExport, escapeHtml, formatBytes, icon, labelOf, snap, timeLabel, uid } from "./utils.js";

const STORAGE_KEY = "systmanyone.workspace.v1";
let schemaData;
let store;
let canvas;
let inspectorTab = "selection";
let componentClipboard = null;
let savePending = false;
let storageErrorShown = false;
let xmlRequestNumber = 0;
let xmlResult = null;

const inspectorHandlers = {
  onEdit: (label, mutate, options = {}) => store.commit(label, mutate, options),
  onDuplicateComponent: () => duplicateComponent(),
  onDeleteComponent: () => deleteComponent(),
  onDuplicatePage: duplicatePage,
  onDeletePage: deletePage,
  onMovePage: movePage,
  onAlign: alignComponent,
};

const scheduleAutosave = debounce(saveLocalWorkspace, 450);
const scheduleXmlRefresh = debounce(refreshXmlPreview, 250);

async function boot() {
  schemaData = await fetchSchema();
  const recovered = loadLocalWorkspace();
  store = new EditorStore(recovered?.doc || blankDocument());
  canvas = new CanvasEditor(store, schemaData, {
    onSelect: selectComponent,
    onAdd: addComponent,
    onEdit: focusComponentInspector,
    onEmptyAction: action => action === "sample" ? loadSample() : addComponent("title"),
  });
  bindInterface();
  store.subscribe(onStoreChange);
  renderPaletteNow();
  renderAll();
  requestAnimationFrame(() => store.setZoom(canvas.fitZoom()));
  if (recovered) toast(`Recovered your workspace from ${timeLabel(recovered.savedAt)}.`, "check-circle");
}

function bindInterface() {
  $("component-search").addEventListener("input", renderPaletteNow);
  $("components-tab").addEventListener("click", () => setLeftPanelTab("components"));
  $("layers-tab").addEventListener("click", () => setLeftPanelTab("layers"));
  $("selection-tab").addEventListener("click", () => setInspectorTab("selection"));
  $("template-tab").addEventListener("click", () => setInspectorTab("template"));
  $("document-settings").addEventListener("click", () => setInspectorTab("template", true));
  $("brand-button").addEventListener("click", () => setInspectorTab("template", true));

  $("new-button").addEventListener("click", newDocument);
  $("sample-button").addEventListener("click", loadSample);
  $("open-button").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", openFile);
  $("export-button").addEventListener("click", exportCurrentDocument);
  $("xml-export-button").addEventListener("click", exportCurrentDocument);
  $("xml-button").addEventListener("click", openXmlPreview);
  $("copy-xml-button").addEventListener("click", copyXml);
  $("shortcuts-button").addEventListener("click", () => $("shortcuts-dialog").showModal());
  document.querySelectorAll("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => $(button.dataset.closeDialog).close());
  });

  $("undo-button").addEventListener("click", () => store.undo());
  $("redo-button").addEventListener("click", () => store.redo());
  $("add-page-button").addEventListener("click", addPage);
  $("design-mode").addEventListener("click", () => store.setMode("design"));
  $("outline-mode").addEventListener("click", () => store.setMode("outline"));
  $("grid-button").addEventListener("click", () => store.toggleGrid());
  $("zoom-out").addEventListener("click", () => store.setZoom(store.zoom - .1));
  $("zoom-in").addEventListener("click", () => store.setZoom(store.zoom + .1));
  $("zoom-value").addEventListener("click", () => store.setZoom(1));
  $("zoom-fit").addEventListener("click", () => store.setZoom(canvas.fitZoom()));

  $("toggle-components").addEventListener("click", () => toggleMobilePanel("components"));
  $("toggle-inspector").addEventListener("click", () => toggleMobilePanel("inspector"));
  $("panel-backdrop").addEventListener("click", closeMobilePanels);
  window.addEventListener("resize", syncMobilePanelState);
  syncMobilePanelState();
  document.addEventListener("keydown", handleKeyboard);
  window.addEventListener("beforeunload", event => {
    if (!savePending) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function onStoreChange({ reason, origin }) {
  syncHeader();
  if (reason === "zoom") {
    canvas.updateZoom();
    syncCanvasControls();
    return;
  }
  if (reason === "view") {
    canvas.render();
    syncCanvasControls();
    return;
  }
  if (reason === "selection") {
    canvas.updateSelection();
    renderLayersNow();
    renderInspectorNow();
    syncCanvasControls();
    return;
  }

  renderPages();
  canvas.render();
  renderLayersNow();
  if (origin !== "inspector") renderInspectorNow();
  syncCanvasControls();
  if (["document", "replace", "history"].includes(reason)) {
    savePending = true;
    setSaveStatus("Saving…", true);
    scheduleAutosave();
    xmlResult = null;
    if ($("xml-dialog").open) scheduleXmlRefresh();
  }
}

function renderAll() {
  renderPages();
  canvas.render();
  renderLayersNow();
  renderInspectorNow();
  syncHeader();
  syncCanvasControls();
}

function renderPaletteNow() {
  renderPalette($("component-palette"), schemaData, $("component-search").value, addComponent);
}

function renderLayersNow() {
  renderLayers($("layers-view"), store, schemaData, {
    onSelect: selectComponent,
    onDuplicate: duplicateComponent,
    onDelete: deleteComponent,
    onMove: moveLayer,
  });
  $("layer-count").textContent = store.selectedPage.components.length;
}

function renderInspectorNow() {
  renderInspector($("inspector-content"), store, schemaData, inspectorTab, inspectorHandlers);
  $("selection-tab").classList.toggle("active", inspectorTab === "selection");
  $("selection-tab").setAttribute("aria-selected", String(inspectorTab === "selection"));
  $("selection-tab").tabIndex = inspectorTab === "selection" ? 0 : -1;
  $("template-tab").classList.toggle("active", inspectorTab === "template");
  $("template-tab").setAttribute("aria-selected", String(inspectorTab === "template"));
  $("template-tab").tabIndex = inspectorTab === "template" ? 0 : -1;
}

function renderPages() {
  const tabs = $("page-tabs");
  tabs.innerHTML = store.doc.pages.map((page, index) => `
    <button class="page-tab ${page._id === store.selection.pageId ? "active" : ""}" role="tab" aria-selected="${page._id === store.selection.pageId}" tabindex="${page._id === store.selection.pageId ? "0" : "-1"}" data-page-id="${page._id}" title="${escapeHtml(page.name)}">
      ${icon("page")}<span>${escapeHtml(page.name)}</span><span class="page-number">${index + 1}</span>
    </button>`).join("");
  tabs.querySelectorAll("[data-page-id]").forEach(button => {
    button.addEventListener("click", () => {
      inspectorTab = "selection";
      store.selectPage(button.dataset.pageId);
    });
  });
}

function syncHeader() {
  $("header-document-name").textContent = store.doc.name || "Untitled Template";
  $("undo-button").disabled = !store.past.length;
  $("redo-button").disabled = !store.future.length;
  document.title = `${store.doc.name || "Untitled Template"} · SystmAnyone`;
}

function syncCanvasControls() {
  $("design-mode").classList.toggle("active", store.mode === "design");
  $("design-mode").setAttribute("aria-pressed", String(store.mode === "design"));
  $("outline-mode").classList.toggle("active", store.mode === "outline");
  $("outline-mode").setAttribute("aria-pressed", String(store.mode === "outline"));
  $("grid-button").classList.toggle("active", store.showGrid);
  $("grid-button").setAttribute("aria-pressed", String(store.showGrid));
  $("zoom-value").textContent = `${Math.round(store.zoom * 100)}%`;
  $("canvas-size").textContent = `${store.doc.width} × ${store.doc.height}`;
  const component = store.selectedComponent;
  $("selection-status").textContent = component ?
    `${componentSpec(schemaData, component.kind).label} · ${labelOf(component) || "Untitled"} · X ${component.x}, Y ${component.y}` :
    `${store.selectedPage.name} · ${store.selectedPage.components.length} component${store.selectedPage.components.length === 1 ? "" : "s"}`;
}

function setLeftPanelTab(tab) {
  $("components-tab").classList.toggle("active", tab === "components");
  $("components-tab").setAttribute("aria-selected", String(tab === "components"));
  $("components-tab").tabIndex = tab === "components" ? 0 : -1;
  $("layers-tab").classList.toggle("active", tab === "layers");
  $("layers-tab").setAttribute("aria-selected", String(tab === "layers"));
  $("layers-tab").tabIndex = tab === "layers" ? 0 : -1;
  $("components-view").classList.toggle("hidden", tab !== "components");
  $("layers-view").classList.toggle("hidden", tab !== "layers");
}

function setInspectorTab(tab, openOnMobile = false) {
  inspectorTab = tab;
  renderInspectorNow();
  if (openOnMobile && matchMedia("(max-width: 980px)").matches) toggleMobilePanel("inspector", true);
}

function selectComponent(componentId) {
  inspectorTab = "selection";
  store.selectComponent(componentId);
}

function focusComponentInspector(componentId) {
  selectComponent(componentId);
  if (matchMedia("(max-width: 980px)").matches) toggleMobilePanel("inspector", true);
  setTimeout(() => $("inspector-content").querySelector("input[type='text'], textarea, select")?.focus(), 0);
}

function addComponent(kind, position = null) {
  const page = store.selectedPage;
  const nextY = page.components.length ? Math.max(...page.components.map(component => component.y + Math.max(component.h, 24))) + 12 : 12;
  const component = makeComponent(schemaData, kind, position || { x: 12, y: nextY });
  store.commit("Add component", () => {
    page.components.push(component);
    store.selection.componentId = component._id;
  });
  inspectorTab = "selection";
  renderInspectorNow();
  closeMobilePanels();
  setTimeout(() => canvas.scrollSelectionIntoView(), 0);
}

function duplicateComponent(componentId = store.selection.componentId) {
  const page = store.selectedPage;
  const index = page.components.findIndex(component => component._id === componentId);
  if (index < 0) return;
  const duplicate = clone(page.components[index]);
  duplicate._id = uid("component");
  duplicate.cid = null;
  duplicate.x += 12;
  duplicate.y += 12;
  store.commit("Duplicate component", () => {
    page.components.splice(index + 1, 0, duplicate);
    store.selection.componentId = duplicate._id;
  });
}

function deleteComponent(componentId = store.selection.componentId) {
  const page = store.selectedPage;
  const index = page.components.findIndex(component => component._id === componentId);
  if (index < 0) return;
  store.commit("Delete component", () => {
    page.components.splice(index, 1);
    store.selection.componentId = null;
  });
}

function moveLayer(index, direction) {
  const components = store.selectedPage.components;
  const target = index + direction;
  if (target < 0 || target >= components.length) return;
  store.commit("Reorder component", () => {
    [components[index], components[target]] = [components[target], components[index]];
  });
}

function alignComponent(direction) {
  const component = store.selectedComponent;
  if (!component) return;
  store.commit(`Align ${direction}`, () => {
    if (direction === "left") component.x = 0;
    if (direction === "center") component.x = snap((store.doc.width - component.w) / 2);
    if (direction === "right") component.x = store.doc.width - component.w;
    if (direction === "top") component.y = 0;
    if (direction === "middle") component.y = snap((store.doc.height - component.h) / 2);
    if (direction === "bottom") component.y = store.doc.height - component.h;
  });
}

function makePage(number) {
  return {
    _id: uid("page"), cid: null, name: `Page ${number}`, colour: -13108,
    male: true, female: true, minage: -1, minageunits: 0, maxage: -1, maxageunits: 0, components: [],
  };
}

function addPage() {
  const page = makePage(store.doc.pages.length + 1);
  store.commit("Add page", () => {
    store.doc.pages.push(page);
    store.selection = { pageId: page._id, componentId: null };
  });
  inspectorTab = "selection";
  renderInspectorNow();
  requestAnimationFrame(() => store.setZoom(canvas.fitZoom()));
}

function duplicatePage() {
  const source = store.selectedPage;
  const index = store.doc.pages.findIndex(page => page._id === source._id);
  const duplicate = clone(source);
  duplicate._id = uid("page");
  duplicate.cid = null;
  duplicate.name = `${source.name} copy`;
  duplicate.components = duplicate.components.map(component => ({ ...component, _id: uid("component"), cid: null }));
  store.commit("Duplicate page", () => {
    store.doc.pages.splice(index + 1, 0, duplicate);
    store.selection = { pageId: duplicate._id, componentId: null };
  });
}

function deletePage() {
  if (store.doc.pages.length === 1) return;
  const page = store.selectedPage;
  if (page.components.length && !confirm(`Delete “${page.name}” and its ${page.components.length} components? You can undo this action.`)) return;
  const index = store.doc.pages.findIndex(item => item._id === page._id);
  store.commit("Delete page", () => {
    store.doc.pages.splice(index, 1);
    const nextPage = store.doc.pages[Math.min(index, store.doc.pages.length - 1)];
    store.selection = { pageId: nextPage._id, componentId: null };
  });
}

function movePage(direction) {
  const index = store.doc.pages.findIndex(page => page._id === store.selection.pageId);
  const target = index + direction;
  if (target < 0 || target >= store.doc.pages.length) return;
  store.commit("Reorder pages", () => {
    [store.doc.pages[index], store.doc.pages[target]] = [store.doc.pages[target], store.doc.pages[index]];
  });
}

function hasWork() {
  const comparable = value => JSON.parse(JSON.stringify(value, (key, item) => ["_id", "cid"].includes(key) ? undefined : item));
  return JSON.stringify(comparable(store.doc)) !== JSON.stringify(comparable(blankDocument()));
}

function confirmReplace(action) {
  if (!hasWork()) return true;
  return confirm(`Replace the current template and ${action}? This clears the current editing history. Export it first if you need a separate copy.`);
}

function newDocument() {
  if (!confirmReplace("start a new template")) return;
  store.replace(blankDocument());
  inspectorTab = "selection";
  renderInspectorNow();
  requestAnimationFrame(() => store.setZoom(canvas.fitZoom()));
  toast("New template created.");
}

async function loadSample() {
  if (!confirmReplace("load the SMR sample")) return;
  try {
    store.replace(await fetchSample());
    inspectorTab = "selection";
    renderInspectorNow();
    requestAnimationFrame(() => store.setZoom(canvas.fitZoom()));
    toast("Deprescribing SMR sample loaded.", "sample");
  } catch (error) {
    toast(error.message, "alert", true);
  }
}

async function openFile(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file || !confirmReplace("open another template")) return;
  try {
    const data = await importTemplate(await file.text());
    if (!data._crc_ok && !confirm("This file’s CRC check does not match. It may have been edited or damaged. Open it anyway?")) return;
    const warnings = data._warnings || [];
    if (warnings.length && !confirm(`Some parts of this template are not supported by the builder and will be missing from the opened copy and any re-export:\n\n• ${warnings.join("\n• ")}\n\nOpen it anyway?`)) return;
    store.replace(data);
    inspectorTab = "selection";
    renderInspectorNow();
    requestAnimationFrame(() => store.setZoom(canvas.fitZoom()));
    const crcNote = data._crc_ok ? " — CRC verified" : " without CRC verification";
    if (warnings.length) toast(`${file.name} opened${crcNote}, but ${warnings.length} unsupported part${warnings.length > 1 ? "s were" : " was"} left out.`, "alert", true);
    else toast(`${file.name} opened${crcNote}.`, data._crc_ok ? "check-circle" : "alert");
  } catch (error) {
    toast(`Could not open ${file.name}: ${error.message}`, "alert", true);
  }
}

function loadLocalWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version !== 1 || !saved.doc?.pages) return null;
    return { doc: normalizeDocument(saved.doc), savedAt: saved.savedAt };
  } catch {
    return null;
  }
}

function saveLocalWorkspace() {
  try {
    const savedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, savedAt, doc: store.doc }));
    savePending = false;
    storageErrorShown = false;
    setSaveStatus("Saved locally", false);
  } catch {
    savePending = true;
    setSaveStatus("Local save unavailable", true);
    if (!storageErrorShown) {
      storageErrorShown = true;
      toast("Local recovery is unavailable. Export your template to avoid losing changes.", "alert", true);
    }
  }
}

function setSaveStatus(text, saving) {
  const status = $("save-status");
  status.innerHTML = `<span class="status-dot"></span>${escapeHtml(text)}`;
  status.classList.toggle("saving", saving);
}

function exportPayload() {
  const payload = clone(store.doc);
  for (const page of payload.pages) {
    for (const component of page.components) {
      const spec = componentSpec(schemaData, component.kind);
      for (const attribute of spec.attrs || []) {
        const explicitlyImported = component._explicit?.includes(attribute.name);
        if (!explicitlyImported && attribute.name in component.props && Object.is(component.props[attribute.name], attribute.default)) {
          delete component.props[attribute.name];
        }
      }
    }
  }
  return payload;
}

async function openXmlPreview() {
  $("xml-dialog").showModal();
  await refreshXmlPreview();
}

async function refreshXmlPreview() {
  const requestNumber = ++xmlRequestNumber;
  xmlResult = null;
  $("copy-xml-button").disabled = true;
  $("xml-size").textContent = "Generating…";
  try {
    const result = await exportTemplate(exportPayload());
    if (requestNumber !== xmlRequestNumber) return null;
    xmlResult = result;
    $("xml-preview").textContent = result.xml;
    $("xml-size").textContent = formatBytes(result.bytes);
    $("copy-xml-button").disabled = false;
    return result;
  } catch (error) {
    if (requestNumber !== xmlRequestNumber) return null;
    $("xml-preview").textContent = error.message;
    $("xml-size").textContent = "Export error";
    return null;
  }
}

async function copyXml() {
  const result = await refreshXmlPreview();
  if (!result) return;
  try {
    await navigator.clipboard.writeText(result.xml);
    toast("XML copied to the clipboard.", "copy");
  } catch {
    toast("Clipboard access was unavailable. Select the XML and copy it manually.", "alert", true);
  }
}

async function exportCurrentDocument() {
  if (!store.doc.name.trim()) {
    setInspectorTab("template", true);
    $("template-name")?.focus();
    toast("Give the template a name before exporting.", "alert", true);
    return;
  }
  const buttons = [$("export-button"), $("xml-export-button")];
  buttons.forEach(button => { button.disabled = true; });
  try {
    const result = await exportTemplate(exportPayload());
    downloadExport(result);
    xmlResult = result;
    toast(`${result.filename} exported.`, "download");
  } catch (error) {
    toast(`Export failed: ${error.message}`, "alert", true);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function handleKeyboard(event) {
  if (handleTabKeyboard(event)) return;
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    exportCurrentDocument();
    return;
  }
  const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || event.target.isContentEditable;
  if (event.key === "/" && !editing) {
    event.preventDefault();
    setLeftPanelTab("components");
    if (matchMedia("(max-width: 980px)").matches) toggleMobilePanel("components", true);
    $("component-search").focus();
    return;
  }
  if (event.key === "Escape") {
    closeMobilePanels();
    if (!document.querySelector("dialog[open]")) store.clearSelection();
    return;
  }
  if (editing || document.querySelector("dialog[open]")) return;
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? store.redo() : store.undo();
  } else if (modifier && event.key.toLowerCase() === "y") {
    event.preventDefault();
    store.redo();
  } else if (modifier && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateComponent();
  } else if (modifier && event.key.toLowerCase() === "c" && store.selectedComponent) {
    event.preventDefault();
    componentClipboard = clone(store.selectedComponent);
    toast("Component copied.", "copy");
  } else if (modifier && event.key.toLowerCase() === "v" && componentClipboard) {
    event.preventDefault();
    const pasted = clone(componentClipboard);
    pasted._id = uid("component");
    pasted.cid = null;
    pasted.x += 12;
    pasted.y += 12;
    store.commit("Paste component", () => {
      store.selectedPage.components.push(pasted);
      store.selection.componentId = pasted._id;
    });
  } else if (["Delete", "Backspace"].includes(event.key) && store.selectedComponent) {
    event.preventDefault();
    deleteComponent();
  } else if (event.key.startsWith("Arrow") && store.selectedComponent && !event.target.closest(".app-header, .side-panel, .page-bar, .canvas-toolbar, .canvas-footer, dialog")) {
    event.preventDefault();
    const distance = event.shiftKey ? 10 : 4;
    const component = store.selectedComponent;
    store.commit("Nudge component", () => {
      if (event.key === "ArrowLeft") component.x = Math.max(0, component.x - distance);
      if (event.key === "ArrowRight") component.x += distance;
      if (event.key === "ArrowUp") component.y = Math.max(0, component.y - distance);
      if (event.key === "ArrowDown") component.y += distance;
    }, { coalesceKey: `nudge:${component._id}:${event.key}` });
  }
}

function handleTabKeyboard(event) {
  const currentTab = event.target.closest?.('[role="tab"]');
  if (!currentTab || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return false;
  const tabs = [...currentTab.parentElement.querySelectorAll('[role="tab"]')].filter(tab => !tab.disabled);
  const tabList = currentTab.parentElement;
  const currentIndex = tabs.indexOf(currentTab);
  let nextIndex = currentIndex;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = (currentIndex + 1) % tabs.length;
  if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
  tabList.querySelector('[role="tab"][aria-selected="true"]')?.focus();
  return true;
}

function toggleMobilePanel(panel, forceOpen = false) {
  const target = panel === "components" ? $("components-panel") : $("inspector-panel");
  const other = panel === "components" ? $("inspector-panel") : $("components-panel");
  const open = forceOpen || !target.classList.contains("open");
  other.classList.remove("open");
  target.classList.toggle("open", open);
  $("panel-backdrop").classList.toggle("open", open);
  syncMobilePanelState();
  if (open) target.querySelector('.panel-tab[aria-selected="true"]')?.focus();
}

function closeMobilePanels() {
  const active = document.activeElement;
  if (matchMedia("(max-width: 980px)").matches) {
    if ($("components-panel").contains(active)) $("toggle-components").focus();
    if ($("inspector-panel").contains(active)) $("toggle-inspector").focus();
  }
  $("components-panel").classList.remove("open");
  $("inspector-panel").classList.remove("open");
  $("panel-backdrop").classList.remove("open");
  syncMobilePanelState();
}

function syncMobilePanelState() {
  const mobile = matchMedia("(max-width: 980px)").matches;
  for (const [panelName, toggleName] of [["components-panel", "toggle-components"], ["inspector-panel", "toggle-inspector"]]) {
    const panel = $(panelName);
    const open = panel.classList.contains("open");
    panel.inert = mobile && !open;
    if (mobile) panel.setAttribute("aria-hidden", String(!open));
    else panel.removeAttribute("aria-hidden");
    $(toggleName).setAttribute("aria-expanded", String(mobile && open));
  }
}

function toast(message, iconName = "check-circle", error = false) {
  const element = document.createElement("div");
  element.className = `toast${error ? " error" : ""}`;
  element.innerHTML = `${icon(iconName)}<span>${escapeHtml(message)}</span>`;
  $("toast-region").appendChild(element);
  setTimeout(() => element.remove(), 4200);
}

boot().catch(error => {
  document.body.innerHTML = `<main style="padding:40px;font-family:system-ui"><h1>SystmAnyone could not start</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">Try again</button></main>`;
});
