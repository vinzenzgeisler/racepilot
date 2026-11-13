/** Opens the messages view for one entry, optionally with a prepared subject and text. */
export type MessageSeed = {
  entryId: string;
  subject?: string;
  body?: string;
};
