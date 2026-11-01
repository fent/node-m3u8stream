import { Writable } from 'stream';

export const isSet = <T>(value: T | undefined): value is T =>
  typeof value !== 'undefined';

export interface Item {
  url: string;
  seq: number;
  duration: number;
  time?: number;
  range?: { start: number; end: number };
  init?: boolean;
}

export interface Parser extends Writable {
  on(event: 'item', listener: (item: Item) => boolean): this;
  on(event: string | symbol, listener: (...args: any[]) => any): this;
  emit(event: 'item', item: Item): boolean;
  emit(event: string, ...args: any[]): boolean;
}
