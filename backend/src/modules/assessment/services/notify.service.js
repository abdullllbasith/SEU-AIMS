import { User } from '../../authentication/index.js';
import { fanoutNotification } from '../../notifications/index.js';
import { ROLES } from '../../../shared/constants/roles.js';

/** Email and in-app only: WhatsApp is not used for marks workflow messages. */
const CHANNELS = ['IN_APP', 'EMAIL'];

const BODY = {
  CA_MARKS_SUBMITTED:
    'A lecturer submitted CA recovery marks for {{registrationNumber}} ({{subjectCode}}). Verify them and add the ESA mark in the CA workspace.',
  CA_RESULT_PUBLISHED:
    'Your CA recovery result for {{subjectCode}} has been published: {{resultCode}}. Check your results for the official record.',
};

/** Notifies every active administrator of the department that marks are waiting for verification. */
export async function notifyAdminsOfSubmission({ attempt, subjectCode, infrastructure }) {
  const admins = await User.find({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    departmentId: attempt.departmentId,
    accountStatus: 'ACTIVE',
  }).select('_id');
  for (const admin of admins) {
    await fanoutNotification({
      recipientUserId: admin._id,
      type: 'CA_MARKS_SUBMITTED',
      sourceModule: 'assessment',
      sourceId: `${attempt._id}:submitted:${attempt.submittedAt?.getTime() || 0}`,
      departmentId: attempt.departmentId,
      infrastructure,
      actionPath: '/admin/ca',
      channels: CHANNELS,
      vars: {
        bodyTemplate: BODY.CA_MARKS_SUBMITTED,
        registrationNumber: attempt.registrationNumber,
        subjectCode: subjectCode || '',
      },
    });
  }
  return { notified: admins.length };
}

/** Tells the student the official result has changed. */
export async function notifyStudentOfPublication({ attempt, subjectCode, resultCode, infrastructure }) {
  await fanoutNotification({
    recipientUserId: attempt.studentUserId,
    type: 'CA_RESULT_PUBLISHED',
    sourceModule: 'assessment',
    sourceId: `${attempt._id}:published`,
    departmentId: attempt.departmentId,
    infrastructure,
    actionPath: '/ca',
    channels: CHANNELS,
    vars: {
      bodyTemplate: BODY.CA_RESULT_PUBLISHED,
      subjectCode: subjectCode || '',
      resultCode,
    },
  });
}
