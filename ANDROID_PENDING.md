# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 10** (commit `3c9980d`, Sep 23 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-10

Build 10 adds the redesigned widget (headings, day groups, sections,
Reschedule, mic) and the phone UI pass (bigger tap targets, Add task at
the top, Week view first in Calendar).

## In the code, not in the app yet

- Nothing yet.

## Known gaps

- None known. Voice, sharing, the widget (its own refresh, Reschedule) and
  arrival reminders need testing on a real phone.
