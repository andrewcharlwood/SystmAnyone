import { clone, componentSpec, lineLengthAxis, uid } from "./utils.js";

export function blankDocument() {
  return normalizeDocument({
    name: "New Template",
    description: "",
    category: "Miscellaneous",
    icon: "",
    male: true,
    female: true,
    width: 396,
    height: 636,
    pages: [{ name: "Page 1", components: [] }],
  });
}

export function normalizeDocument(input) {
  const documentState = {
    name: input.name || "New Template",
    description: input.description || "",
    category: input.category || "Miscellaneous",
    icon: input.icon || "",
    male: input.male !== false,
    female: input.female !== false,
    width: Number(input.width ?? 396),
    height: Number(input.height ?? 636),
    pages: (input.pages?.length ? input.pages : [{ name: "Page 1", components: [] }]).map((page, pageIndex) => ({
      ...page,
      _id: page._id || uid("page"),
      cid: page.cid ?? null,
      name: page.name || `Page ${pageIndex + 1}`,
      colour: Number(page.colour ?? -13108),
      male: page.male !== false,
      female: page.female !== false,
      minage: Number(page.minage ?? -1),
      minageunits: Number(page.minageunits ?? 0),
      maxage: Number(page.maxage ?? -1),
      maxageunits: Number(page.maxageunits ?? 0),
      components: (page.components || []).map(component => normalizeComponent(component)),
    })),
  };
  return documentState;
}

function normalizeComponent(component) {
  const normalized = {
    ...component,
    _id: component._id || uid("component"),
    cid: component.cid ?? null,
    x: Number(component.x ?? 12),
    y: Number(component.y ?? 12),
    w: Number(component.w ?? 120),
    h: Number(component.h ?? 24),
    props: { ...(component.props || {}) },
  };
  if (normalized.kind === "hline" && normalized.props.length != null) {
    const lengthAxis = lineLengthAxis(normalized);
    normalized[lengthAxis] = Number(normalized.props.length);
    normalized[lengthAxis === "w" ? "h" : "w"] = 0;
  }
  return normalized;
}

export function makeComponent(schemaData, kind, position = {}) {
  const spec = componentSpec(schemaData, kind);
  const props = {};
  for (const attribute of spec.attrs || []) props[attribute.name] = clone(attribute.default ?? "");
  return {
    _id: uid("component"),
    cid: null,
    kind,
    x: position.x ?? 12,
    y: position.y ?? 12,
    w: position.w ?? spec.size[0],
    h: position.h ?? spec.size[1],
    props,
  };
}

export class EditorStore {
  constructor(documentState) {
    this.doc = documentState;
    this.selection = { pageId: documentState.pages[0]._id, componentId: null };
    this.mode = "design";
    this.zoom = 1;
    this.showGrid = false;
    this.past = [];
    this.future = [];
    this.listeners = new Set();
    this.lastEdit = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
  }

  emit(reason, origin = null) {
    for (const listener of this.listeners) listener({ reason, origin });
  }

  capture() {
    return { doc: clone(this.doc), selection: clone(this.selection) };
  }

  commit(label, mutate, { origin = null, coalesceKey = null } = {}) {
    const before = this.capture();
    const now = Date.now();
    const coalesce = coalesceKey && this.lastEdit?.key === coalesceKey && now - this.lastEdit.time < 800;
    if (!coalesce) {
      this.past.push(before);
      if (this.past.length > 100) this.past.shift();
    }
    this.future = [];
    this.lastEdit = coalesceKey ? { key: coalesceKey, time: now } : null;
    mutate(this.doc);
    this.emit("document", origin);
    return label;
  }

  record(before, label, origin = null) {
    if (JSON.stringify(before.doc) === JSON.stringify(this.doc)) return;
    this.past.push(before);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.lastEdit = null;
    this.emit("document", origin);
  }

  replace(documentState) {
    this.doc = normalizeDocument(documentState);
    this.selection = { pageId: this.doc.pages[0]._id, componentId: null };
    this.past = [];
    this.future = [];
    this.lastEdit = null;
    this.emit("replace");
  }

  undo() {
    if (!this.past.length) return;
    const previous = this.past.pop();
    this.future.push(this.capture());
    this.doc = previous.doc;
    this.selection = previous.selection;
    this.lastEdit = null;
    this.ensureSelection();
    this.emit("history");
  }

  redo() {
    if (!this.future.length) return;
    const next = this.future.pop();
    this.past.push(this.capture());
    this.doc = next.doc;
    this.selection = next.selection;
    this.lastEdit = null;
    this.ensureSelection();
    this.emit("history");
  }

  ensureSelection() {
    let page = this.selectedPage;
    if (!page) {
      page = this.doc.pages[0];
      this.selection.pageId = page?._id || null;
      this.selection.componentId = null;
    }
    if (this.selection.componentId && !page?.components.some(component => component._id === this.selection.componentId)) {
      this.selection.componentId = null;
    }
  }

  get selectedPage() {
    return this.doc.pages.find(page => page._id === this.selection.pageId) || this.doc.pages[0];
  }

  get selectedComponent() {
    return this.selectedPage?.components.find(component => component._id === this.selection.componentId) || null;
  }

  selectPage(pageId) {
    if (this.selection.pageId === pageId && !this.selection.componentId) return;
    this.selection = { pageId, componentId: null };
    this.lastEdit = null;
    this.emit("page");
  }

  selectComponent(componentId) {
    this.selection.componentId = componentId;
    this.lastEdit = null;
    this.emit("selection");
  }

  clearSelection() {
    if (!this.selection.componentId) return;
    this.selection.componentId = null;
    this.emit("selection");
  }

  setMode(mode) {
    this.mode = mode;
    this.emit("view");
  }

  setZoom(zoom) {
    this.zoom = Math.min(2, Math.max(.25, zoom));
    this.emit("zoom");
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.emit("view");
  }
}
