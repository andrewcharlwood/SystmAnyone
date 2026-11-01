async function request(url, options = {}) {
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The server returned an unreadable response (${response.status}).`);
  }
  if (!response.ok || data.error) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export function fetchSchema() {
  return request("/api/schema");
}

export function fetchSample() {
  return request("/api/sample");
}

export function importTemplate(xml) {
  return request("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xml }),
  });
}

export function exportTemplate(documentState) {
  return request("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(documentState),
  });
}

export function fetchTerms(codes) {
  return request(`/api/terms?codes=${encodeURIComponent(codes.join(";"))}`);
}

export function searchCodes(query, limit = 12) {
  return request(`/api/codes?q=${encodeURIComponent(query)}&limit=${limit}`);
}
