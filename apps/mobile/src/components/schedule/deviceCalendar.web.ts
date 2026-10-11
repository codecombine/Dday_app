// 폰 캘린더 읽기 (웹): 지원하지 않는다
import type { ISODate, Repeat } from '@hanjibung/core';

export const DEVICE_CALENDAR_SUPPORTED = false;

export interface DeviceCalendar {
  id: string;
  title: string;
  color: string | null;
  account: string | null;
}

export interface DeviceEvent {
  key: string;
  calendarId: string;
  title: string;
  notes: string;
  allDay: boolean;
  date: ISODate;
  time: string | null;
  endDate: ISODate | null;
  endTime: string | null;
  repeat: Repeat;
}

export async function requestAccess(): Promise<boolean> {
  return false;
}

export async function loadCalendars(): Promise<DeviceCalendar[]> {
  return [];
}

export async function loadEvents(_calendarIds: string[], _from: Date, _to: Date): Promise<DeviceEvent[]> {
  return [];
}
