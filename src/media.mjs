// Shared by `creative` and `event`: one image or video checked against its canvas's spec,
// a file name that carries the file's hash (so a rerun recognises what App Store Connect
// already has), and sending items to App Review.
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { imageSize } from './assets.mjs';
import { api, ascCodes, md5 } from './asc.mjs';
import { MAX_FILE, sizeFits, videoProblems } from './devices.mjs';
import { CliError, EXIT } from './errors.mjs';
import { probe } from './video.mjs';

export const VIDEO_EXT = ['.mp4', '.mov', '.m4v'];
export const isVideo = file => VIDEO_EXT.includes(extname(file).toLowerCase());

/** What is wrong with `file` for this canvas ([] when App Store Connect will take it). */
export function mediaProblems(spec, file) {
  if (isVideo(file)) return videoProblems(spec, probe(file));
  const ext = extname(file).toLowerCase(), out = [];
  const allowed = spec.image?.ext ?? ['.png', '.jpg', '.jpeg'];
  if (!allowed.includes(ext)) out.push(`${ext} image; ${spec.label} takes ${allowed.join(', ')}`);
  const { width, height, alpha } = imageSize(file);
  if (!sizeFits(spec, width, height)) out.push(`${width}×${height}, needs ${spec.width}×${spec.height}${spec.range ? ` (or ${spec.range.minWidth}–${spec.range.maxWidth} px wide at the same ratio)` : ''}`);
  if (alpha) out.push('has an alpha channel; App Store Connect refuses transparency here');
  if (statSync(file).size > MAX_FILE) out.push('over 500 MB');
  return out;
}

/** "header.png" → "header-3f2a9c01de.png": the first 10 hex of its MD5 in the name. */
export function hashedName(file, prefix) {
  const hash = md5(readFileSync(file)).slice(0, 10), ext = extname(file).toLowerCase();
  return { hash, name: `${prefix ?? basename(file, extname(file))}-${hash}${ext}` };
}

const REVIEW_FIX = {
  'STATE_ERROR.MAX_IN_REVIEW_SUBMISSIONS_PER_PLATFORM_LIMIT_REACHED': 'App Store Connect keeps at most two open review submissions per platform; wait for one to finish, then rerun with --submit',
  'STATE_ERROR.BLOCKED_BY_EMBEDDED_REVIEW': 'this item is already reviewed as part of an app version (placed on it); submitting that version is enough',
  'STATE_ERROR.ASSET_IN_POST_PROCESSING': 'App Store Connect is still processing the file; wait a minute and rerun with --submit',
};

/**
 * Sends items ([{ relationship: 'appEvent'|'appAssetLibraryImage'|'appAssetLibraryVideo', type, id }])
 * to App Review in one new review submission. Returns the submission id.
 */
export async function submitForReview(appId, items, log = console.error) {
  try {
    const submission = (await api('POST', '/v1/reviewSubmissions', {
      data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: appId } } } },
    })).data;
    for (const item of items) {
      await api('POST', '/v1/reviewSubmissionItems', {
        data: { type: 'reviewSubmissionItems', relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
          [item.relationship]: { data: { type: item.type, id: item.id } },
        } },
      });
    }
    await api('PATCH', `/v1/reviewSubmissions/${submission.id}`, { data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } } });
    log(`  submitted ${items.length} item(s) for review (${submission.id})`);
    return submission.id;
  } catch (e) {
    const code = ascCodes(e).find(c => REVIEW_FIX[c]);
    if (code) throw new CliError(`App Review submission refused: ${code}`, { exit: EXIT.UPLOAD, detail: e.detail, fix: REVIEW_FIX[code] });
    throw e;
  }
}
