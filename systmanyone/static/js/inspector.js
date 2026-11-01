import { searchCodes } from "./api.js";
import { codeList, editableCodeList, parseQuestions, serializeCodes, serializeQuestions } from "./structured.js";
import { componentIcon, componentSpec, debounce, escapeHtml, hexToSignedColour, icon, labelOf, lineLengthAxis, signedColourToHex } from "./utils.js";

const ADVANCED_ATTRIBUTES = new Set([
  "amendNotes", "date", "future", "showTimeComponent", "problem", "journal", "summary", "level",
  "reportDefault", "bias", "reqStat", "orientation", "reevaluate", "report", "restrictToSnomed",
  "BpTextMode", "BodyRegion", "Laterality", "ShowDetailBtn", "showArrow", "factor", "bounds",
  "repopulateDays", "actionId", "KeyImage", "image", "legend", "fix", "Ratio", "width",
  "dataEntryStyle", "patientNoteType", "backDate", "futureDate",
]);

let fieldCounter = 0;

export function renderInspector(container, store, schemaData, activeTab, handlers) {
  fieldCounter = 0;
  if (activeTab === "template") {
    renderTemplate(container, store, handlers);
  } else if (store.selectedComponent) {
    renderComponent(container, store, schemaData, handlers);
  } else {
    renderPage(container, store, handlers);
  }
}

function renderComponent(container, store, schemaData, handlers) {
  const component = store.selectedComponent;
  const spec = componentSpec(schemaData, component.kind);
  const primary = spec.attrs.filter(attribute => !ADVANCED_ATTRIBUTES.has(attribute.name));
  const advanced = spec.attrs.filter(attribute => ADVANCED_ATTRIBUTES.has(attribute.name));
  const label = labelOf(component) || `Untitled ${spec.label.toLowerCase()}`;

  container.innerHTML = `
    <div class="inspector-heading">
      <span class="component-icon">${icon(componentIcon(component.kind))}</span>
      <div class="inspector-title"><span class="eyebrow">COMPONENT</span><h2>${escapeHtml(spec.label)}</h2><p>${escapeHtml(label)}</p></div>
      <div class="inspector-actions">
        <button class="icon-button small" id="duplicate-component" aria-label="Duplicate component" title="Duplicate">${icon("copy")}</button>
        <button class="icon-button small danger" id="delete-component" aria-label="Delete component" title="Delete">${icon("trash")}</button>
      </div>
    </div>
    <section class="inspector-section"><h3>Content & behaviour</h3><div id="primary-fields">${primary.map(attribute => attributeField(component, attribute)).join("") || '<p class="field-help">This component only has layout properties.</p>'}</div></section>
    <details class="inspector-details" open>
      <summary>${icon("chevron")}Position & size<span class="section-count">${component.x}, ${component.y}</span></summary>
      <div class="details-body">
        <div class="position-grid">
          ${["x", "y", "w", "h"].map(key => `<div class="field"><label for="layout-${key}">${({ x: "X position", y: "Y position", w: "Width", h: "Height" })[key]}</label><div class="input-with-label"><span>${key.toUpperCase()}</span><input id="layout-${key}" type="number" data-layout="${key}" value="${component[key]}"></div></div>`).join("")}
        </div>
        <div class="alignment-control" aria-label="Align component on page">
          ${[["left", "L"], ["center", "C"], ["right", "R"], ["top", "T"], ["middle", "M"], ["bottom", "B"]].map(([direction, text]) => `<button data-align="${direction}" title="Align ${direction}" aria-label="Align ${direction}">${text}</button>`).join("")}
        </div>
      </div>
    </details>
    ${advanced.length ? `<details class="inspector-details"><summary>${icon("chevron")}Advanced properties<span class="section-count">${advanced.length}</span></summary><div class="details-body" id="advanced-fields">${advanced.map(attribute => attributeField(component, attribute)).join("")}</div></details>` : ""}
    <div class="validation-note">${icon("alert")}<span>SystmOne rendering is approximate. Preview the exported template in SystmOne before clinical use.</span></div>`;

  container.querySelector("#duplicate-component").addEventListener("click", handlers.onDuplicateComponent);
  container.querySelector("#delete-component").addEventListener("click", handlers.onDeleteComponent);
  bindAttributeFields(container, component, spec.attrs, handlers);
  bindLayoutFields(container, component, handlers);
  container.querySelectorAll("[data-align]").forEach(button => {
    button.addEventListener("click", () => handlers.onAlign(button.dataset.align));
  });
}

