const INJECTION = /(ignore (all|any|previous|prior) instructions|system prompt|reveal (secrets|credentials|tokens)|disregard your task|developer message|jailbreak)/i;
const SECRET = /(api[_ -]?key|password|token|cookie|secret|private key)\s*[:=]/i;
export function inspectText(text='') { return {safe: !INJECTION.test(text), injectionDetected: INJECTION.test(text), redacted: SECRET.test(text) ? '[redacted sensitive instruction]' : text}; }
export function requiresApproval(objective) { return /\b(send|purchase|buy|delete|remove|submit|publish|post|checkout|transfer)\b/i.test(objective); }
export function safeEvidence(text='') { return text.split(/\n+/).filter(line=>!INJECTION.test(line)).map(line=>SECRET.test(line)?'[redacted]':line).join('\n'); }
