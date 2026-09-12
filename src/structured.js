import {safeEvidence} from './security.js';

const FIELD_PATTERNS = {
  date: /\b(date|when|day)\b/i,
  startTime: /\b(start time|starting time|begins?|from what time|time)\b/i,
  endTime: /\b(end time|ending time|until what time|time)\b/i,
  location: /\b(where|location|venue|address)\b/i,
  organizer: /\b(organi[sz]er|host|hosted by|conducted by)\b/i,
  registrationStatus: /\b(registration|register|open|closed|available)\b/i,
  price: /\b(price|cost|fee|ticket)\b/i,
  speakers: /\b(speaker|speakers|panel|guest)\b/i,
  description: /\b(about|overview|describe|description|topic)\b/i,
};

const DATE = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?[,]?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i;
const TIME = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:AM|PM)?\b/i;
const TIME_RANGE = /\b((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:AM|PM)?)\s*(?:-|–|—|to)\s*((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:AM|PM)?)\b/i;

function asText(value) {
  if (!value) return '';
  if (typeof value === 'string') return safeEvidence(value).replace(/\s+/g, ' ').trim();
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
  if (typeof value === 'object') return asText(value.name || value.text || value.address || value.locality || value.streetAddress);
  return '';
}

function jsonLdEvents(jsonLd = []) {
  const values = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    const type = asText(value['@type']).toLowerCase();
    if (type.includes('event')) values.push(value);
    if (value['@graph']) visit(value['@graph']);
  };
  jsonLd.forEach(visit);
  return values;
}

function eventFromJsonLd(value) {
  const location = value.location || {};
  const address = location.address || {};
  return {
    name: asText(value.name),
    description: asText(value.description),
    startDate: asText(value.startDate),
    endDate: asText(value.endDate),
    eventStatus: asText(value.eventStatus),
    location: [asText(location.name), asText(address.streetAddress), asText(address.addressLocality), asText(address.addressRegion)].filter(Boolean).join(', '),
    organizer: asText(value.organizer),
    price: asText(value.offers?.price || value.offers?.lowPrice),
    registrationUrl: asText(value.url),
    confidence: 0.98,
    source: 'json-ld',
  };
}

function requestedFields(objective, pageType) {
  const text = String(objective || '').toLowerCase();
  if (pageType === 'event') {
    const fields = [];
    if (FIELD_PATTERNS.date.test(text)) fields.push('date');
    if (FIELD_PATTERNS.startTime.test(text)) fields.push('startTime');
    if (FIELD_PATTERNS.endTime.test(text)) fields.push('endTime');
    if (FIELD_PATTERNS.location.test(text)) fields.push('location');
    if (FIELD_PATTERNS.organizer.test(text)) fields.push('organizer');
    if (FIELD_PATTERNS.registrationStatus.test(text)) fields.push('registrationStatus');
    if (FIELD_PATTERNS.price.test(text)) fields.push('price');
    if (FIELD_PATTERNS.speakers.test(text)) fields.push('speakers');
    if (FIELD_PATTERNS.description.test(text) || !fields.length) fields.push('description');
    return [...new Set(fields)];
  }
  return FIELD_PATTERNS.description.test(text) ? ['description'] : [];
}

export function detectPageType(page = {}) {
  const url = String(page.url || '');
  const text = `${page.title || ''} ${page.description || ''} ${page.text || ''}`.toLowerCase();
  if (page.pageType === 'github-repository' || /github\.com\/[^/]+\/[^/]+/.test(url)) return 'github-repository';
  if (page.structuredEvents?.length || /event|hackathon|conference|meetup|workshop|registration|attendees/.test(text)) return 'event';
  if (/product|add to cart|buy now|in stock|sku/.test(text)) return 'product';
  if (/documentation|api reference|getting started|installation/.test(text)) return 'documentation';
  if (/booking|reservation|appointment|availability/.test(text)) return 'booking';
  if (/job|salary|apply now|employment/.test(text)) return 'job';
  if (/search results|results for/.test(text)) return 'search-results';
  if (/form|submit|required field/.test(text)) return 'form';
  if (/article|published|by /.test(text)) return 'article';
  return 'generic';
}

