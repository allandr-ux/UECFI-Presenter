import terminology from '../../shared/terminology.json';

export type Terminology = typeof terminology;

export function useTerminology(): Terminology {
  return terminology;
}
