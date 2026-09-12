import {riskForAction} from './action-policy.js';

export const ACTION_TYPES = Object.freeze([
  'NAVIGATE', 'SEARCH', 'CLICK', 'TYPE', 'SELECT', 'SCROLL', 'EXTRACT',
  'COMPARE', 'ADD_TO_CART', 'FILL_FORM', 'SUBMIT', 'PURCHASE', 'BOOK',
  'WAIT', 'VERIFY', 'ASK_USER', 'FINISH',
]);

export function createAction(type, input = {}) {
  if (!ACTION_TYPES.includes(type)) throw new Error(`Unsupported agent action: ${type}`);
  return {
    id: input.id || `action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: input.label || type.replaceAll('_', ' ').toLowerCase(),
    target: input.target || null,
    value: input.value ?? null,
    details: input.details || '',
    risk: input.risk || riskForAction(type),
    status: 'pending',
    verification: input.verification || null,
  };
}

export function actionPlanFor(capabilities, objective) {
  const actions = [createAction('NAVIGATE', {label: 'Open the relevant website or page'})];
  if (capabilities.includes('SHOP') || capabilities.includes('RESEARCH')) {
    actions.push(createAction('SEARCH', {label: 'Search or inspect the live page'}));
  }
  if (capabilities.includes('COMPARE')) actions.push(createAction('COMPARE', {label: 'Normalize and compare the candidates'}));
  if (capabilities.includes('FORM_FILL')) actions.push(createAction('FILL_FORM', {label: 'Fill safe, known form fields'}));
  if (capabilities.includes('SHOP') && /\b(add to cart|cart)\b/i.test(objective)) {
    actions.push(createAction('ADD_TO_CART', {label: 'Add the verified product to the cart', verification: 'cart-item'}));
  }
  if (capabilities.includes('BOOK')) {
    actions.push(createAction('BOOK', {label: 'Confirm the selected reservation or ticket', verification: 'booking-confirmation'}));
  }
  if (/\b(submit|send|purchase|buy|book|reserve)\b/i.test(objective)) {
    actions.push(createAction('SUBMIT', {label: 'Submit the prepared workflow', verification: 'success-state'}));
  }
  actions.push(createAction('VERIFY', {label: 'Verify the resulting page state'}));
  actions.push(createAction('FINISH', {label: 'Report completed and unresolved work'}));
  return actions;
}
