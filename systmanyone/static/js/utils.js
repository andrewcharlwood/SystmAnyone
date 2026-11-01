export const $ = id => document.getElementById(id);
export const clone = value => structuredClone(value);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const snap = value => Math.round(value / 4) * 4;

let idCounter = 0;
export function uid(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export function icon(name, className = "") {
  return `<svg${className ? ` class="${className}"` : ""} aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function labelOf(component) {
  const props = component.props || {};
  return props.text || props.textString?.replace(/<[^>]+>/g, " ").trim() || props.label ||
    props.DisplayText || props.name || props.calculation || "";
}

export function lineLengthAxis(component) {
  return component.props?.vertical ? "h" : "w";
}

export function componentSpec(schemaData, kind) {
  return schemaData.components[kind] || { label: kind, group: "Other", size: [120, 24], attrs: [] };
}

export function componentIcon(kind) {
  return ({
    title: "heading", formattedText: "text", textArea: "text", notes: "text", patientNote: "text",
    hyperlink: "link", pageLink: "link", image: "image", drawing: "image", hline: "minus",
    checkBox: "check", comboBox: "select", qualifierComboBox: "select", multipleSelection: "components",
    radioPanel: "radio", date: "calendar", readCode: "code", bp: "activity", numeric: "calculator",
    calculated: "calculator", scoredAssessment: "layers", quickAction: "button", patientSignature: "signature",
    handover: "open",
  })[kind] || "components";
}

export function signedColourToHex(value) {
  const numeric = Number(value ?? 0);
  const unsigned = numeric < 0 ? numeric + 0x1000000 : numeric;
  return `#${(unsigned & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function hexToSignedColour(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return value > 0x7fffff ? value - 0x1000000 : value;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function downloadExport(result) {
  const binary = atob(result.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/xml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sanitizeRichText(markup) {
  const parsed = new DOMParser().parseFromString(`<div>${markup || ""}</div>`, "text/html");
  const allowed = new Set(["T", "P", "BR", "B", "STRONG", "EM", "I", "U", "DIV"]);

  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode("");
    if (!allowed.has(node.tagName)) return document.createTextNode(node.textContent);
    const element = node.tagName === "T" ? document.createElement("span") :
      document.createElement(node.tagName === "P" ? "div" : node.tagName.toLowerCase());
    if (node.tagName === "T" && node.getAttribute("b") === "b") element.style.fontWeight = "700";
    for (const child of node.childNodes) element.appendChild(clean(child));
    return element;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "rich";
  for (const child of parsed.body.firstElementChild.childNodes) wrapper.appendChild(clean(child));
  return wrapper.outerHTML;
}

export function debounce(callback, delay) {
  let timeout;
  const wrapped = (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), delay);
  };
  wrapped.cancel = () => clearTimeout(timeout);
  return wrapped;
}

export function timeLabel(isoDate) {
  if (!isoDate) return "recently";
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}
