const RISK = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

const HIGH_ACTIONS = new Set(['SUBMIT', 'PURCHASE', 'BOOK', 'SEND', 'CHANGE_ACCOUNT', 'ACCEPT_TERMS']);
const MEDIUM_ACTIONS = new Set(['ADD_TO_CART', 'SAVE', 'FILL_FORM', 'CREATE_DRAFT']);

export function riskForAction(type) {
  if (HIGH_ACTIONS.has(type)) return RISK.HIGH;
  if (MEDIUM_ACTIONS.has(type)) return RISK.MEDIUM;
  return RISK.LOW;
}

export function createActionPolicy({confirmed = false} = {}) {
  return {
    confirmed,
    canExecute(action) {
      const risk = action.risk || riskForAction(action.type);
      return risk !== RISK.HIGH || this.confirmed === true;
    },
    decision(action) {
      const risk = action.risk || riskForAction(action.type);
      if (risk === RISK.HIGH && !this.confirmed) {
        return {
          allowed: false,
          requiresConfirmation: true,
          risk,
          reason: `This action may create an external, financial, legal, or account commitment: ${action.label || action.type}.`,
        };
      }
      return {allowed: true, requiresConfirmation: false, risk};
    },
  };
}

export function describeConfirmation(action, context = {}) {
  return {
    action: action.type,
    label: action.label || action.type,
    risk: action.risk || riskForAction(action.type),
    website: context.url || context.website || 'the current website',
    details: context.details || action.details || 'The agent is ready to perform this action.',
    consequence: 'The website may create a booking, purchase, submission, message, or other external commitment.',
  };
}

export {RISK};
