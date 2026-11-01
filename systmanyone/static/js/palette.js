import { componentIcon, componentSpec, escapeHtml, icon, labelOf } from "./utils.js";

export function renderPalette(container, schemaData, query, onAdd) {
  const normalizedQuery = query.trim().toLowerCase();
  const groups = schemaData.groups.map(group => ({
    group,
    components: Object.entries(schemaData.components).filter(([kind, spec]) =>
      spec.group === group && (!normalizedQuery || `${spec.label} ${kind}`.toLowerCase().includes(normalizedQuery))),
  })).filter(group => group.components.length);

  if (!groups.length) {
    container.innerHTML = `<div class="empty-search"><strong>No components found</strong>Try a different name or keyword.</div>`;
    return;
  }

  container.innerHTML = groups.map(({ group, components }, groupIndex) => `
    <details class="palette-group" ${normalizedQuery || groupIndex === 0 ? "open" : ""}>
      <summary>${icon("chevron")}${escapeHtml(group)}<span>${components.length}</span></summary>
      <div class="palette-items">
        ${components.map(([kind, spec]) => `
          <button class="palette-item" draggable="true" data-kind="${escapeHtml(kind)}" title="Add ${escapeHtml(spec.label)}">
            <span class="component-icon">${icon(componentIcon(kind))}</span>
            <span>${escapeHtml(spec.label)}</span>
            ${icon("plus", "add-icon")}
          </button>`).join("")}
      </div>
    </details>`).join("");

  container.querySelectorAll(".palette-item").forEach(button => {
    button.addEventListener("click", () => onAdd(button.dataset.kind));
    button.addEventListener("dragstart", event => {
      event.dataTransfer.setData("application/x-systmanyone-component", button.dataset.kind);
      event.dataTransfer.setData("text/plain", button.dataset.kind);
      event.dataTransfer.effectAllowed = "copy";
    });
  });
}

export function renderLayers(container, store, schemaData, handlers) {
  const page = store.selectedPage;
  const selectedId = store.selection.componentId;
  if (!page.components.length) {
    container.innerHTML = `<div class="panel-empty">${icon("layers")}<strong>This page is empty</strong><p>Add a component and it will appear here. Layers let you select and reorder overlapping elements.</p></div>`;
    return;
  }

  const components = [...page.components].reverse();
  container.innerHTML = `
    <div class="layer-header"><strong>${escapeHtml(page.name)}</strong><span>${page.components.length} component${page.components.length === 1 ? "" : "s"} · topmost first</span></div>
    <div class="layer-list">
      ${components.map(component => {
        const spec = componentSpec(schemaData, component.kind);
        const index = page.components.findIndex(item => item._id === component._id);
        const label = labelOf(component) || `Untitled ${spec.label.toLowerCase()}`;
        return `<div class="layer-row ${component._id === selectedId ? "selected" : ""}" data-layer-id="${component._id}">
          <button class="layer-select" data-select="${component._id}" aria-label="Select ${escapeHtml(label)}">
            ${icon(componentIcon(component.kind))}
            <span class="layer-label"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(spec.label)}</small></span>
          </button>
          <span class="layer-position">${component.x}, ${component.y}</span>
          <div class="layer-actions">
            <button class="icon-button small" data-move="1" data-index="${index}" aria-label="Bring ${escapeHtml(label)} forward" title="Bring forward" ${index === page.components.length - 1 ? "disabled" : ""}>${icon("up")}</button>
            <button class="icon-button small" data-move="-1" data-index="${index}" aria-label="Send ${escapeHtml(label)} backward" title="Send backward" ${index === 0 ? "disabled" : ""}>${icon("down")}</button>
            <button class="icon-button small" data-duplicate="${component._id}" aria-label="Duplicate ${escapeHtml(label)}" title="Duplicate">${icon("copy")}</button>
            <button class="icon-button small danger" data-delete="${component._id}" aria-label="Delete ${escapeHtml(label)}" title="Delete">${icon("trash")}</button>
          </div>
        </div>`;
      }).join("")}
    </div>`;

  container.querySelectorAll("[data-select]").forEach(button => {
    button.addEventListener("click", () => handlers.onSelect(button.dataset.select));
  });
  container.querySelectorAll("[data-duplicate]").forEach(button => {
    button.addEventListener("click", () => handlers.onDuplicate(button.dataset.duplicate));
  });
  container.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", () => handlers.onDelete(button.dataset.delete));
  });
  container.querySelectorAll("[data-move]").forEach(button => {
    button.addEventListener("click", () => handlers.onMove(Number(button.dataset.index), Number(button.dataset.move)));
  });
}
