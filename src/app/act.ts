"use client";
/**
 * The server actions as the browser should call them: same names, but a { failed } result from
 * the server becomes a normal Error with the Hebrew message, so try/catch around them works.
 */
import * as A from "@/app/actions";
import type { Failed } from "@/app/guard";
import * as B from "@/app/bookActions";
import * as H from "@/app/hobbyActions";

function w<P extends unknown[], R>(f: (...a: P) => Promise<R>) {
  return async (...a: P): Promise<Exclude<R, Failed>> => {
    const r = await f(...a);
    if (r && typeof r === "object" && "failed" in r) throw new Error(String((r as Failed).failed));
    return r as Exclude<R, Failed>;
  };
}

export const setSessionStatus = w(A.setSessionStatus);
export const addEvent = w(A.addEvent);
export const updateEvent = w(A.updateEvent);
export const deleteEvent = w(A.deleteEvent);
export const setSleepIn = w(A.setSleepIn);
export const setRoutineOccurrence = w(A.setRoutineOccurrence);
export const setRoutineTiming = w(A.setRoutineTiming);
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
export const resolveStuck = w(A.resolveStuck);
export const setWatched = w(A.setWatched);
export const saveProgress = w(A.saveProgress);
export const savePrefs = w(A.savePrefs);
export const saveExams = w(A.saveExams);
export const resetFeed = w(A.resetFeed);
export const markMailRead = w(A.markMailRead);
export const resetIngestToken = w(A.resetIngestToken);
export const removePushSubscription = w(A.removePushSubscription);
export const dismissUpdate = w(A.dismissUpdate);
export const saveJewish = w(A.saveJewish);
export const mailHtml = w(A.mailHtml);
export const removeCourse = w(A.removeCourse);
export const deleteRoutine = w(A.deleteRoutine);
export const shareRoutine = w(A.shareRoutine);
export const inviteToEvent = w(A.inviteToEvent);
export const searchPeople = w(A.searchPeople);
export const unfollow = w(A.unfollow);
export const removeFollower = w(A.removeFollower);
export const markNotificationsRead = w(A.markNotificationsRead);
export const startStudyLive = w(A.startStudyLive);
export const endStudyLive = w(A.endStudyLive);
export const findCommonSlots = w(A.findCommonSlots);
export type * from "@/app/actions";

export const savePlace = w(B.savePlace);
export const markChapterDone = w(B.markChapterDone);
export const setQuestionStatus = w(B.setQuestionStatus);
export const searchMyBooks = w(B.searchMyBooks);
export const deleteBook = w(B.deleteBook);

export const createHobby = w(H.createHobby);
export const updateHobby = w(H.updateHobby);
export const deleteHobby = w(H.deleteHobby);
export const logHobby = w(H.logHobby);
export const deleteHobbyLog = w(H.deleteHobbyLog);
export const addHobbyItem = w(H.addHobbyItem);
export const updateHobbyItem = w(H.updateHobbyItem);
export const deleteHobbyItem = w(H.deleteHobbyItem);

import * as Auto from "@/app/autoActions";
export const setSessionStep = w(Auto.setSessionStep);
export const saveIfThen = w(Auto.saveIfThen);
export const setIfThenActive = w(Auto.setIfThenActive);
export const deleteIfThen = w(Auto.deleteIfThen);
export const markPracticeSeen = w(Auto.markPracticeSeen);

import * as P from "@/app/practiceActions";
export const recordAttempt = w(P.recordAttempt);
export const getPretest = w(P.getPretest);
export const markPretest = w(P.markPretest);
export const getAskContext = w(P.getAskContext);
export const saveStuckQuestion = w(P.saveStuckQuestion);
export const stuckFromQuestion = w(P.stuckFromQuestion);

export const acceptExamCandidate = w(Auto.acceptExamCandidate);
export const dismissExamCandidate = w(Auto.dismissExamCandidate);

import * as Plan from "@/app/planActions";
export const saveCourseExams = w(Plan.saveCourseExams);
export const addPastExam = w(Plan.addPastExam);
export const deletePastExam = w(Plan.deletePastExam);
export const startMock = w(Plan.startMock);
export const finishMock = w(Plan.finishMock);
export const setQuestionCount = w(Plan.setQuestionCount);
export const setQuestionState = w(Plan.setQuestionState);
export const toggleCheck = w(Plan.toggleCheck);

import * as Check from "@/app/checkActions";
export const saveDayCheck = w(Check.saveDayCheck);
export const setRhythmOff = w(Check.setRhythmOff);

import * as Meet from "@/app/meetupActions";
export const saveMeetupNote = w(Meet.saveMeetupNote);
export const setMeetupAttended = w(Meet.setMeetupAttended);
export const setMeetupAsked = w(Meet.setMeetupAsked);
export const meetupQuestionsToStuck = w(Meet.meetupQuestionsToStuck);
export const saveMeetupLinks = w(Meet.saveMeetupLinks);
