function decodeBasicHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeSearchText(value) {
  return decodeBasicHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getPersonCompanyName(person = {}) {
  const company = String(person.company || '').trim();
  if (company) return company;
  return String(person.current_company || '').trim();
}

function matchesSearchFields(keyword, values) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return true;
  return values.some(value => normalizeSearchText(value).includes(normalizedKeyword));
}

function matchesPersonSearch(person, keyword) {
  return matchesSearchFields(keyword, [
    person?.name,
    person?.company,
    person?.current_company,
    person?.phone,
    person?.tags,
    person?.skills,
    person?.success_traits,
  ]);
}

function matchesInteractionSearch(interaction, keyword) {
  return matchesSearchFields(keyword, [
    interaction?.person_name,
    interaction?.company,
    interaction?.current_company,
    interaction?.description,
    interaction?.outcome,
    interaction?.follow_result,
    interaction?.next_action,
    interaction?.gift_name,
    interaction?.opportunity_title,
  ]);
}

module.exports = {
  getPersonCompanyName,
  matchesInteractionSearch,
  matchesPersonSearch,
  normalizeSearchText,
};
