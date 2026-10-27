const SOURCE_LABEL = {
  'ca-recovery': 'CA recovery',
  'notices-calendar': 'Calendar',
  notifications: 'Inbox',
  'learning-environment': 'Official resources',
  'lecturer-workspace': 'Teaching workspace',
};

export function attentionSourceLabel(source) {
  return SOURCE_LABEL[source] || '';
}

export function attentionWhen(at) {
  if (!at) {
    return '';
  }
  return new Date(at).toLocaleString();
}
