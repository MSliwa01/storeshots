// `storeshots event <id>`: an In-App Event from store/events/<id>/event.json, created or
// updated in App Store Connect with its copy and media in every locale, and (--submit)
// sent to App Review. Without `confirm` it only returns the plan. Events are matched by
// referenceName; one that is in review, approved or published is not changed.
//
// event.json:
//   referenceName, badge, purpose, priority, deepLink, purchaseRequirement, primaryLocale
//   schedule: { territories: "all" | ["USA", …], publishStart, eventStart, eventEnd }  (ISO times)
//   copy: { "<locale>": { name ≤30, short ≤50, long ≤120 } }
//   media: { card: <file>, details: <file> }: an image or a video, relative to the event's
//     folder; a path may hold {locale} (e.g. "../../output/final/event-card/{locale}", a folder:
//     its first file), or be an object per locale. A locale without its own uses the primary's.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { all, api, appIdOf, sendParts, sleep } from './asc.mjs';
import { device as deviceSpec } from './devices.mjs';
import { CliError, EXIT, usage } from './errors.mjs';
import { hashedName, isVideo, mediaProblems, submitForReview } from './media.mjs';

const BADGES = ['LIVE_EVENT', 'PREMIERE', 'CHALLENGE', 'COMPETITION', 'NEW_SEASON', 'MAJOR_UPDATE', 'SPECIAL_EVENT'];
const PURPOSES = ['APPROPRIATE_FOR_ALL_USERS', 'ATTRACT_NEW_USERS', 'KEEP_ACTIVE_USERS_INFORMED', 'BRING_BACK_LAPSED_USERS'];
const EDITABLE = ['DRAFT', 'READY_FOR_REVIEW', 'REJECTED'];
const LIMITS = { name: 30, short: 50, long: 120 };
const MEDIA = { card: 'event-card', details: 'event-details' };
const DAY = 86400000;

export function eventsDir(store) { return join(store.dir, 'events'); }

/** The events of a project (folders under store/events with an event.json). */
export function listEvents(store) {
  const dir = eventsDir(store);
  return existsSync(dir) ? readdirSync(dir).filter(d => existsSync(join(dir, d, 'event.json'))) : [];
}

/** A media path for one locale → a file (a folder gives its first image or video). */
function mediaFile(base, value, locale) {
  const raw = typeof value === 'object' ? value[locale] : value;
  if (!raw) return null;
  const path = resolve(base, raw.replaceAll('{locale}', locale));
  if (!existsSync(path)) return null;
  if (!statSync(path).isDirectory()) return path;
  const files = readdirSync(path).filter(f => /\.(png|jpe?g|mp4|mov|m4v)$/i.test(f)).sort();
  return files.length ? join(path, files[0]) : null;
}

/** event.json, checked: every problem App Store Connect would raise one at a time, at once. */
export function loadEvent(store, id, { now = Date.now() } = {}) {
  const base = join(eventsDir(store), id), file = join(base, 'event.json');
  if (!existsSync(file)) throw usage(`no event "${id}"`, { fix: `create ${file}${listEvents(store).length ? `, or pick one of: ${listEvents(store).join(', ')}` : ''}` });
  const ev = JSON.parse(readFileSync(file, 'utf8'));
  const errors = [], warnings = [];
  if (!ev.referenceName) errors.push('referenceName is missing');
  if (ev.badge && !BADGES.includes(ev.badge)) errors.push(`badge "${ev.badge}": one of ${BADGES.join(', ')}`);
  if (ev.purpose && !PURPOSES.includes(ev.purpose)) errors.push(`purpose "${ev.purpose}": one of ${PURPOSES.join(', ')}`);
  if (ev.priority && !['HIGH', 'NORMAL'].includes(ev.priority)) errors.push(`priority "${ev.priority}": HIGH or NORMAL`);
  const locales = Object.keys(ev.copy ?? {});
  const primary = ev.primaryLocale ?? locales[0];
  if (!locales.length) errors.push('copy has no locale');
  else if (!ev.copy[primary]) errors.push(`primaryLocale ${primary} has no copy`);
  for (const [locale, c] of Object.entries(ev.copy ?? {})) {
    for (const [field, limit] of Object.entries(LIMITS)) {
      const text = c[field] ?? '';
      if (!text.trim()) errors.push(`${locale}: ${field} is empty`);
      else if ([...text].length > limit) errors.push(`${locale}: ${field} is ${[...text].length} characters, the limit is ${limit} ("${text}")`);
    }
  }
  const s = ev.schedule ?? {}, t = k => Date.parse(s[k]);
  for (const k of ['publishStart', 'eventStart', 'eventEnd']) if (Number.isNaN(t(k))) errors.push(`schedule.${k} is missing or not an ISO time`);
  if (!errors.some(e => e.startsWith('schedule'))) {
    if (t('eventEnd') <= t('eventStart')) errors.push('schedule: eventEnd is not after eventStart');
    if (t('eventEnd') - t('eventStart') > 31 * DAY) errors.push(`schedule: the event runs ${Math.round((t('eventEnd') - t('eventStart')) / DAY)} days, at most 31`);
    if (t('publishStart') > t('eventStart')) errors.push('schedule: publishStart is after eventStart');
    if (t('eventStart') - t('publishStart') > 14 * DAY) errors.push('schedule: publishStart is more than 14 days before eventStart, the App Store shows an event at most 14 days early');
    if (t('eventEnd') < now) errors.push('schedule: the event has already ended');
    else if (t('publishStart') < now) warnings.push('schedule: publishStart is in the past; the event shows as soon as it is approved');
  }
  if (!s.territories || (s.territories !== 'all' && !Array.isArray(s.territories))) errors.push('schedule.territories: "all" or a list of territory codes (USA, POL, …)');

  // Media per locale, checked against the card and details specs.
  const media = {};
  for (const [kind, canvas] of Object.entries(MEDIA)) {
    const spec = deviceSpec(canvas);
    if (!ev.media?.[kind]) { errors.push(`media.${kind} is missing (App Store Connect needs an event ${kind} in every locale)`); continue; }
    for (const locale of locales) {
      const f = mediaFile(base, ev.media[kind], locale) ?? mediaFile(base, ev.media[kind], primary);
      if (!f) { errors.push(`${locale}: no ${kind} file (media.${kind})`); continue; }
      const problems = mediaProblems(spec, f);
      if (problems.length) errors.push(`${locale}: ${kind} ${f}: ${problems.join('; ')}`);
      media[`${locale}/${kind}`] = { file: f, assetType: spec.assetType, ...hashedName(f, `${id}-${kind}`) };
    }
  }
  if (errors.length) {
    throw Object.assign(usage(`events/${id}/event.json: ${errors.length} problem(s)`, { detail: errors.join('\n'), fix: 'fix event.json (limits: name 30, short 50, long 120 characters; up to 31 days; publish at most 14 days early)' }), { result: { errors, warnings } });
  }
  return { id, base, ev, primary, locales, media, warnings };
}

