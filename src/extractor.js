import {safeEvidence} from './security.js';
import {extractStructuredEvidence, renderStructuredAnswer, detectPageType} from './structured.js';
import {responseDepth, evidenceBudget} from './response-depth.js';

const STOP_WORDS = new Set('a an and are be can for from how many number of count people person going attending attendees the this to what when where with you your about page read find latest information'.split(' '));
const BOILERPLATE = /^(skip to|menu|navigation|sign in|log in|log out|cookie|privacy|terms|subscribe|share|follow us|copyright|home|search)$/i;

function keywords(text = '') {
  return [...new Set(String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
}

function relevant(text, terms) {
  const value = String(text || '').trim();
  if (!value || BOILERPLATE.test(value)) return false;
  if (!terms.length) return true;
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function relevantLabel(text, terms) {
  const value = String(text || '').trim();
  if (!value || BOILERPLATE.test(value)) return false;
  return !terms.length || terms.some((term) => value.toLowerCase().includes(term));
}

export function linkLabel(label, url, title) {
  const clean = safeEvidence(label).replace(/\s+/g, ' ').trim();
  if (clean && !/^(link|click here|website|source|read more)$/i.test(clean)) return clean;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const pageName = title && !/^home$/i.test(title) ? title : host;
    return `${pageName} — official page`;
  } catch {
    return 'Related page';
  }
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function uniqueRelevant(values, terms, limit) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalize(value);
    if (!relevant(value, terms) || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function intent(objective = '') {
  const lower = objective.toLowerCase();
  return {
    identity: /\bwhat is this (web)?page|what is this|what('?s| is) this repo|describe this|tell me about this\b/i.test(lower),
    count: isCountQuestion(lower),
    price: /\b(price|cost|fee|₹|\$|£|€)\b/i.test(lower),
    date: /\b(when|date|deadline|starts?|ends?|schedule)\b/i.test(lower),
    links: /\b(link|website|url|source|official)\b/i.test(lower),
    compare: /\b(compare|comparison|difference|versus|vs\.?)\b/i.test(lower),
  };
}

function isUsefulLink(link, taskIntent, pageUrl) {
  const value = `${link.label} ${link.url}`.toLowerCase();
  if (/\b(navigation|repository files|license|contribut|security|activity|star|watch|fork|package|release|language|sign in|log in|privacy|terms|cookie|follow|subscribe|create new|new issue|pull request)\b/.test(value)) return false;
  if (taskIntent.links) return true;
  if (taskIntent.identity) {
    return /\b(readme|documentation|docs|quick start|setup|guide|demo|official|homepage|website)\b/.test(value) ||
      (pageUrl.includes('github.com') && /github\.com\/[^/]+\/[^/]+\/?$/.test(link.url));
  }
  return false;
}

function isCountQuestion(objective = '') {
  return /\bhow many|number of|count of|人数| कितने\b/i.test(objective);
}

function directCount(raw, objective) {
  if (!isCountQuestion(objective)) return null;
  const terms = keywords(objective).filter((term) => !['people', 'person', 'going', 'attending', 'attendees', '参加'].includes(term));
  const lines = String(raw || '').split(/\n+/).map((line) => safeEvidence(line).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const candidates = lines.filter((line) => /\d/.test(line) && /\b(going|attending|attendees|people|guests|participants|seats|spots|registered|sold out)\b/i.test(line));
  const matching = candidates.find((line) => !terms.length || terms.some((term) => line.toLowerCase().includes(term)));
  return matching || candidates[0] || null;
}

export function extractFindings(raw, url, objective = '') {
  const terms = keywords(objective);
  const seen = new Set();
  const chunks = String(raw || '').trim()
    .split(/\n+|(?<=[.!?])\s+/)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .map((sentence) => safeEvidence(sentence).trim())
    .filter((sentence) => relevant(sentence, terms))
    .sort((a, b) => terms.reduce((score, term) => score + (b.toLowerCase().includes(term) - a.toLowerCase().includes(term)), 0))
    .filter((sentence) => {
      const key = normalize(sentence);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  return chunks.map((summary, i) => ({
    id: `finding-${i + 1}`,
    title: summary.slice(0, 90),
    summary: summary.slice(0, 360),
    source: url,
    url,
    confidence: 'observed',
  }));
}

export function renderAnswer(findings, objective, page = {}) {
  const title = safeEvidence(page.title || 'the current webpage').trim();
  const terms = keywords(objective);
  const description = safeEvidence(page.description || '').trim();
  const taskIntent = intent(objective);
  const structured = page.structuredEvidence || extractStructuredEvidence({...page, pageType: page.pageType || detectPageType(page)}, objective);
  const pageType = page.pageType || detectPageType(page);
  const depth = responseDepth(objective, {pageType, evidenceCount: findings.length});
  const pageUrl = page.url || '';
  const sourceLabel = linkLabel('', pageUrl, title);
  const isGithubRepo = page.pageType === 'github-repository' || (/github\.com\/[^/]+\/[^/]+/i.test(pageUrl) && !/\/(issues|pull|commit|blob|tree|actions|settings)\b/i.test(pageUrl));
  const headings = uniqueRelevant((page.headings || []).map((heading) => safeEvidence(heading).trim()), terms, 5);
  const links = (page.links || []).map((link) => ({
    label: linkLabel(link.label, link.url, title),
    url: link.url,
  })).filter((link) => link.label && /^https?:/.test(link.url) &&
    !/\b(navigation|repository files|license|contribut|security|activity|star|watch|fork|package|release|language|sign in|log in|privacy|terms|cookie|follow|subscribe|create new|new issue|pull request)\b/i.test(`${link.label} ${link.url}`) &&
    (isUsefulLink(link, taskIntent, pageUrl) || relevantLabel(link.label, terms)) &&
    (taskIntent.links || taskIntent.identity || relevantLabel(link.label, terms)) &&
    !BOILERPLATE.test(link.label)).filter((link, index, all) =>
      all.findIndex((candidate) => candidate.url === link.url || normalize(candidate.label) === normalize(link.label)) === index).slice(0, 5);
  const evidence = findings.slice(0, evidenceBudget(depth)).map((finding) => finding.summary.trim()).filter(Boolean);
  const count = directCount(page.text || '', objective);
  const repositoryDescription = safeEvidence(page.repository?.description || '').trim();
  const readme = safeEvidence(page.repository?.readme || '').replace(/\s+/g, ' ').trim();
  const overview = repositoryDescription || description || evidence[0];
  const paragraphs = [];

  const structuredAnswer = renderStructuredAnswer(structured, objective, sourceLabel);
  if (structuredAnswer) return structuredAnswer;

  if (count) {
    paragraphs.push(`The page lists the attendance information as: “${count}”. This is the only explicit count I could verify from the page.`);
    if (pageUrl) paragraphs.push(`Source: [[LINK:${sourceLabel}]].`);
    return paragraphs.join('\n\n');
  }
  if (isCountQuestion(objective)) {
    return `I couldn’t verify a number for “${objective}” from the information currently visible on this page. The page may load attendance details only after interaction or for signed-in users, so I won’t guess.${pageUrl ? `\n\nSource checked: [[LINK:${sourceLabel}]].` : ''}`;
  }

  if (depth === 'BRIEF') {
    if (overview) paragraphs.push(`${title}: ${overview.replace(/[.!?]$/, '')}.`);
    else paragraphs.push(`I could not verify a concise answer for “${objective}” from this page.`);
    if (pageUrl) paragraphs.push(`Source: [[LINK:${sourceLabel}]].`);
    return paragraphs.join('\n\n');
  }

  if (taskIntent.identity && isGithubRepo && (repositoryDescription || description)) {
    const repo = page.repository?.name || title.split(':')[0].trim() || title;
    const repoSummary = repositoryDescription || description;
    paragraphs.push(`## What is ${repo}?\n\nThis is the GitHub repository for “${repo}”. It is described as ${repoSummary.replace(/[.!?]$/, '')}.`);
    if (readme && readme.toLowerCase() !== repoSummary.toLowerCase()) {
      const readmeSentences = readme.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 40).slice(0, 3);
      if (readmeSentences.length) paragraphs.push(`### What the README explains\n\n${readmeSentences.map((sentence) => `- ${sentence.replace(/[.!?]$/, '')}`).join('\n')}`);
    }
  } else if (taskIntent.identity && overview) {
    const heading = pageType === 'documentation' ? 'What does this documentation cover?' : `What is ${title}?`;
    paragraphs.push(`## ${heading}\n\n${overview.replace(/[.!?]$/, '')}.`);
    if (pageType === 'documentation') {
      const offerings = evidence
        .filter((item) => normalize(item) !== normalize(overview))
        .slice(0, evidenceBudget(depth))
        .map((item) => item.replace(/[.!?]$/, ''))
        .filter(Boolean);
      if (offerings.length) {
        paragraphs.push(`## What it provides\n\n${offerings.map((item) => `- ${item}`).join('\n')}`);
      }
      const docSections = uniqueRelevant((page.headings || []).map((heading) => safeEvidence(heading).trim()), [], 8);
      if (docSections.length) {
        paragraphs.push(`## Main documentation areas\n\n${docSections.map((section) => `- ${section}`).join('\n')}`);
      }
    }
  } else if (overview) {
    const cleanedOverview = overview.replace(/[.!?]$/, '');
    if (taskIntent.price) paragraphs.push(`## Relevant price information\n\n${cleanedOverview}.`);
    else if (taskIntent.date) paragraphs.push(`## Relevant timing information\n\n${cleanedOverview}.`);
    else paragraphs.push(`## Main overview\n\nThe main point from “${title}” is that ${cleanedOverview}.`);
  } else {
    paragraphs.push(`“${title}” does not contain enough relevant text to give a reliable summary for “${objective}”.`);
  }
  if (evidence.length > 1 && !taskIntent.price && !taskIntent.date && pageType !== 'documentation') {
    const details = evidence.slice(0, 5)
      .filter((detail) => normalize(detail) !== normalize(overview))
      .map((detail) => detail.replace(/[.!?]$/, ''))
      .filter(Boolean);
    if (details.length) paragraphs.push(`## What the page provides\n\n${details.map((detail) => `- ${detail}`).join('\n')}`);
  }
  if (headings.length) {
    paragraphs.push(`## Relevant sections\n\n${headings.map((heading) => `- ${heading}`).join('\n')}`);
  }
  if (links.length) {
    const linkedLabels = links.map((link) => `[[LINK:${link.label}]]`);
    paragraphs.push(`${taskIntent.links ? 'The most useful references are' : 'For additional context, the page links to'} ${linkedLabels.slice(0, -1).join(', ')}${linkedLabels.length > 1 ? `, and ${linkedLabels.at(-1)}` : linkedLabels[0]}.`);
  }
  if (pageUrl) paragraphs.push(`Source: [[LINK:${sourceLabel}]].`);
  return paragraphs.join('\n\n');
}
