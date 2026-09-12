import {createActionPolicy, describeConfirmation} from './action-policy.js';
import {actionPlanFor} from './actions.js';
import {verificationForAction, verifyObservation} from './verification.js';
import {withRecovery} from './recovery.js';

export async function runAgentLoop(task, adapter, {emit = () => {}, confirmed = false, maxSteps = 12} = {}) {
  const policy = createActionPolicy({confirmed});
  const actions = task.actions?.length ? task.actions : actionPlanFor(task.classification.capabilities, task.objective);
  task.actions = actions;
  task.actionHistory ||= [];
  task.verificationStatus = 'pending';
  for (let index = task.currentActionIndex || 0; index < Math.min(actions.length, maxSteps); index += 1) {
    const action = actions[index];
    task.currentActionIndex = index;
    if (action.status === 'verified') continue;
    const decision = policy.decision(action);
    if (!decision.allowed) {
      task.status = 'awaiting_confirmation';
      task.confirmationRequired = true;
      task.confirmationReason = decision.reason;
      task.confirmation = describeConfirmation(action, task.pageState);
      emit(`Confirmation required before ${action.label}`, 'approval');
      return task;
    }
    action.status = 'running';
    emit(`${action.label}`, 'running');
    try {
      const observation = await withRecovery(
        () => adapter.execute(action, task),
        {maxAttempts: 3, onRetry: async (attempt, error) => emit(`Recovery attempt ${attempt + 1}: ${error.message}`, 'retry')},
      );
      task.pageState = observation;
      task.currentUrl = observation.url || task.currentUrl;
      task.actionHistory.push({actionId: action.id, type: action.type, status: 'executed', at: new Date().toISOString()});
      const expected = verificationForAction(action);
      if (expected) {
        const verification = verifyObservation(observation, expected);
        action.verificationResult = verification;
        task.verificationStatus = verification.status;
        if (!verification.verified) {
          action.status = 'failed';
          task.errors.push(verification.reason);
          emit(`Could not verify ${action.label}; stopping before assuming success`, 'error');
          task.status = 'failed';
          task.error = verification.reason;
          return task;
        }
        action.status = 'verified';
        emit(`Verified: ${action.label}`, 'success');
      } else {
        action.status = 'completed';
      }
    } catch (error) {
      action.status = 'failed';
      task.errors.push(error.message);
      task.status = 'failed';
      task.error = `The agent stopped during ${action.label}: ${error.message}`;
      emit(task.error, 'error');
      return task;
    }
  }
  task.status = 'completed';
  task.verificationStatus = task.actions.some((action) => action.status === 'failed') ? 'failed' : 'verified';
  emit('Agent completed the planned workflow and recorded its verification state', 'success');
  return task;
}
