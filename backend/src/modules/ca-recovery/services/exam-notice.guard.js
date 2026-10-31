import { CaExamNotice } from '../models/ca-exam-notice.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { CaSchedule } from '../models/ca-schedule.model.js';

/**
 * Pre-send guard for CA exam notifications that carry a guardRef { noticeId, generation, linkId }.
 * A message is sent only while that exact notice generation is still the live schedule for that subject.
 * Cancellation messages carry no guardRef, so they are never blocked by the cancellation they announce.
 */
export async function caNotificationGuard(notification) {
  const ref = notification.guardRef;
  if (!ref?.noticeId) {
    return { ok: true };
  }
  const notice = await CaExamNotice.findById(ref.noticeId).select('status generation');
  if (!notice || notice.status !== 'PUBLISHED') {
    return { ok: false, reason: 'exam_cancelled' };
  }
  if (notice.generation !== Number(ref.generation)) {
    return { ok: false, reason: 'superseded' };
  }
  const link = await CaApplicationSubject.findById(ref.linkId).select('examStatus activeScheduleId');
  if (!link) {
    return { ok: false, reason: 'exam_cancelled' };
  }
  if (link.examStatus === 'COMPLETED') {
    return { ok: false, reason: 'subject_completed' };
  }
  if (link.examStatus === 'RESOLVED') {
    return { ok: false, reason: 'subject_resolved' };
  }
  if (link.examStatus !== 'SCHEDULED' || !link.activeScheduleId) {
    return { ok: false, reason: 'exam_cancelled' };
  }
  const schedule = await CaSchedule.findById(link.activeScheduleId).select('status generation examNoticeId');
  if (
    !schedule ||
    schedule.status !== 'ACTIVE' ||
    schedule.generation !== Number(ref.generation) ||
    String(schedule.examNoticeId) !== String(ref.noticeId)
  ) {
    return { ok: false, reason: 'superseded' };
  }
  return { ok: true };
}
