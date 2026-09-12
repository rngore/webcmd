export function createTask(objective, plan) {
  return {
    id:`task-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    objective,
    plan,
    classification: {
      taskType: plan.taskType || 'RESEARCH',
      capabilities: plan.capabilities || ['RESEARCH'],
      constraints: plan.constraints || {},
    },
    actions: plan.actions || [],
    currentActionIndex: 0,
    currentGoal: objective,
    browserSession: null,
    currentUrl: '',
    pageState: {},
    extractedEvidence: [],
    selectedItems: [],
    pendingActions: [],
    requiredUserInput: null,
    confirmationRequired: false,
    confirmationReason: null,
    confirmation: null,
    actionHistory: [],
    errors: [],
    recoveryAttempts: 0,
    verificationStatus: 'pending',
    finalResult: null,
    status:'queued',
    events:[],
    findings:[],
    answer:'',
    sources:[],
    error:null,
  };
}
export function addEvent(task, message, status='info') { const event={at:new Date().toISOString(),message,status}; task.events.push(event); return event; }
export function transition(task, stepId, status) { const step=task.plan.steps.find(s=>s.id===stepId); if(step) step.status=status; }
