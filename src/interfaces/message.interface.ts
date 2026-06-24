/**
 * The role of the author of a chat message.
 *
 * - `system`: high-level instructions that steer the assistant's behaviour.
 * - `user`: input from the end user.
 * - `assistant`: a previous response produced by the model.
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * A single message in a chat conversation.
 */
export interface Message {
  /** Who authored the message. */
  role: MessageRole;

  /** The textual content of the message. */
  content: string;
}