const sameSchedule = (a = [], b = []) => {
  const norm = list => JSON.stringify(list.map(x => ({ t: [...(x.territories ?? [])].sort(), p: Date.parse(x.publishStart), s: Date.parse(x.eventStart), e: Date.parse(x.eventEnd) })));
  return norm(a) === norm(b);
};

async function waitMedia(path, id) {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const st = (await api('GET', `${path}/${id}`)).data.attributes.assetDeliveryState?.state;
    if (st === 'COMPLETE') return;
    if (st === 'FAILED') throw new CliError(`${path.split('/').pop()} ${id} failed processing`, { exit: EXIT.UPLOAD, fix: 'check the file, then rerun' });
    await sleep(4000);
  }
}

export async function event(store, id, { confirm = false, submit = false, log = console.error } = {}) {
  const appId = appIdOf(store);
  const { ev, primary, locales, media, warnings } = loadEvent(store, id);
  for (const w of warnings) log(`warn   ${w}`);
  const territories = ev.schedule.territories === 'all' ? (await all('/v1/territories?limit=200')).map(t => t.id) : ev.schedule.territories;
  const attributes = {
    referenceName: ev.referenceName, badge: ev.badge ?? 'SPECIAL_EVENT', purpose: ev.purpose ?? 'APPROPRIATE_FOR_ALL_USERS', priority: ev.priority ?? 'NORMAL',
    primaryLocale: primary, ...(ev.deepLink ? { deepLink: ev.deepLink } : {}), ...(ev.purchaseRequirement ? { purchaseRequirement: ev.purchaseRequirement } : {}),
    territorySchedules: [{ territories, publishStart: ev.schedule.publishStart, eventStart: ev.schedule.eventStart, eventEnd: ev.schedule.eventEnd }],
  };

  const existing = (await all(`/v1/apps/${appId}/appEvents?limit=200`)).find(e => e.attributes.referenceName === ev.referenceName);
  const state = existing?.attributes.eventState ?? null;
  const result = { app: store.app.name, event: id, referenceName: ev.referenceName, id: existing?.id ?? null, state, applied: confirm, localizations: [], media: [] };
  if (existing && !EDITABLE.includes(state)) {
    log(`${ev.referenceName}: ${state}, locked`);
    throw new CliError(`event "${ev.referenceName}" is ${state} and can no longer change`, { exit: EXIT.UPLOAD, fix: 'give event.json a new referenceName to create a new event' });
  }
  const a = existing?.attributes ?? {};
  const changed = !existing || ['badge', 'purpose', 'priority', 'primaryLocale', 'deepLink', 'purchaseRequirement'].some(k => attributes[k] !== undefined && attributes[k] !== a[k]) || !sameSchedule(attributes.territorySchedules, a.territorySchedules);
  result.action = existing ? (changed ? 'update' : 'unchanged') : 'create';
  log(`${ev.referenceName}: ${result.action}${state ? ` (${state})` : ''}, ${territories.length} territories${confirm ? '' : ' — plan only, add --confirm to apply'}`);

  const locs = existing ? (await api('GET', `/v1/appEvents/${existing.id}/localizations?limit=50`)).data : [];
  const plan = [];
  for (const locale of locales) {
    const c = ev.copy[locale], loc = locs.find(l => l.attributes.locale === locale);
    const text = { name: c.name, shortDescription: c.short, longDescription: c.long };
    const action = !loc ? 'create' : Object.entries(text).some(([k, v]) => loc.attributes[k] !== v) ? 'update' : 'unchanged';
    result.localizations.push({ locale, action });
    const mediaPlan = [];
    for (const kind of Object.keys(MEDIA)) {
      const m = media[`${locale}/${kind}`];
      let current = [];
      if (loc) {
        const shots = (await api('GET', `/v1/appEventLocalizations/${loc.id}/appEventScreenshots?limit=10`)).data.map(x => ({ ...x, path: '/v1/appEventScreenshots' }));
        const clips = (await api('GET', `/v1/appEventLocalizations/${loc.id}/appEventVideoClips?limit=10`)).data.map(x => ({ ...x, path: '/v1/appEventVideoClips' }));
        current = [...shots, ...clips].filter(x => x.attributes.appEventAssetType === m.assetType);
      }
      const same = current.length === 1 && current[0].attributes.fileName === m.name;
      const entry = { locale, kind, file: m.file, action: same ? 'unchanged' : current.length ? 'replace' : 'upload' };
      result.media.push(entry);
      mediaPlan.push({ entry, m, current });
    }
    plan.push({ locale, loc, text, action, mediaPlan });
  }
  const tally = list => Object.entries(list.reduce((o, x) => ({ ...o, [x.action]: (o[x.action] ?? 0) + 1 }), {})).map(([k, v]) => `${v} ${k}`).join(', ');
  log(`  localizations: ${tally(result.localizations)}; media: ${tally(result.media)}`);
  if (!confirm) { result.next = `storeshots event ${id} --confirm${submit ? ' --submit' : ''}`; return result; }

  let eventId = existing?.id;
  if (!existing) {
    eventId = (await api('POST', '/v1/appEvents', { data: { type: 'appEvents', attributes, relationships: { app: { data: { type: 'apps', id: appId } } } } })).data.id;
    result.id = eventId;
    log(`  created event ${eventId}`);
  } else if (changed) {
    const { referenceName, ...rest } = attributes;
    await api('PATCH', `/v1/appEvents/${eventId}`, { data: { type: 'appEvents', id: eventId, attributes: rest } });
  }
  // A new event comes with its primary localization; find it rather than create a twin.
  const fresh = existing ? locs : (await api('GET', `/v1/appEvents/${eventId}/localizations?limit=50`)).data;
  for (const p of plan) {
    let loc = p.loc ?? fresh.find(l => l.attributes.locale === p.locale);
    if (!loc) {
      loc = (await api('POST', '/v1/appEventLocalizations', { data: { type: 'appEventLocalizations', attributes: { locale: p.locale, ...p.text },
        relationships: { appEvent: { data: { type: 'appEvents', id: eventId } } } } })).data;
    } else if (p.action !== 'unchanged' || !p.loc) {
      await api('PATCH', `/v1/appEventLocalizations/${loc.id}`, { data: { type: 'appEventLocalizations', id: loc.id, attributes: p.text } });
    }
    for (const { entry, m, current } of p.mediaPlan) {
      if (entry.action === 'unchanged') continue;
      for (const old of current) await api('DELETE', `${old.path}/${old.id}`);
      const video = isVideo(m.file), type = video ? 'appEventVideoClips' : 'appEventScreenshots', bytes = readFileSync(m.file);
      const reserved = (await api('POST', `/v1/${type}`, { data: { type, attributes: { fileName: m.name, fileSize: bytes.length, appEventAssetType: m.assetType },
        relationships: { appEventLocalization: { data: { type: 'appEventLocalizations', id: loc.id } } } } })).data;
      await sendParts(reserved, bytes, m.name);
      await api('PATCH', `/v1/${type}/${reserved.id}`, { data: { type, id: reserved.id, attributes: { uploaded: true } } });
      await waitMedia(`/v1/${type}`, reserved.id);
      entry.done = true;
      log(`    ${p.locale} ${entry.kind}: uploaded ${m.name}`);
    }
  }
  if (submit) result.submission = await submitForReview(appId, [{ relationship: 'appEvent', type: 'appEvents', id: eventId }], log);
  result.state = (await api('GET', `/v1/appEvents/${eventId}`)).data.attributes.eventState;
  log(`  event ${eventId}: ${result.state}`);
  return result;
}
