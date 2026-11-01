const TRAILING_QUESTION_FLAGS = /(?:\s+[*!])+$/;

function splitQuestionFlags(rawQuestion) {
  const question = rawQuestion.trim();
  const flags = question.match(TRAILING_QUESTION_FLAGS)?.[0] || "";
  return {
    text: question.slice(0, question.length - flags.length).trim(),
    multiple: flags.includes("*"),
    required: flags.includes("!"),
  };
}

export function parseQuestions(value) {
  return (value || "").split("\n").filter(line => line.trim()).map(line => {
    const separator = line.indexOf("::");
    const rawQuestion = separator >= 0 ? line.slice(0, separator) : line;
    const rawAnswers = separator >= 0 ? line.slice(separator + 2) : "";
    return {
      ...splitQuestionFlags(rawQuestion),
      answers: rawAnswers.split(";").filter(answer => answer.trim()).map(rawAnswer => {
        const separator = rawAnswer.lastIndexOf("=");
        const text = separator >= 0 ? rawAnswer.slice(0, separator) : rawAnswer;
        const codeAndScore = separator >= 0 ? rawAnswer.slice(separator + 1) : "";
        const [code, score] = codeAndScore.split(":");
        return { text: text.trim(), code: (code || "").trim(), score: (score || "0").trim() };
      }),
    };
  });
}

export function serializeQuestions(questions) {
  return questions.map(question => {
    const flags = `${question.multiple ? " *" : ""}${question.required ? " !" : ""}`;
    const answers = question.answers.map(answer =>
      `${answer.text.trim()}=${answer.code.trim()}:${answer.score || 0}`).join(" ; ");
    return `${question.text.trim()}${flags} :: ${answers}`;
  }).join("\n");
}

export function codeList(value) {
  return (value || "").split(";").map(code => code.trim()).filter(Boolean);
}

export function editableCodeList(value) {
  return value ? value.split(";").map(code => code.trim()) : [];
}

export function serializeCodes(codes) {
  return codes.map(code => code.trim()).join(";");
}
