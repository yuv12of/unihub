"use client";
/**
 * The server actions as the browser should call them: same names, but a { failed } result from
 * the server becomes a normal Error with the Hebrew message, so try/catch around them works.
 */
import * as A from "@/app/actions";
import type { Failed } from "@/app/actions";
import * as B from "@/app/bookActions";

function w<P extends unknown[], R>(f: (...a: P) => Promise<R>) {
  return async (...a: P): Promise<Exclude<R, Failed>> => {
    const r = await f(...a);
    if (r && typeof r === "object" && "failed" in r) throw new Error(String((r as Failed).failed));
    return r as Exclude<R, Failed>;
  };
}

export const setSessionStatus = w(A.setSessionStatus);
export const addEvent = w(A.addEvent);
export const ensurePushKey = w(A.ensurePushKey);
export const savePushSubscription = w(A.savePushSubscription);
export const sendTestPush = w(A.sendTestPush);
export const reviewCard = w(A.reviewCard);
export const applyUpdate = w(A.applyUpdate);
export const saveOpalFeed = w(A.saveOpalFeed);
export const syncOpalNow = w(A.syncOpalNow);
export const saveGoogleFeed = w(A.saveGoogleFeed);
export const syncGoogleNow = w(A.syncGoogleNow);
export const setAccountStatus = w(A.setAccountStatus);
export const addCourse = w(A.addCourse);
export const updateCourseLook = w(A.updateCourseLook);
export const saveRoutine = w(A.saveRoutine);
export const toggleRoutine = w(A.toggleRoutine);
export const answerRoutine = w(A.answerRoutine);
export const answerInvite = w(A.answerInvite);
export const followUser = w(A.followUser);
export const answerFollow = w(A.answerFollow);
export const saveShare = w(A.saveShare);
export const sendCheer = w(A.sendCheer);
export const setDayOff = w(A.setDayOff);
export const quickAdd = w(A.quickAdd);
export const saveProfile = w(A.saveProfile);
export const saveLook = w(A.saveLook);
export const logStudy = w(A.logStudy);
export const saveReview = w(A.saveReview);
export const addStuck = w(A.addStuck);
export const resolveStuck = A.resolveStuck;

export {
  saveProgress,
  savePrefs,
  saveExams,
  resetFeed,
  deleteEvent,
  markMailRead,
  resetIngestToken,
  removePushSubscription,
  dismissUpdate,
  saveJewish,
  mailHtml,
  removeCourse,
  deleteRoutine,
  shareRoutine,
  inviteToEvent,
  searchPeople,
  unfollow,
  removeFollower,
  markNotificationsRead,
  startStudyLive,
  endStudyLive,
  findCommonSlots,
} from "@/app/actions";
export type * from "@/app/actions";

export const savePlace = w(B.savePlace);
export const markChapterDone = w(B.markChapterDone);
export const setQuestionStatus = w(B.setQuestionStatus);
export const searchMyBooks = w(B.searchMyBooks);
export const deleteBook = w(B.deleteBook);
