import type { Program, ProgramItem } from '../../shared/types';

export const SAMPLE_LIBRARY_ITEMS: ProgramItem[] = [];

export const INITIAL_PROGRAM: Program = {
  id: 'sunday-service-default',
  name: 'Sunday Morning Worship',
  date: new Date().toISOString().slice(0, 10),
  items: []
};
