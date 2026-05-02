import { Schema, type, ArraySchema } from '@colyseus/schema';

export class ChainLinkSchema extends Schema {
  @type('int32') index = 0;
  @type('string') playerId = '';
  @type('string') cardInstanceId = '';
  @type('int8') spellSpeed: 1 | 2 | 3 = 1;
  @type(['string']) targets = new ArraySchema<string>();
  @type('boolean') resolved = false;
  @type('string') resultMessage = '';
}