function visibleEvent(page) {
  const lines = [...(page.eventLines || []), ...(String(page.text || '').split(/\n+/))].map(asText).filter(Boolean);
  const date = lines.find((line) => DATE.test(line));
  const range = lines.find((line) => TIME_RANGE.test(line));
  const location = lines.find((line) => /\b(location|venue|university|address)\b/i.test(line) && !/navigation/i.test(line));
  const organizer = lines.find((line) => /\b(organized by|organizer|hosted by|presented by)\b/i.test(line));
  return {
    date: date ? {displayValue: date, confidence: 0.9, source: 'visible-event-metadata'} : null,
    time: range ? {displayValue: range.match(TIME_RANGE)[0], confidence: 0.95, source: 'visible-event-metadata'} : null,
    location: location ? {displayValue: location.replace(/^(location|venue|address)\s*[:\-]\s*/i, ''), confidence: 0.85, source: 'visible-event-metadata'} : null,
    organizer: organizer ? {displayValue: organizer, confidence: 0.85, source: 'visible-event-metadata'} : null,
  };
}

function structuredEvent(page) {
  const source = jsonLdEvents(page.jsonLd || []).map(eventFromJsonLd)[0];
  if (!source) return null;
  const date = source.startDate ? {displayValue: source.startDate, normalizedValue: source.startDate, confidence: source.confidence, source: source.source} : null;
  const isoTime = source.startDate?.match(/T(\d{2}:\d{2})/)?.[1];
  const timeValue = isoTime || source.startDate?.match(TIME)?.[0];
  const time = timeValue ? {displayValue: timeValue, confidence: source.confidence, source: source.source} : null;
  return {...source, fields: {date, time, location: source.location ? {displayValue: source.location, confidence: source.confidence, source: source.source} : null, organizer: source.organizer ? {displayValue: source.organizer, confidence: source.confidence, source: source.source} : null}};
}

export function extractStructuredEvidence(page = {}, objective = '') {
  const pageType = detectPageType(page);
  const requested = requestedFields(objective, pageType);
  if (pageType !== 'event' || !requested.length) return {pageType, requestedFields: requested, fields: {}, complete: true, candidates: []};
  const structured = structuredEvent(page);
  const visible = visibleEvent(page);
  const fields = {};
  const choose = (name, structuredValue, visibleValue) => {
    if (structuredValue && visibleValue && structuredValue.displayValue !== visibleValue.displayValue) {
      fields[name] = {...visibleValue, conflict: structuredValue.displayValue, confidence: visibleValue.confidence, source: 'live-visible-preferred'};
    } else fields[name] = structuredValue || visibleValue || null;
  };
  choose('date', structured?.fields?.date, visible.date);
  choose('time', structured?.fields?.time, visible.time);
  choose('location', structured?.fields?.location, visible.location);
  choose('organizer', structured?.fields?.organizer, visible.organizer);
  if (structured?.description) fields.description = {displayValue: structured.description, confidence: structured.confidence, source: structured.source};
  const required = requested.filter((field) => field === 'startTime' || field === 'endTime' ? fields.time : fields[field]);
  return {pageType, requestedFields: requested, fields, complete: required.length === requested.length, candidates: [structured, visible].filter(Boolean)};
}

export function renderStructuredAnswer(structured, objective, sourceLabel = '') {
  const requested = structured.requestedFields;
  const fields = structured.fields;
  if (!requested.length || structured.pageType !== 'event') return null;
  const wantsDateTime = requested.includes('date') && (requested.includes('startTime') || requested.includes('endTime'));
  const date = fields.date?.displayValue;
  const time = fields.time?.displayValue;
  if (wantsDateTime) {
    if (date && time) return `The event is on ${date}, from ${time}.${sourceLabel ? `\n\nSource: [[LINK:${sourceLabel}]].` : ''}`;
    if (date) return `I found the event date as ${date}, but I couldn't verify the event time from the current page.${sourceLabel ? `\n\nSource checked: [[LINK:${sourceLabel}]].` : ''}`;
    if (time) return `I found the event time as ${time}, but I couldn't verify the event date from the current page.${sourceLabel ? `\n\nSource checked: [[LINK:${sourceLabel}]].` : ''}`;
  }
  if (requested.includes('location') && fields.location?.displayValue) return `The event location is ${fields.location.displayValue}.${sourceLabel ? `\n\nSource: [[LINK:${sourceLabel}]].` : ''}`;
  if (requested.includes('organizer') && fields.organizer?.displayValue) return `The event is organized by ${fields.organizer.displayValue}.${sourceLabel ? `\n\nSource: [[LINK:${sourceLabel}]].` : ''}`;
  return null;
}
