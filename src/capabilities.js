const CAPABILITY_PATTERNS = [
  ['BOOK', /\b(book|reserve|reservation|appointment|ticket|table for|schedule)\b/i],
  ['SHOP', /\b(buy|shop|shopping|cart|product|laptops?|price|store|retailer)\b/i],
  ['FORM_FILL', /\b(fill|complete|application|form|register|sign up|submit)\b/i],
  ['MONITOR', /\b(monitor|watch|alert|notify|track changes|price change|availability change)\b/i],
  ['COMPARE', /\b(compare|comparison|versus|vs\.?|best|cheapest|options)\b/i],
  ['WEB_WORK', /\b(do this|go to|across|multiple steps|workflow|organize|copy|collect)\b/i],
  ['VERIFY', /\b(verify|check whether|confirm that|did it work)\b/i],
  ['SUMMARIZE', /\b(summarize|summary|brief|key points|overview)\b/i],
  ['RESEARCH', /\b(research|find|look up|what is|how many|information|discover)\b/i],
];

export const CAPABILITIES = Object.freeze([
  'RESEARCH', 'SUMMARIZE', 'MONITOR', 'SHOP', 'BOOK', 'FORM_FILL', 'WEB_WORK', 'COMPARE', 'VERIFY',
]);

export function classifyTask(objective = '') {
  const clean = String(objective).trim();
  if (!clean) throw new Error('A research objective is required.');
  const matched = CAPABILITY_PATTERNS.filter(([, pattern]) => pattern.test(clean)).map(([name]) => name);
  const capabilities = [...new Set(matched.length ? matched : ['RESEARCH'])];
  const explicitAction = /\b(click|type|navigate|open|go to|add to cart|fill out|fill in|submit|send|purchase|buy|book|reserve|schedule|complete the form|log in)\b/i.test(clean);
  const actionMode = explicitAction;
  const constraints = extractConstraints(clean);
  return {
    taskType: actionMode ? 'ACTION' : 'RESEARCH',
    capabilities,
    actionMode,
    constraints,
  };
}

export function extractConstraints(objective = '') {
  const text = String(objective);
  const budget = text.match(/(?:under|below|max(?:imum)?|less than)\s*(?:₹|rs\.?|inr|\$|£|€)?\s*([\d,]+(?:\.\d+)?)/i);
  const quantity = text.match(/\b(?:for|quantity|qty)\s+(\d+)\b/i);
  return {
    budget: budget ? budget[1].replace(/,/g, '') : null,
    currency: budget?.[0].match(/₹|rs\.?|inr|\$|£|€/i)?.[0] || null,
    quantity: quantity ? Number(quantity[1]) : null,
    location: (text.match(/\b(?:in|at|near)\s+([A-Z][\w-]+(?:\s+[A-Z][\w-]+)*)/) || [])[1] || null,
  };
}
