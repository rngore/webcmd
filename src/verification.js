const SUCCESS_PATTERNS = {
  'cart-item': /\b(cart|basket).{0,80}\b(added|updated|1 item|item)\b/i,
  'booking-confirmation': /\b(booking|reservation|ticket).{0,100}\b(confirm|confirmed|reference|success)\b/i,
  'success-state': /\b(success|submitted|complete|received|thank you|confirmation)\b/i,
  navigation: /^https?:\/\//i,
};

export function verifyObservation(observation = {}, expected = {}) {
  const text = String(observation.text || observation.body || '');
  const url = String(observation.url || '');
  const title = String(observation.title || '');
  const evidence = `${title}\n${url}\n${text}`;
  const pattern = SUCCESS_PATTERNS[expected.kind || expected] || expected.pattern;
  const matched = pattern instanceof RegExp ? pattern.test(evidence) : Boolean(expected.value && evidence.includes(expected.value));
  return {
    verified: matched,
    status: matched ? 'verified' : 'unverified',
    evidence: matched ? evidence.slice(0, 600) : '',
    reason: matched ? 'The observed browser state contains the expected success evidence.' : `Could not verify ${expected.kind || expected.value || 'the expected result'} from the current browser state.`,
  };
}

export function verificationForAction(action) {
  if (action.type === 'NAVIGATE') return {kind: 'navigation'};
  if (action.verification) return {kind: action.verification};
  if (action.type === 'ADD_TO_CART') return {kind: 'cart-item'};
  if (action.type === 'BOOK') return {kind: 'booking-confirmation'};
  if (action.type === 'SUBMIT') return {kind: 'success-state'};
  return null;
}
