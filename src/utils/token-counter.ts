import { Message } from '../interfaces/message.interface';

/** Average number of characters per token used by the heuristic estimator. */
const CHARS_PER_TOKEN = 4;

/** Fixed per-message overhead approximating role and formatting tokens. */
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Estimate the number of tokens in a string.
 *
 * This is a fast, dependency-free heuristic (roughly four characters per token)
 * intended for budgeting and cost estimation before a request is sent. When a
 * provider returns exact usage, prefer that for billing. Real per-provider
 * tokenizers can be layered in during a later milestone.
 *
 * @param text The text to measure.
 * @returns The estimated token count.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate the total number of prompt tokens for a list of chat messages,
 * including a small fixed overhead per message for role and formatting tokens.
 *
 * @param messages The conversation history to measure.
 * @returns The estimated total token count.
 */
export function estimateMessageTokens(messages: Message[]): number {
  return messages.reduce(
    (total, message) =>
      total + estimateTokens(message.content) + PER_MESSAGE_OVERHEAD_TOKENS,
    0,
  );
}
