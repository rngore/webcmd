const EXPLICIT_DETAIL = /\b(explain|in detail|thorough(?:ly)?|comprehensive|deep dive|tell me everything|elaborate|analy[sz]e|all important|full overview)\b/i;
const SIMPLE = /\b(title|name|what date|what time|when|where|which|who is the author|price|cost|how many|yes or no)\b/i;
const COMPLEX = /\b(about and|what does .* offer|features?|capabilities|how does|compare|research|everything important|main points?|key arguments?|setup and usage|architecture)\b/i;

export function responseDepth(objective = '', context = {}) {
  const text = String(objective).trim();
  const evidenceCount = Number(context.evidenceCount || 0);
  const pageType = context.pageType || 'generic';
  if (EXPLICIT_DETAIL.test(text)) return 'COMPREHENSIVE';
  if (SIMPLE.test(text) && !COMPLEX.test(text)) return 'BRIEF';
  if (COMPLEX.test(text) || evidenceCount >= 5) return pageType === 'generic' ? 'DETAILED' : 'DETAILED';
  if (pageType === 'github-repository' || pageType === 'documentation' || pageType === 'article') return 'NORMAL';
  return 'NORMAL';
}

export function evidenceBudget(depth) {
  return {BRIEF: 2, NORMAL: 4, DETAILED: 7, COMPREHENSIVE: 10}[depth] || 4;
}

export function depthInstruction(depth) {
  return {
    BRIEF: 'Answer directly with only the requested fact and its source.',
    NORMAL: 'Give a clear overview with the most useful supporting details and source.',
    DETAILED: 'Organize the relevant evidence into several useful sections; do not omit meaningful supported details.',
    COMPREHENSIVE: 'Provide a thorough, page-aware analysis using all distinct relevant evidence, while removing repetition and noise.',
  }[depth];
}