function attributeField(component, attribute) {
  const value = component.props[attribute.name] ?? attribute.default ?? "";
  const id = `field-${fieldCounter += 1}`;
  const help = attribute.help ? `<div class="field-help">${escapeHtml(attribute.help)}</div>` : "";
  const label = escapeHtml(attribute.label);

  if (attribute.type === "bool") {
    return `<div class="switch-field"><div class="switch-copy"><label for="${id}">${label}</label>${attribute.help ? `<small>${escapeHtml(attribute.help)}</small>` : ""}</div><label class="switch"><input id="${id}" type="checkbox" role="switch" data-attribute="${attribute.name}" data-type="bool" ${value === true || value === "y" ? "checked" : ""}><span class="switch-track"></span></label></div>`;
  }
  if (attribute.type === "code") {
    return `<div class="field"><label for="${id}">${label}</label><div class="code-picker" data-code-picker="${attribute.name}"><div class="code-search-wrap">${icon("search")}<input class="code-search-input" id="${id}" type="search" value="${escapeHtml(value)}" placeholder="Search by code or term" autocomplete="off" aria-autocomplete="list"><div class="code-results" role="listbox" hidden></div></div><div class="code-value" hidden></div></div>${help}</div>`;
  }
  if (attribute.type === "codemulti") return codeOptionsField(component, attribute, id, help);
  if (attribute.type === "questions") return questionsField(component, attribute, id);
  if (attribute.name === "colour") return colourField(attribute, value, id);

  let input;
  if (attribute.type === "choice") {
    input = `<select id="${id}" data-attribute="${attribute.name}" data-type="choice">${attribute.choices.map(([choiceValue, choiceLabel]) => `<option value="${escapeHtml(choiceValue)}" ${choiceValue === value ? "selected" : ""}>${escapeHtml(choiceLabel)}</option>`).join("")}</select>`;
  } else if (attribute.type === "int") {
    input = `<input id="${id}" type="number" data-attribute="${attribute.name}" data-type="int" value="${escapeHtml(value)}">`;
  } else if (attribute.type === "richtext") {
    input = `<textarea id="${id}" class="code-textarea" data-attribute="${attribute.name}" data-type="richtext">${escapeHtml(value)}</textarea><div class="field-help">Supports SystmOne markup: &lt;t b="b"&gt;bold&lt;/t&gt; and &lt;p&gt;paragraph&lt;/p&gt;.</div>`;
  } else if (["presetNotes", "default"].includes(attribute.name) && String(value).length > 60) {
    input = `<textarea id="${id}" data-attribute="${attribute.name}" data-type="str">${escapeHtml(value)}</textarea>`;
  } else {
    input = `<input id="${id}" type="text" data-attribute="${attribute.name}" data-type="str" value="${escapeHtml(value)}">`;
  }
  return `<div class="field"><label for="${id}">${label}</label>${input}${help}</div>`;
}

function colourField(attribute, value, id) {
  return `<div class="field"><label for="${id}">${escapeHtml(attribute.label)}</label><div class="color-field"><input id="${id}" type="color" data-colour-picker="${attribute.name}" value="${signedColourToHex(value)}" aria-label="${escapeHtml(attribute.label)} colour picker"><input type="number" data-attribute="${attribute.name}" data-type="int" value="${Number(value)}" aria-label="${escapeHtml(attribute.label)} RGB integer"></div><div class="field-help">Choose a colour or enter SystmOne’s signed RGB value.</div></div>`;
}

