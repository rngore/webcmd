import {classifyTask} from './capabilities.js';
import {actionPlanFor} from './actions.js';
import {riskForAction} from './action-policy.js';

const DANGEROUS = /\b(send|purchase|buy|delete|remove|submit|publish|post|change password|transfer|checkout|book|reserve)\b/i;
export function createPlan(objective) {
  const clean = objective.trim();
  if (!clean) throw new Error('A research objective is required.');
  const classification = classifyTask(clean);
  const approvalRequired = DANGEROUS.test(clean);
  const research = approvalRequired ? 'Prepare safely, then pause immediately before any consequential action.' : 'Read-only research; no external side effects.';
  const actions = actionPlanFor(classification.capabilities, clean);
  return { objective: clean, createdAt: new Date().toISOString(), approvalRequired, policy: research,
    taskType: classification.taskType, capabilities: classification.capabilities, constraints: classification.constraints,
    actionPolicy: {autonomous: actions.filter((action) => riskForAction(action.type) === 'LOW').map((action) => action.type),
      confirmationRequired: actions.filter((action) => riskForAction(action.type) === 'HIGH').map((action) => action.type)},
    actions,
    steps: [
      {id:'scope', label:'Clarify objective and define evidence', status:'pending'},
      {id:'memory', label:'Load WebCMD site memory context', status:'pending'},
      {id:'browse', label:classification.actionMode ? 'Navigate and inspect the live website' : 'Search and inspect live web pages', status:'pending'},
      ...(classification.actionMode ? [{id:'act', label:'Execute permitted workflow actions', status:'pending'}, {id:'verify', label:'Verify every important result', status:'pending'}] : []),
      {id:'extract', label:'Extract source-linked findings', status:'pending'},
      {id:'validate', label:'Validate evidence and filter unsafe instructions', status:'pending'},
      {id:'synthesize', label:'Synthesize a concise answer', status:'pending'}
    ] };
}