function codeOptionsField(component, attribute, id, help) {
  const codes = codeList(component.props[attribute.name]);
  return `<div class="field" data-code-options="${attribute.name}"><span class="field-label">${escapeHtml(attribute.label)}</span>
    <div class="option-list">${codes.map((code, index) => `<div class="option-row" data-option-row="${index}"><div class="option-main"><input type="text" value="${escapeHtml(code)}" data-option-code="${index}" aria-label="Option ${index + 1} code"><span class="option-term" data-option-term="${index}">Looking up term…</span></div><div class="option-actions"><button class="icon-button" data-option-move="-1" data-index="${index}" aria-label="Move option up" ${index === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-button" data-option-move="1" data-index="${index}" aria-label="Move option down" ${index === codes.length - 1 ? "disabled" : ""}>${icon("down")}</button></div><button class="icon-button small danger" data-option-delete="${index}" aria-label="Remove option ${index + 1}">${icon("trash")}</button></div>`).join("")}</div>
    <div class="code-picker" data-code-options-add="${attribute.name}"><div class="code-search-wrap">${icon("search")}<input class="code-search-input" id="${id}" type="search" placeholder="Search or enter a code to add" autocomplete="off" aria-label="Add an option code"><div class="code-results" role="listbox" hidden></div></div><div class="field-help">Search the terminology or press Enter to add a raw code.</div></div>
    <details class="raw-editor"><summary>Edit as semicolon-separated codes</summary><textarea class="code-textarea" data-raw-codes="${attribute.name}" aria-label="Raw ${escapeHtml(attribute.label)}">${escapeHtml(component.props[attribute.name] || "")}</textarea></details>${help}</div>`;
}

function questionsField(component, attribute, id) {
  const questions = parseQuestions(component.props[attribute.name]);
  return `<div class="field" data-questions="${attribute.name}"><span class="field-label">${escapeHtml(attribute.label)}</span>
    <div class="question-list">${questions.map((question, questionIndex) => `<div class="question-card" data-question="${questionIndex}">
      <div class="question-card-header"><span class="question-number">QUESTION ${questionIndex + 1}</span><button class="icon-button small danger" data-remove-question="${questionIndex}" aria-label="Remove question ${questionIndex + 1}">${icon("trash")}</button></div>
      <input class="question-title-input" type="text" value="${escapeHtml(question.text)}" data-question-field="text" data-question-index="${questionIndex}" aria-label="Question ${questionIndex + 1} text">
      <div class="question-options"><label><input type="checkbox" data-question-field="multiple" data-question-index="${questionIndex}" ${question.multiple ? "checked" : ""}>Multiple selections</label><label><input type="checkbox" data-question-field="required" data-question-index="${questionIndex}" ${question.required ? "checked" : ""}>Required</label></div>
      <div class="answer-headings"><span>Answer</span><span>Code</span><span>Score</span><span></span></div>
      <div class="answer-list">${question.answers.map((answer, answerIndex) => `<div class="answer-row"><input type="text" value="${escapeHtml(answer.text)}" data-answer-field="text" data-question-index="${questionIndex}" data-answer-index="${answerIndex}" aria-label="Answer text"><input type="text" value="${escapeHtml(answer.code)}" data-answer-field="code" data-question-index="${questionIndex}" data-answer-index="${answerIndex}" aria-label="Answer code"><input type="text" value="${escapeHtml(answer.score)}" data-answer-field="score" data-question-index="${questionIndex}" data-answer-index="${answerIndex}" aria-label="Answer score"><button class="icon-button small danger" data-remove-answer="${answerIndex}" data-question-index="${questionIndex}" aria-label="Remove answer">${icon("trash")}</button></div>`).join("")}</div>
      <button class="text-button" data-add-answer="${questionIndex}">${icon("plus")}Add answer</button>
    </div>`).join("")}</div>
    <button class="button secondary small" data-add-question>${icon("plus")}Add question</button>
    <details class="raw-editor"><summary>Edit raw question markup</summary><textarea id="${id}" class="code-textarea" data-raw-questions="${attribute.name}" aria-label="Raw questions and scoring">${escapeHtml(component.props[attribute.name] || "")}</textarea><div class="field-help">Question [*][!] :: Answer=CODE:score ; Answer=CODE:score</div></details></div>`;
}

function bindAttributeFields(container, component, attributes, handlers) {
  container.querySelectorAll("[data-attribute]").forEach(input => {
    const attribute = attributes.find(item => item.name === input.dataset.attribute);
    if (!attribute) return;
    const update = () => {
      let value = input.value;
      if (input.dataset.type === "bool") value = input.checked;
      if (input.dataset.type === "int") value = Number(input.value || 0);
      handlers.onEdit(`Edit ${attribute.label}`, () => {
        component.props[attribute.name] = value;
        if (component.kind === "hline" && attribute.name === "length") component[lineLengthAxis(component)] = Number(value);
        if (component.kind === "hline" && attribute.name === "vertical") {
          const length = Number(component.props.length || 0);
          Object.assign(component, value ? { w: 0, h: length } : { w: length, h: 0 });
        }
      }, {
        origin: "inspector", coalesceKey: `component:${component._id}:${attribute.name}`,
      });
      if (component.kind === "hline" && attribute.name === "length") {
        const widthInput = container.querySelector(`[data-layout="${lineLengthAxis(component)}"]`);
        if (widthInput) widthInput.value = value;
      }
      if (attribute.name === "colour") {
        const picker = container.querySelector(`[data-colour-picker="${attribute.name}"]`);
        if (picker && document.activeElement !== picker) picker.value = signedColourToHex(value);
      }
    };
    input.addEventListener(input.dataset.type === "bool" || input.dataset.type === "choice" ? "change" : "input", update);
  });

  container.querySelectorAll("[data-colour-picker]").forEach(picker => {
    picker.addEventListener("input", () => {
      const value = hexToSignedColour(picker.value);
      const numberInput = container.querySelector(`[data-attribute="${picker.dataset.colourPicker}"]`);
      if (numberInput) numberInput.value = value;
      handlers.onEdit("Edit colour", () => { component.props[picker.dataset.colourPicker] = value; }, {
        origin: "inspector", coalesceKey: `component:${component._id}:colour`,
      });
    });
  });

  container.querySelectorAll("[data-code-picker]").forEach(picker => {
    bindCodePicker(picker, component.props[picker.dataset.codePicker] || "", code => {
      component.props[picker.dataset.codePicker] = code;
    }, component, handlers, `component:${component._id}:${picker.dataset.codePicker}`);
  });
  bindCodeOptions(container, component, handlers);
  bindQuestions(container, component, handlers);
}

function bindCodePicker(picker, initialValue, assign, component, handlers, coalesceKey, onPick = null) {
  const input = picker.querySelector(".code-search-input");
  const results = picker.querySelector(".code-results");
  const valueInfo = picker.querySelector(".code-value");
  let currentResults = [];
  let activeIndex = -1;
  let requestNumber = 0;

  const showValue = async code => {
    if (!valueInfo) return;
    if (!code) { valueInfo.hidden = true; return; }
    const data = await searchCodes(code, 20).catch(() => null);
    const match = data?.results?.find(result => result.code === code);
    valueInfo.hidden = false;
    valueInfo.innerHTML = `${icon(match ? "check-circle" : "alert")}<span>${match ? escapeHtml(match.term) : "Custom code (not found in the bundled dictionary)"}</span>`;
  };

  const choose = code => {
    results.hidden = true;
    if (onPick) {
      input.value = "";
      onPick(code);
      return;
    }
    input.value = code;
    handlers.onEdit("Choose clinical code", () => assign(code), { origin: "inspector", coalesceKey });
    showValue(code);
  };

  const search = debounce(async () => {
    const query = input.value.trim();
    const currentRequest = ++requestNumber;
    if (!query) { results.hidden = true; return; }
    const data = await searchCodes(query).catch(() => null);
    if (currentRequest !== requestNumber || query !== input.value.trim() || document.activeElement !== input) return;
    currentResults = data?.results || [];
    activeIndex = currentResults.length ? 0 : -1;
    results.innerHTML = currentResults.length ? currentResults.map((result, index) => `<button class="code-result ${index === activeIndex ? "active" : ""}" role="option" data-result-index="${index}"><strong>${escapeHtml(result.code)}</strong><span>${escapeHtml(result.term)}</span><small>${escapeHtml(result.system || "Clinical terminology")}</small></button>`).join("") : `<div class="code-result"><span>No dictionary matches. Press Enter to keep “${escapeHtml(query)}”.</span></div>`;
    results.hidden = false;
    results.querySelectorAll("[data-result-index]").forEach(button => {
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", () => choose(currentResults[Number(button.dataset.resultIndex)].code));
    });
  }, 180);

  input.addEventListener("input", () => {
    requestNumber += 1;
    currentResults = [];
    activeIndex = -1;
    results.hidden = true;
    if (!onPick) {
      handlers.onEdit("Edit clinical code", () => assign(input.value.trim()), { origin: "inspector", coalesceKey });
    }
    if (valueInfo) valueInfo.hidden = true;
    search();
  });
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!currentResults.length) return;
      activeIndex = (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + currentResults.length) % currentResults.length;
      results.querySelectorAll("[data-result-index]").forEach((button, index) => button.classList.toggle("active", index === activeIndex));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(activeIndex >= 0 ? currentResults[activeIndex].code : input.value.trim());
    } else if (event.key === "Escape") {
      results.hidden = true;
    }
  });
  input.addEventListener("blur", () => setTimeout(() => { results.hidden = true; }, 120));
  if (initialValue) showValue(initialValue);
}

function bindCodeOptions(container, component, handlers) {
  container.querySelectorAll("[data-code-options]").forEach(editor => {
    const attributeName = editor.dataset.codeOptions;
    const currentCodes = () => editableCodeList(component.props[attributeName]);
    const updateCodes = (codes, origin = null) => handlers.onEdit("Edit code options", () => {
      component.props[attributeName] = serializeCodes(codes);
    }, { origin, coalesceKey: origin ? `component:${component._id}:${attributeName}` : null });

    editor.querySelectorAll("[data-option-code]").forEach(input => {
      const index = Number(input.dataset.optionCode);
      input.addEventListener("input", () => {
        const codes = currentCodes();
        codes[index] = input.value;
        updateCodes(codes, "inspector");
      });
      input.addEventListener("change", () => lookupOptionTerm(editor, index, input.value));
      lookupOptionTerm(editor, index, input.value);
    });
    editor.querySelectorAll("[data-option-delete]").forEach(button => {
      button.addEventListener("click", () => {
        const codes = currentCodes();
        codes.splice(Number(button.dataset.optionDelete), 1);
        updateCodes(codes);
      });
    });
    editor.querySelectorAll("[data-option-move]").forEach(button => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);
        const target = index + Number(button.dataset.optionMove);
        const codes = currentCodes();
        [codes[index], codes[target]] = [codes[target], codes[index]];
        updateCodes(codes);
      });
    });
    editor.querySelector("[data-raw-codes]").addEventListener("change", event => {
      updateCodes(codeList(event.target.value));
    });

    const addPicker = editor.querySelector("[data-code-options-add]");
    bindCodePicker(addPicker, "", () => {}, component, handlers, null, code => {
      updateCodes([...currentCodes(), code]);
    });
  });
}

async function lookupOptionTerm(editor, index, code) {
  const target = editor.querySelector(`[data-option-term="${index}"]`);
  if (!target) return;
  const data = await searchCodes(code, 20).catch(() => null);
  const match = data?.results?.find(result => result.code === code);
  target.textContent = match?.term || "Custom code";
  target.title = target.textContent;
}

function bindQuestions(container, component, handlers) {
  container.querySelectorAll("[data-questions]").forEach(editor => {
    const attributeName = editor.dataset.questions;
    const update = (questions, origin = null) => handlers.onEdit("Edit assessment", () => {
      component.props[attributeName] = serializeQuestions(questions);
    }, { origin, coalesceKey: origin ? `component:${component._id}:questions` : null });

    editor.querySelectorAll("[data-question-field]").forEach(input => {
      const eventName = input.type === "checkbox" ? "change" : "input";
      input.addEventListener(eventName, () => {
        const questions = parseQuestions(component.props[attributeName]);
        const question = questions[Number(input.dataset.questionIndex)];
        question[input.dataset.questionField] = input.type === "checkbox" ? input.checked : input.value;
        update(questions, "inspector");
      });
    });
    editor.querySelectorAll("[data-answer-field]").forEach(input => {
      input.addEventListener("input", () => {
        const questions = parseQuestions(component.props[attributeName]);
        questions[Number(input.dataset.questionIndex)].answers[Number(input.dataset.answerIndex)][input.dataset.answerField] = input.value;
        update(questions, "inspector");
      });
    });
    editor.querySelectorAll("[data-remove-question]").forEach(button => {
      button.addEventListener("click", () => {
        const questions = parseQuestions(component.props[attributeName]);
        questions.splice(Number(button.dataset.removeQuestion), 1);
        update(questions);
      });
    });
    editor.querySelectorAll("[data-add-answer]").forEach(button => {
      button.addEventListener("click", () => {
        const questions = parseQuestions(component.props[attributeName]);
        questions[Number(button.dataset.addAnswer)].answers.push({ text: "New answer", code: "", score: "0" });
        update(questions);
      });
    });
    editor.querySelectorAll("[data-remove-answer]").forEach(button => {
      button.addEventListener("click", () => {
        const questions = parseQuestions(component.props[attributeName]);
        questions[Number(button.dataset.questionIndex)].answers.splice(Number(button.dataset.removeAnswer), 1);
        update(questions);
      });
    });
    editor.querySelector("[data-add-question]").addEventListener("click", () => {
      const questions = parseQuestions(component.props[attributeName]);
      questions.push({ text: "New question", multiple: false, required: false, answers: [{ text: "Answer", code: "", score: "0" }] });
      update(questions);
    });
    editor.querySelector("[data-raw-questions]").addEventListener("change", event => {
      handlers.onEdit("Edit raw assessment", () => { component.props[attributeName] = event.target.value; });
    });
  });
}

function bindLayoutFields(container, component, handlers) {
  container.querySelectorAll("[data-layout]").forEach(input => {
    input.addEventListener("input", () => {
      const key = input.dataset.layout;
      const value = Number(input.value || 0);
      handlers.onEdit(`Edit ${key.toUpperCase()}`, () => {
        component[key] = value;
        if (component.kind === "hline" && key === lineLengthAxis(component)) component.props.length = value;
      }, { origin: "inspector", coalesceKey: `layout:${component._id}:${key}` });
    });
  });
}

function renderPage(container, store, handlers) {
  const page = store.selectedPage;
  const pageIndex = store.doc.pages.findIndex(item => item._id === page._id);
  container.innerHTML = `
    <div class="inspector-heading"><span class="component-icon">${icon("page")}</span><div class="inspector-title"><span class="eyebrow">PAGE ${pageIndex + 1}</span><h2>${escapeHtml(page.name)}</h2><p>${page.components.length} component${page.components.length === 1 ? "" : "s"}</p></div><div class="inspector-actions"><button class="icon-button small" id="duplicate-page" aria-label="Duplicate page" title="Duplicate page">${icon("copy")}</button><button class="icon-button small danger" id="delete-page" aria-label="Delete page" title="Delete page" ${store.doc.pages.length === 1 ? "disabled" : ""}>${icon("trash")}</button></div></div>
    <section class="inspector-section"><h3>Page details</h3>
      <div class="field"><label for="page-name">Page name</label><input id="page-name" type="text" data-page-field="name" value="${escapeHtml(page.name)}"></div>
      <div class="field"><span class="field-label">Background colour</span><div class="color-field"><input type="color" id="page-colour" value="${signedColourToHex(page.colour)}" aria-label="Page background colour"><input type="number" id="page-colour-number" value="${page.colour}" aria-label="Page background signed RGB value"></div><div class="field-help">Choose a colour or enter SystmOne’s signed RGB value.</div></div>
      ${pageSwitch("page-male", "male", "Show for male patients", page.male)}
      ${pageSwitch("page-female", "female", "Show for female patients", page.female)}
    </section>
    <details class="inspector-details"><summary>${icon("chevron")}Patient age restrictions</summary><div class="details-body"><div class="field-grid"><div class="field"><label for="page-minage">Minimum age</label><input id="page-minage" type="number" data-page-field="minage" value="${page.minage}"></div><div class="field"><label for="page-minageunits">Units</label><select id="page-minageunits" data-page-field="minageunits">${ageUnits(page.minageunits)}</select></div><div class="field"><label for="page-maxage">Maximum age</label><input id="page-maxage" type="number" data-page-field="maxage" value="${page.maxage}"></div><div class="field"><label for="page-maxageunits">Units</label><select id="page-maxageunits" data-page-field="maxageunits">${ageUnits(page.maxageunits)}</select></div></div><div class="field-help">Use −1 for no age restriction.</div></div></details>
    <section class="inspector-section"><h3>Page order</h3><div class="button-row"><button class="button secondary small" id="move-page-back" ${pageIndex === 0 ? "disabled" : ""}>${icon("left")}Move back</button><button class="button secondary small" id="move-page-forward" ${pageIndex === store.doc.pages.length - 1 ? "disabled" : ""}>Move forward${icon("right")}</button></div></section>
    <div class="inspector-empty"><span class="empty-icon">${icon("components")}</span><h2>Edit a component</h2><p>Select any element on the canvas or in Layers to edit its content, coding, layout, and advanced properties.</p></div>`;

  bindPageFields(container, page, handlers);
  container.querySelector("#duplicate-page").addEventListener("click", handlers.onDuplicatePage);
  container.querySelector("#delete-page").addEventListener("click", handlers.onDeletePage);
  container.querySelector("#move-page-back").addEventListener("click", () => handlers.onMovePage(-1));
  container.querySelector("#move-page-forward").addEventListener("click", () => handlers.onMovePage(1));
}

function pageSwitch(id, key, label, value, scope = "page") {
  return `<div class="switch-field"><div class="switch-copy"><label for="${id}">${label}</label></div><label class="switch"><input id="${id}" type="checkbox" role="switch" data-${scope}-field="${key}" ${value ? "checked" : ""}><span class="switch-track"></span></label></div>`;
}

function ageUnits(value) {
  return [[0, "Years"], [1, "Months"], [2, "Weeks"], [3, "Days"]].map(([number, label]) => `<option value="${number}" ${Number(value) === number ? "selected" : ""}>${label}</option>`).join("");
}

function bindPageFields(container, page, handlers) {
  container.querySelectorAll("[data-page-field]").forEach(input => {
    const key = input.dataset.pageField;
    const update = () => {
      const value = input.type === "checkbox" ? input.checked : ["minage", "minageunits", "maxage", "maxageunits"].includes(key) ? Number(input.value || 0) : input.value;
      handlers.onEdit(`Edit page ${key}`, () => { page[key] = value; }, { origin: "inspector", coalesceKey: `page:${page._id}:${key}` });
    };
    input.addEventListener(input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input", update);
  });
  const picker = container.querySelector("#page-colour");
  const number = container.querySelector("#page-colour-number");
  picker.addEventListener("input", () => {
    const value = hexToSignedColour(picker.value);
    number.value = value;
    handlers.onEdit("Edit page colour", () => { page.colour = value; }, { origin: "inspector", coalesceKey: `page:${page._id}:colour` });
  });
  number.addEventListener("input", () => {
    const value = Number(number.value || 0);
    picker.value = signedColourToHex(value);
    handlers.onEdit("Edit page colour", () => { page.colour = value; }, { origin: "inspector", coalesceKey: `page:${page._id}:colour` });
  });
}

function renderTemplate(container, store, handlers) {
  const doc = store.doc;
  container.innerHTML = `
    <div class="inspector-heading"><span class="component-icon">${icon("settings")}</span><div class="inspector-title"><span class="eyebrow">DOCUMENT</span><h2>Template settings</h2><p>Metadata, audience, and canvas</p></div></div>
    <section class="inspector-section"><h3>Template details</h3>
      <div class="field"><label for="template-name">Name</label><input id="template-name" type="text" data-template-field="name" value="${escapeHtml(doc.name)}" required></div>
      <div class="field"><label for="template-description">Description</label><textarea id="template-description" data-template-field="description">${escapeHtml(doc.description)}</textarea></div>
      <div class="field"><label for="template-category">Category</label><input id="template-category" type="text" data-template-field="category" value="${escapeHtml(doc.category)}"></div>
      <div class="field"><label for="template-icon">Icon</label><input id="template-icon" type="text" data-template-field="icon" value="${escapeHtml(doc.icon)}"><div class="field-help">Practice or TPP icon reference. Leave blank for the default.</div></div>
    </section>
    <section class="inspector-section"><h3>Patient visibility</h3>${pageSwitch("template-male", "male", "Show for male patients", doc.male, "template")}${pageSwitch("template-female", "female", "Show for female patients", doc.female, "template")}</section>
    <section class="inspector-section"><h3>Canvas dimensions <span>template units</span></h3><div class="field-grid"><div class="field"><label for="template-width">Width</label><input id="template-width" type="number" min="1" data-template-field="width" value="${doc.width}"></div><div class="field"><label for="template-height">Height</label><input id="template-height" type="number" min="1" data-template-field="height" value="${doc.height}"></div></div><div class="field-help">Changing the canvas size does not rescale existing components.</div></section>`;

  container.querySelectorAll("[data-template-field]").forEach(input => {
    const key = input.dataset.templateField;
    input.addEventListener(input.type === "checkbox" ? "change" : "input", () => {
      const value = input.type === "checkbox" ? input.checked : ["width", "height"].includes(key) ? Math.max(1, Number(input.value || 1)) : input.value;
      handlers.onEdit(`Edit template ${key}`, () => { doc[key] = value; }, { origin: "inspector", coalesceKey: `template:${key}` });
    });
  });
}
